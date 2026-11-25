"""The on-disk index (SQLite) and the indexing process."""
import concurrent.futures as cf
import os
import sqlite3
import time
import zlib
from array import array
from collections import defaultdict

from . import extract as ex
from .textutil import tokenize

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
def process_file(path):
    """Runs in a worker process: extract + tokenize one file."""
    try:
        text = ex.extract(path)
    except Exception as e:  # noqa: BLE001 - any failure is recorded per file
        msg = str(e) or e.__class__.__name__
        return path, None, msg[:300]
    text = text.replace("\x00", "")
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


# ------------------------------------------------------------ indexer
class Indexer:
    def __init__(self, db_path, progress=None, cancel_event=None, workers=None):
        self.db_path = db_path
        self.progress = progress or (lambda **kw: None)
        self.cancel = cancel_event
        self.workers = workers or max(1, (os.cpu_count() or 2) - 1)
        self.term_ids = None

    def cancelled(self):
        return self.cancel is not None and self.cancel.is_set()

    # -- folder management (static helpers usable from UI)
    @staticmethod
    def add_folder(con, path):
        path = os.path.normpath(os.path.abspath(path))
        con.execute("INSERT OR IGNORE INTO folders(path) VALUES(?)", (path,))
        con.commit()

    @staticmethod
    def remove_folder(con, folder_id):
        ids = [r[0] for r in con.execute("SELECT id FROM files WHERE folder_id=?", (folder_id,))]
        _delete_files(con, ids)
        con.execute("DELETE FROM folders WHERE id=?", (folder_id,))
        con.commit()

    # -- scanning
    def _scan(self, root):
        found = {}
        limit = MAX_FILE_MB * 1024 * 1024
        for dirpath, dirnames, filenames in os.walk(root):
            if self.cancelled():
                return found
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
                    continue
                if st.st_size > limit:
                    continue
                found[full] = (st.st_mtime, st.st_size, ext)
            self.progress(phase="scan", path=dirpath, found=len(found))
        return found

    def _term_id(self, con, term):
        tid = self.term_ids.get(term)
        if tid is None:
            cur = con.execute("INSERT INTO terms(term) VALUES(?)", (term,))
            tid = cur.lastrowid
            self.term_ids[term] = tid
        return tid

    def run(self, folder_ids=None):
        """Bring the index up to date for the given folders (default: all)."""
        con = connect(self.db_path)
        try:
            return self._run(con, folder_ids)
        finally:
            con.close()

    def _run(self, con, folder_ids):
        folders = con.execute("SELECT id, path FROM folders").fetchall()
        if folder_ids is not None:
            folders = [f for f in folders if f[0] in folder_ids]
        todo = []  # (folder_id, path, mtime, size, ext)
        removed = 0
        for fid, root in folders:
            self.progress(phase="scan", path=root, found=0)
            on_disk = self._scan(root)
            if self.cancelled():
                return {"cancelled": True}
            known = {p: (i, m, s) for i, p, m, s in con.execute(
                "SELECT id, path, mtime, size FROM files WHERE folder_id=?", (fid,))}
            gone = [v[0] for p, v in known.items() if p not in on_disk]
            if gone:
                _delete_files(con, gone)
                removed += len(gone)
            for p, (m, s, e) in on_disk.items():
                k = known.get(p)
                if k is None or k[1] != m or k[2] != s:
                    todo.append((fid, p, m, s, e))
        con.commit()

        total = len(todo)
        self.progress(phase="index", done=0, total=total, path="")
        if not total:
            return {"indexed": 0, "removed": removed, "errors": 0}

        self.term_ids = dict(con.execute("SELECT term, id FROM terms"))
        info = {p: (fid, m, s, e) for fid, p, m, s, e in todo}
        done = errors = 0
        last_commit = time.time()
        pending = iter(todo)
        in_flight = {}

        def new_pool():
            return cf.ProcessPoolExecutor(max_workers=self.workers)

        pool = new_pool()
        try:
            def fill():
                while len(in_flight) < self.workers * 3:
                    item = next(pending, None)
                    if item is None:
                        return
                    fut = pool.submit(process_file, item[1])
                    in_flight[fut] = item[1]

            fill()
            while in_flight:
                if self.cancelled():
                    break
                finished, _ = cf.wait(in_flight, timeout=0.5,
                                      return_when=cf.FIRST_COMPLETED)
                broken = False
                for fut in finished:
                    path = in_flight.pop(fut)
                    try:
                        _, payload, err = fut.result()
                    except Exception as e:  # noqa: BLE001 - worker crashed
                        payload, err = None, f"קריסה בקריאת הקובץ ({e.__class__.__name__})"
                        broken = True
                    self._store(con, path, info[path], payload, err)
                    done += 1
                    errors += err is not None
                    self.progress(phase="index", done=done, total=total, path=path)
                if broken:
                    # A crashed worker breaks the whole pool: record the files
                    # that were in flight as failed and start a fresh pool.
                    for fut, path in list(in_flight.items()):
                        self._store(con, path, info[path], None, "נכשל (קריסת תהליך)")
                        done += 1
                        errors += 1
                    in_flight.clear()
                    pool.shutdown(wait=False, cancel_futures=True)
                    pool = new_pool()
                if time.time() - last_commit > 3:
                    con.commit()
                    last_commit = time.time()
                fill()
        finally:
            pool.shutdown(wait=False, cancel_futures=True)
            con.commit()
        return {"indexed": done, "removed": removed, "errors": errors,
                "cancelled": self.cancelled()}

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
