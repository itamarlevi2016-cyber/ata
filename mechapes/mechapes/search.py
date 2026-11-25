"""Query parsing, term lookup and proximity ("skip") matching."""
import re
from bisect import bisect_left
from dataclasses import dataclass, field

from .index import unpack_ints
from .textutil import (_INNER_QUOTES, _MARKS, HEB_PREFIX_LETTERS, MAX_PREFIX_LEN,
                       clean_text, is_hebrew_word, normalize_word, prefix_variants)

MODE_ALL = "all"        # all words anywhere in the file
MODE_NEAR = "near"      # up to N words between each pair of words
MODE_PHRASE = "phrase"  # exact phrase (consecutive words, in order)

MAX_RESULTS = 5000
MAX_MATCHES_PER_FILE = 500


@dataclass
class Slot:
    alts: list                      # normalized alternatives (may contain * ?)
    term_ids: set = field(default_factory=set)
    terms: list = field(default_factory=list)  # matched index terms (for display)


@dataclass
class Query:
    slots: list
    excludes: list


@dataclass
class Result:
    file_id: int
    path: str
    mtime: float
    size: int
    matches: list   # list of tuples of token positions (None = not computed yet)


class QueryError(Exception):
    pass


# A query word: like an index token, plus the wildcards * and ?
_QWORD_RE = re.compile(
    rf"[\w*?{_MARKS}]+(?:[{_INNER_QUOTES}][\w*?{_MARKS}]+)*", re.UNICODE)


def _query_words(text):
    """Split like the indexer does: בית-ספר -> בית, ספר ; ע.נ. -> ע, נ"""
    out = []
    for m in _QWORD_RE.finditer(text):
        n = normalize_word(m.group())
        if n.strip("*?"):
            out.append(n)
    return out


def parse_query(q: str) -> Query:
    """Words separated by spaces; | separates alternatives; -word excludes."""
    q = clean_text(q)
    slots, excludes = [], []
    for raw in q.split():
        neg = raw.startswith("-") and len(raw) > 1
        if neg:
            raw = raw[1:]
        parts = [_query_words(a) for a in raw.split("|")]
        parts = [p for p in parts if p]
        if not parts:
            continue
        target = excludes if neg else slots
        if len(parts) == 1:
            # one written word that splits into several (בית-ספר): consecutive slots
            target.extend(Slot([w]) for w in parts[0])
        else:
            target.append(Slot([w for p in parts for w in p]))
    if not slots:
        raise QueryError("לא הוזנו מילים לחיפוש")
    return Query(slots, excludes)


def _glob_to_re(pat):
    return "".join(".*" if c == "*" else "." if c == "?" else re.escape(c) for c in pat)


def resolve_slot(con, slot: Slot, strip_prefixes: bool):
    ids, terms = set(), []
    for alt in slot.alts:
        wildcard = "*" in alt or "?" in alt
        heb = strip_prefixes and is_hebrew_word(alt.replace("*", "").replace("?", ""))
        if not wildcard:
            cands = prefix_variants(alt) if heb else [alt]
            for i in range(0, len(cands), 500):
                chunk = cands[i:i + 500]
                q = ",".join("?" * len(chunk))
                for tid, term in con.execute(
                        f"SELECT id, term FROM terms WHERE term IN ({q})", chunk):
                    ids.add(tid)
                    terms.append(term)
            continue
        glob = alt.replace("[", "[[]")
        if heb:
            rx = re.compile(f"[{HEB_PREFIX_LETTERS}]{{0,{MAX_PREFIX_LEN}}}"
                            + _glob_to_re(alt) + r"\Z")
            rows = con.execute("SELECT id, term FROM terms WHERE term GLOB ?",
                               ("*" + glob,))
            for tid, term in rows:
                if rx.match(term):
                    ids.add(tid)
                    terms.append(term)
        else:
            for tid, term in con.execute(
                    "SELECT id, term FROM terms WHERE term GLOB ?", (glob,)):
                ids.add(tid)
                terms.append(term)
    slot.term_ids, slot.terms = ids, terms


