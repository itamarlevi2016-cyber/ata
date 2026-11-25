"""The on-disk index (SQLite) and the indexing process."""
import concurrent.futures as cf
from concurrent.futures.process import BrokenProcessPool
import multiprocessing
import os
import sqlite3
import sys
import time
import zlib
from array import array
from collections import defaultdict, deque

from . import extract as ex
from .textutil import clean_text, tokenize

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS folders(
    id INTEGER PRIMARY KEY, path TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS files(
    id INTEGER PRIMARY KEY,
    folder_id INTEGER NOT NULL,
    path TEXT UNIQUE NOT NULL,
    ext TEXT, mtime REAL, size INTEGER,
    error TEXT,
    ntok INTEGER DEFAULT 0,
    text BLOB, offs BLOB);
CREATE INDEX IF NOT EXISTS files_folder ON files(folder_id);
CREATE TABLE IF NOT EXISTS terms(
    id INTEGER PRIMARY KEY, term TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS postings(
    term_id INTEGER NOT NULL, file_id INTEGER NOT NULL, pos BLOB NOT NULL,
    PRIMARY KEY(term_id, file_id)) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS postings_file ON postings(file_id);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
"""

SKIP_DIRS = {"$recycle.bin", "system volume information", ".git", ".svn",
             "node_modules", "__pycache__", ".venv", "venv", "appdata"}
MAX_FILE_MB = 200
FILE_TIMEOUT_S = 120          # a single file may not take longer than this
MAX_TEXT_CHARS = 60_000_000   # cap on extracted text per file

IS_WINDOWS = sys.platform.startswith("win")
# Windows file attributes of cloud-only (OneDrive etc.) placeholder files.
# Reading them would download them, so they are skipped.
_CLOUD_ATTRS = 0x1000 | 0x40000 | 0x400000  # OFFLINE | RECALL_ON_OPEN | RECALL_ON_DATA_ACCESS

ERR_CRASH = "נכשל: התוכנה קרסה בקריאת הקובץ"
ERR_TIMEOUT = f"נכשל: הקריאה נמשכה יותר מ-{FILE_TIMEOUT_S} שניות"


def long_path(p):
    """Windows: allow paths longer than 260 characters."""
    if not IS_WINDOWS or p.startswith("\\\\?\\"):
        return p
    p = os.path.abspath(p)
    if p.startswith("\\\\"):
        return "\\\\?\\UNC\\" + p[2:]
    return "\\\\?\\" + p


def short_path(p):
    if p.startswith("\\\\?\\UNC\\"):
        return "\\\\" + p[8:]
    if p.startswith("\\\\?\\"):
        return p[4:]
    return p


# ------------------------------------------------------------ blob encoding
def pack_ints(arr: array) -> bytes:
    raw = arr.tobytes()
    if len(raw) > 64:
        return b"\x01" + zlib.compress(raw, 1)
    return b"\x00" + raw


def unpack_ints(blob: bytes) -> array:
    a = array("I")
    data = blob[1:]
    if blob[:1] == b"\x01":
        data = zlib.decompress(data)
    a.frombytes(data)
    return a


def connect(db_path):
    con = sqlite3.connect(db_path, timeout=30, check_same_thread=False)
    con.executescript(SCHEMA)
    con.execute("PRAGMA synchronous=NORMAL")
    con.execute("PRAGMA cache_size=-65536")
    return con


# ------------------------------------------------------------ worker (subprocess)
def _worker_init():
    """Run workers at low priority so the computer stays responsive."""
    try:
        if IS_WINDOWS:
            import ctypes
            ctypes.windll.kernel32.SetPriorityClass(
                ctypes.windll.kernel32.GetCurrentProcess(), 0x4000)  # BELOW_NORMAL
        else:
            os.nice(10)
    except Exception:  # noqa: BLE001 - priority is best effort
        pass


def process_file(path):
    """Runs in a worker process: extract + tokenize one file."""
    if os.environ.get("MECHAPES_TEST_HOOK"):  # used by the tests only
        name = os.path.basename(path)
        if "__hang__" in name:
            time.sleep(3600)
        if "__crash__" in name:
            os._exit(3)
    try:
        text = ex.extract(long_path(path))
    except Exception as e:  # noqa: BLE001 - any failure is recorded per file
        msg = str(e) or e.__class__.__name__
        return path, None, msg[:300]
    text = clean_text(text[:MAX_TEXT_CHARS])
    terms, starts, ends = tokenize(text)
    post = defaultdict(lambda: array("I"))
    for i, t in enumerate(terms):
        post[t].append(i)
    offs = array("I", starts)
    offs.extend(ends)
    payload = (
        zlib.compress(text.encode("utf-8"), 6),
        pack_ints(offs),
        len(terms),
        {t: pack_ints(p) for t, p in post.items()},
    )
    return path, payload, None


def _kill_pool(pool):
    """Stop a process pool now, including workers stuck on a file."""
    procs = list((getattr(pool, "_processes", None) or {}).values())
    for p in procs:
        try:
            p.terminate()
        except Exception:  # noqa: BLE001
            pass
    pool.shutdown(wait=False, cancel_futures=True)
    for p in procs:
        try:
            p.join(2)
        except Exception:  # noqa: BLE001
            pass


def _under(path, dirs):
    return any(path == d or path.startswith(d.rstrip("\\/") + os.sep) for d in dirs)


# ------------------------------------------------------------ folder management
def add_folder(con, path):
    """Add a folder. Returns a message for the user, or None on success.
    A folder inside an existing one is refused; existing folders inside the
    new one are merged into it (their files are kept)."""
    path = os.path.normpath(os.path.abspath(path))
    rows = con.execute("SELECT id, path FROM folders").fetchall()
    for fid, p in rows:
        if os.path.normcase(p) == os.path.normcase(path):
            return "התיקייה כבר נמצאת במאגר."
        if _under(os.path.normcase(path), [os.path.normcase(p)]):
            return f"התיקייה כבר כלולה בתיקייה שבמאגר:\n{p}"
    cur = con.execute("INSERT INTO folders(path) VALUES(?)", (path,))
    new_id = cur.lastrowid
    for fid, p in rows:
        if _under(os.path.normcase(p), [os.path.normcase(path)]):
            con.execute("UPDATE files SET folder_id=? WHERE folder_id=?", (new_id, fid))
            con.execute("DELETE FROM folders WHERE id=?", (fid,))
    con.commit()
    return None


def remove_folder(con, folder_id):
    ids = [r[0] for r in con.execute("SELECT id FROM files WHERE folder_id=?", (folder_id,))]
    _delete_files(con, ids)
    con.execute("DELETE FROM folders WHERE id=?", (folder_id,))
    con.commit()


# ------------------------------------------------------------ indexer
class Indexer:
    # kept as static methods for backward compatibility
    add_folder = staticmethod(lambda con, path: add_folder(con, path))
    remove_folder = staticmethod(remove_folder)

    def __init__(self, db_path, progress=None, cancel_event=None, workers=None,
                 timeout=FILE_TIMEOUT_S):
        self.timeout = timeout
        self.db_path = db_path
        self.progress = progress or (lambda **kw: None)
        self.cancel = cancel_event
        self.workers = workers or max(1, min(8, (os.cpu_count() or 2) - 1))
        self.term_ids = {}

    def cancelled(self):
        return self.cancel is not None and self.cancel.is_set()

    # -- scanning
    def _scan(self, root):
        """Returns (found, failed_dirs, cloud_only) or None if root is offline."""
        if not os.path.isdir(long_path(root)):
            return None
        found, failed, cloud = {}, [], 0
        limit = MAX_FILE_MB * 1024 * 1024

        def onerror(err):
            failed.append(short_path(getattr(err, "filename", "") or ""))

        for dirpath, dirnames, filenames in os.walk(long_path(root), onerror=onerror):
            if self.cancelled():
                return found, failed, cloud
            dirnames[:] = [d for d in dirnames
                           if d.lower() not in SKIP_DIRS and not d.startswith(".")]
            for fn in filenames:
                if fn.startswith("~$"):
                    continue  # Office lock/temp files
                ext = os.path.splitext(fn)[1].lower()
                if ext not in ex.SUPPORTED_EXT:
                    continue
                full = os.path.join(dirpath, fn)
                try:
                    st = os.stat(full)
                except OSError:
                    failed.append(short_path(full))
                    continue
                if getattr(st, "st_file_attributes", 0) & _CLOUD_ATTRS:
                    cloud += 1
                    continue
                if st.st_size > limit:
                    continue
                found[short_path(full)] = (st.st_mtime, st.st_size, ext)
            self.progress(phase="scan", path=short_path(dirpath), found=len(found))
        return found, [f for f in failed if f], cloud

    def _term_id(self, con, term):
        tid = self.term_ids.get(term)
        if tid is None:
            row = con.execute("SELECT id FROM terms WHERE term=?", (term,)).fetchone()
            tid = row[0] if row else con.execute(
                "INSERT INTO terms(term) VALUES(?)", (term,)).lastrowid
            self.term_ids[term] = tid
        return tid

    def run(self, folder_ids=None, retry_errors=False):
        """Bring the index up to date for the given folders (default: all)."""
        con = connect(self.db_path)
        try:
            return self._run(con, folder_ids, retry_errors)
        finally:
            con.close()

    def _run(self, con, folder_ids, retry_errors):
        folders = con.execute("SELECT id, path FROM folders").fetchall()
        if folder_ids is not None:
            folders = [f for f in folders if f[0] in folder_ids]
        todo = []  # (folder_id, path, mtime, size, ext)
        removed = cloud_total = 0
        offline = []
        for fid, root in folders:
            self.progress(phase="scan", path=root, found=0)
            scan = self._scan(root)
            if self.cancelled():
                return {"cancelled": True}
            if scan is None:  # drive unplugged / network offline: keep its index
                offline.append(root)
                continue
            on_disk, failed_dirs, cloud = scan
            cloud_total += cloud
            known = {p: (i, m, s, e) for i, p, m, s, e in con.execute(
                "SELECT id, path, mtime, size, error FROM files WHERE folder_id=?", (fid,))}
            gone = [v[0] for p, v in known.items()
                    if p not in on_disk and not _under(p, failed_dirs)]
            if gone:
                _delete_files(con, gone)
                removed += len(gone)
            for p, (m, s, e) in on_disk.items():
                k = known.get(p)
                if (k is None or k[1] != m or k[2] != s
                        or (retry_errors and k[3] is not None)):
                    todo.append((fid, p, m, s, e))
        con.commit()

        result = {"indexed": 0, "removed": removed, "errors": 0,
                  "offline": offline, "cloud": cloud_total, "cancelled": False}
        total = len(todo)
        self.progress(phase="index", done=0, total=total, path="")
        if not total:
            return result
        if total > 200:  # bulk run: preload the vocabulary
            self.term_ids = dict(con.execute("SELECT term, id FROM terms"))
        info = {p: (fid, m, s, e) for fid, p, m, s, e in todo}
        state = {"done": 0, "errors": 0}

        def store(path, payload, err):
            self._store(con, path, info[path], payload, err)
            state["done"] += 1
            state["errors"] += err is not None
            self.progress(phase="index", done=state["done"], total=total, path=path)

        self._process(todo, store, con)
        con.commit()
        result.update(indexed=state["done"], errors=state["errors"],
                      cancelled=self.cancelled())
        return result

    def _process(self, todo, store, con):
        """Run process_file over all paths in worker processes.
        - each worker gets one file at a time, so a stuck file is detected
          after FILE_TIMEOUT_S and its worker is killed;
        - after a crash or a timeout, the other files that were in progress
          are retried one at a time, so only the guilty file is marked."""
        pending = deque(p for _, p, *_ in todo)
        solo = deque()        # suspects, processed alone
        in_flight = {}        # future -> (path, start_time, is_solo)
        last_commit = time.time()
        pool = self._new_pool()
        try:
            while pending or solo or in_flight:
                if self.cancelled():
                    break
                # submit work (the pool may break between two checks if a
                # worker crashed; then the file goes back and the pool restarts)
                restart = False
                try:
                    if solo:
                        if not in_flight:
                            path = solo[0]
                            in_flight[pool.submit(process_file, path)] = (path, time.time(), True)
                            solo.popleft()
                    else:
                        while pending and len(in_flight) < self.workers:
                            path = pending[0]
                            in_flight[pool.submit(process_file, path)] = (path, time.time(), False)
                            pending.popleft()
                except BrokenProcessPool:
                    restart = True

                finished, _ = cf.wait(in_flight, timeout=0.5, return_when=cf.FIRST_COMPLETED)
                for fut in finished:
                    path, _, is_solo = in_flight.pop(fut)
                    try:
                        _, payload, err = fut.result()
                        store(path, payload, err)
                    except Exception:  # noqa: BLE001 - worker process died
                        restart = True
                        if is_solo:
                            store(path, None, ERR_CRASH)
                        else:
                            solo.append(path)
                # time-outs
                now = time.time()
                for fut, (path, start, is_solo) in list(in_flight.items()):
                    if now - start > self.timeout and not fut.done():
                        restart = True
                        del in_flight[fut]
                        if is_solo:
                            store(path, None, ERR_TIMEOUT)
                        else:
                            solo.append(path)
                if restart:
                    # retry everything that was still running, one by one
                    for fut, (path, _, _) in in_flight.items():
                        solo.append(path)
                    in_flight.clear()
                    _kill_pool(pool)
                    pool = self._new_pool()
                if time.time() - last_commit > 3:
                    con.commit()
                    last_commit = time.time()
        finally:
            _kill_pool(pool)

    def _new_pool(self):
        # "spawn" everywhere: same behaviour as on Windows, and safe to start
        # from the GUI's background thread.
        return cf.ProcessPoolExecutor(max_workers=self.workers, initializer=_worker_init,
                                      mp_context=multiprocessing.get_context("spawn"))

    def _store(self, con, path, meta, payload, err):
        fid, mtime, size, ext = meta
        row = con.execute("SELECT id FROM files WHERE path=?", (path,)).fetchone()
        if row:
            con.execute("DELETE FROM postings WHERE file_id=?", (row[0],))
        if payload is None:
            con.execute(
                "INSERT INTO files(folder_id,path,ext,mtime,size,error,ntok,text,offs) "
                "VALUES(?,?,?,?,?,?,0,NULL,NULL) ON CONFLICT(path) DO UPDATE SET "
                "folder_id=excluded.folder_id, ext=excluded.ext, mtime=excluded.mtime, "
                "size=excluded.size, error=excluded.error, ntok=0, text=NULL, offs=NULL",
                (fid, path, ext, mtime, size, err))
            return
        text_z, offs, ntok, post = payload
        con.execute(
            "INSERT INTO files(folder_id,path,ext,mtime,size,error,ntok,text,offs) "
            "VALUES(?,?,?,?,?,NULL,?,?,?) ON CONFLICT(path) DO UPDATE SET "
            "folder_id=excluded.folder_id, ext=excluded.ext, mtime=excluded.mtime, "
            "size=excluded.size, error=NULL, ntok=excluded.ntok, text=excluded.text, "
            "offs=excluded.offs",
            (fid, path, ext, mtime, size, ntok, text_z, offs))
        file_id = con.execute("SELECT id FROM files WHERE path=?", (path,)).fetchone()[0]
        con.executemany(
            "INSERT OR REPLACE INTO postings(term_id,file_id,pos) VALUES(?,?,?)",
            [(self._term_id(con, t), file_id, p) for t, p in post.items()])


def _delete_files(con, ids):
    for i in range(0, len(ids), 500):
        chunk = ids[i:i + 500]
        q = ",".join("?" * len(chunk))
        con.execute(f"DELETE FROM postings WHERE file_id IN ({q})", chunk)
        con.execute(f"DELETE FROM files WHERE id IN ({q})", chunk)


def load_file_text(con, file_id):
    row = con.execute("SELECT text, offs FROM files WHERE id=?", (file_id,)).fetchone()
    if not row or row[0] is None:
        return "", array("I"), array("I")
    text = zlib.decompress(row[0]).decode("utf-8")
    offs = unpack_ints(row[1])
    n = len(offs) // 2
    return text, offs[:n], offs[n:]