def _files_with(con, term_ids):
    out = set()
    ids = list(term_ids)
    for i in range(0, len(ids), 500):
        chunk = ids[i:i + 500]
        q = ",".join("?" * len(chunk))
        out.update(r[0] for r in con.execute(
            f"SELECT DISTINCT file_id FROM postings WHERE term_id IN ({q})", chunk))
    return out


def _positions(con, file_ids, term_ids):
    """{file_id: sorted positions} for a slot over the given files."""
    out = {}
    tids = list(term_ids)
    fids = list(file_ids)
    if len(tids) > 400:  # many wildcard terms: filter term ids in Python
        tset = set(tids)
        for i in range(0, len(fids), 400):
            chunk = fids[i:i + 400]
            q = ",".join("?" * len(chunk))
            for tid, fid, blob in con.execute(
                    f"SELECT term_id, file_id, pos FROM postings WHERE file_id IN ({q})", chunk):
                if tid in tset:
                    out.setdefault(fid, []).extend(unpack_ints(blob))
    else:
        tq = ",".join("?" * len(tids))
        for i in range(0, len(fids), 400):
            chunk = fids[i:i + 400]
            q = ",".join("?" * len(chunk))
            for fid, blob in con.execute(
                    f"SELECT file_id, pos FROM postings WHERE term_id IN ({tq}) "
                    f"AND file_id IN ({q})", tids + chunk):
                out.setdefault(fid, []).extend(unpack_ints(blob))
    for fid in out:
        out[fid] = sorted(set(out[fid]))
    return out


# ------------------------------------------------------------ proximity
def match_ordered(plist, gap):
    """plist: per-slot sorted positions. Find sequences p0<p1<...<pk-1 with at
    most `gap` words between consecutive ones. Returns list of tuples."""
    k = len(plist)
    prev_reach = plist[0]
    preds = []  # preds[i][j]: chosen predecessor for plist[i+1][j]
    for i in range(1, k):
        reach, pred = [], {}
        for p in plist[i]:
            j = bisect_left(prev_reach, p) - 1  # largest reachable r < p
            if j >= 0 and p - prev_reach[j] - 1 <= gap:
                reach.append(p)
                pred[p] = prev_reach[j]
        if not reach:
            return []
        preds.append(pred)
        prev_reach = reach
    matches = []
    for end in prev_reach:
        seq = [end]
        for pred in reversed(preds):
            seq.append(pred[seq[-1]])
        matches.append(tuple(reversed(seq)))
    return matches


def match_unordered(plist, gap, max_states=200_000):
    """Like match_ordered, but the words may come in any order: find chains of
    distinct positions p0<p1<... that use every slot once, with at most `gap`
    words between consecutive ones. Dynamic programming over (slots used,
    last position)."""
    k = len(plist)
    full = (1 << k) - 1
    events = sorted((p, i) for i, ps in enumerate(plist) for p in ps)
    # states ending at a position: pos -> {mask: predecessor (mask, pos) or None}
    recent = []          # list of (pos, {mask: pred}) within reach
    found = []
    n_states = 0
    by_pos = {}
    for p, i in events:
        bit = 1 << i
        cur = by_pos.setdefault(p, {})
        if not cur:
            recent.append((p, cur))
        # drop positions that are too far behind
        while recent and recent[0][0] < p - gap - 1:
            recent.pop(0)
        cur.setdefault(bit, None)
        for q, states in recent:
            if q >= p:
                break
            for mask in list(states):
                if not mask & bit and (mask | bit) not in cur:
                    cur[mask | bit] = (mask, q)
                    n_states += 1
        if n_states > max_states:
            break
    for p, states in by_pos.items():
        if full in states:
            seq, mask, pos = [p], full, p
            while states_pred := by_pos[pos].get(mask):
                mask, pos = states_pred
                seq.append(pos)
            found.append(tuple(reversed(seq)))
    return sorted(found)


def _non_overlapping(matches):
    out, last_end = [], -1
    for m in sorted(matches, key=lambda m: (m[0], m[-1])):
        if m[0] > last_end:
            out.append(m)
            last_end = m[-1]
    return out


# ------------------------------------------------------------ main entry
def run_search(con, query_text, mode=MODE_ALL, gap=5, ordered=True,
               strip_prefixes=True, folder_ids=None, exts=None, name_filter=""):
    query = parse_query(query_text)
    for s in query.slots + query.excludes:
        resolve_slot(con, s, strip_prefixes)

    missing = [" | ".join(s.alts) for s in query.slots if not s.term_ids]
    if missing:
        return [], query, missing

    # Rarest slot first keeps the candidate set small.
    candidates = None
    for s in sorted(query.slots, key=lambda s: len(s.term_ids)):
        files = _files_with(con, s.term_ids)
        candidates = files if candidates is None else candidates & files
        if not candidates:
            return [], query, []
    for s in query.excludes:
        if s.term_ids:
            candidates -= _files_with(con, s.term_ids)

    meta = {}
    fids = list(candidates)
    for i in range(0, len(fids), 500):
        chunk = fids[i:i + 500]
        q = ",".join("?" * len(chunk))
        for fid, path, mtime, size, folder, ext in con.execute(
                f"SELECT id, path, mtime, size, folder_id, ext FROM files WHERE id IN ({q})",
                chunk):
            if folder_ids is not None and folder not in folder_ids:
                continue
            if exts is not None and ext not in exts:
                continue
            if name_filter and name_filter.lower() not in path.lower():
                continue
            meta[fid] = (path, mtime, size)
    candidates = set(meta)

    if mode == MODE_ALL:
        # No positions needed to know a file matches: show newest first and
        # compute the highlights only for the file the user opens.
        order = sorted(meta, key=lambda f: -meta[f][1])[:MAX_RESULTS]
        results = [Result(f, *meta[f], None) for f in order]
        return results, query, []

    results = []
    fids = sorted(meta, key=lambda f: -meta[f][1])  # newest first
    for i in range(0, len(fids), 300):
        chunk = fids[i:i + 300]
        positions = [_positions(con, chunk, s.term_ids) for s in query.slots]
        for fid in chunk:
            plist = [p.get(fid, []) for p in positions]
            if not all(plist):
                continue
            if mode == MODE_PHRASE:
                matches = match_ordered(plist, 0)
            elif ordered:
                matches = _non_overlapping(match_ordered(plist, gap))
            else:
                matches = _non_overlapping(match_unordered(plist, gap))
            if matches:
                results.append(Result(fid, *meta[fid], matches[:MAX_MATCHES_PER_FILE]))
        if len(results) >= MAX_RESULTS:
            break
    results.sort(key=lambda r: (-len(r.matches), r.path))
    return results[:MAX_RESULTS], query, []


def file_matches(con, query, file_id):
    """Positions of every query word in one file ("all words" mode)."""
    matches = []
    for s in query.slots:
        matches.extend((p,) for p in _positions(con, [file_id], s.term_ids).get(file_id, []))
    matches.sort()
    return matches[:MAX_MATCHES_PER_FILE * 4]


# ------------------------------------------------------------ snippets
def make_snippets(text, starts, ends, matches, context=90, limit=60):
    """Return list of (snippet_text, [(hl_start, hl_end), ...])."""
    spans = []
    for m in matches:
        s = starts[m[0]]
        e = ends[m[-1]]
        spans.append((s, e, [(starts[p], ends[p]) for p in m]))
    spans.sort()
    # merge nearby spans into one snippet
    groups = []
    for s, e, hl in spans:
        if groups and s - groups[-1][1] < context:
            g = groups[-1]
            groups[-1] = (g[0], max(g[1], e), g[2] + hl)
        else:
            groups.append((s, e, hl))
        if len(groups) > limit:
            break
    out = []
    for s, e, hl in groups[:limit]:
        a = max(0, s - context)
        b = min(len(text), e + context)
        while a > 0 and not text[a - 1].isspace() and s - a < context + 20:
            a -= 1
        while b < len(text) and not text[b].isspace() and b - e < context + 20:
            b += 1
        snippet = text[a:b]
        lead = "…" if a > 0 else ""
        hls = [(hs - a + len(lead), he - a + len(lead)) for hs, he in hl]
        snippet = lead + snippet + ("…" if b < len(text) else "")
        out.append((snippet, hls))
    return out
