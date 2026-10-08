"""Joins per-page results into a chapter: merges paragraphs cut by a page break and applies the book's
Hebrew structure (the story once, numbered notes at the end of the chapter, excursuses after them).
This is the role of restructure.py in the earlier workflow."""
from __future__ import annotations

import re
from collections import OrderedDict
from dataclasses import dataclass, field

from .schema import TOKEN, tokens

NOTE_TITLE = "הערות"
EXC_TITLE = "נספחים"


def heb_num(n: int) -> str:
    """1 -> א, 10 -> י, 15 -> טו, 27 -> כז, 100 -> ק"""
    if n <= 0:
        return str(n)
    units = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"]
    tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"]
    hund = ["", "ק", "ר", "ש", "ת"]
    out = ""
    while n >= 400:
        out += "ת"
        n -= 400
    out += hund[n // 100]
    n %= 100
    if n in (15, 16):
        return out + ("טו" if n == 15 else "טז")
    return out + tens[n // 10] + units[n % 10]


def letters_to_index(letters: str) -> int:
    """A=1 ... Z=26, AA=27 ... as the book numbers its excursuses; the count restarts in each chapter."""
    letters = letters.strip().upper()
    if not letters or not letters.isalpha() or not letters.isascii():
        return 0
    if len(set(letters)) == 1 and len(letters) > 1:
        return 26 * (len(letters) - 1) + (ord(letters[0]) - 64)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n


def excursus_label(letter: str) -> str:
    return f"{heb_num(letters_to_index(letter))} ({letter.strip().upper()})"


@dataclass
class Assembled:
    blocks: list[dict] = field(default_factory=list)
    footnotes: dict[str, str] = field(default_factory=dict)
    comments: list[dict] = field(default_factory=list)
    pages: list[int] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    has_notes_part: bool = False


def strip_tokens(text: str) -> str:
    return TOKEN.sub("", text)


def assemble(page_results: list[dict]) -> Assembled:
    out = Assembled()
    flow: list[dict] = []
    notes: "OrderedDict[int, dict]" = OrderedDict()
    excs: "OrderedDict[str, dict]" = OrderedDict()
    owner: dict[str, dict] = {}      # element id -> block that holds it
    flags: list[dict] = []
    open_blk: dict | None = None     # a paragraph cut at the end of a page
    cur_exc: dict | None = None
    seq = 0

    def new_block(kind, text, eid, page, **kw):
        nonlocal seq
        seq += 1
        b = {"kind": kind, "text": text, "id": f"b{seq}", "src_id": eid, "page": page, **kw}
        if eid:
            owner[eid] = b
        return b

    for pr in sorted(page_results, key=lambda p: p["page"]):
        out.pages.append(pr["page"])
        pg = pr["page"]
        first_para_of_page = True
        for e in pr["elements"]:
            t = e["type"]
            if t == "heading_chapter":
                for line in [x for x in e["text"].split("\n") if x.strip()]:
                    flow.append(new_block("h1", line.strip(), e["id"], pg))
                open_blk = None
            elif t == "heading_section":
                flow.append(new_block("h3", e["text"].strip(), e["id"], pg))
                open_blk = None
            elif t == "body_paragraph":
                if open_blk is not None and e["continues_prev"] and first_para_of_page:
                    open_blk["text"] = open_blk["text"].rstrip() + " " + e["text"].lstrip()
                    owner[e["id"]] = open_blk
                    blk = open_blk
                else:
                    if e["continues_prev"] and open_blk is None:
                        out.warnings.append(f"עמ' {pg}: הפסקה {e['id']} מסומנת כהמשך, אבל אין פסקה פתוחה מהעמוד הקודם")
                    blk = new_block("p", e["text"], e["id"], pg, region=e["region"])
                    flow.append(blk)
                    if e["region"] in ("frame",):
                        out.has_notes_part = True
                open_blk = blk if e["continues_next"] else None
                first_para_of_page = False
            elif t == "footnote_source":
                fid = e["id"]
                if fid in out.footnotes:
                    fid = f"{fid}_{pg}"
                    out.warnings.append(f"מזהה הערת שוליים כפול {e['id']}")
                out.footnotes[fid] = e["text"]
                owner[e["id"]] = {"footnote": fid}
            elif t == "numbered_note":
                out.has_notes_part = True
                n = e["number"]
                if n in notes and e["continues_prev"]:
                    notes[n]["text"] = notes[n]["text"].rstrip() + " " + e["text"].lstrip()
                else:
                    if n in notes:
                        out.warnings.append(f"עמ' {pg}: הערה {n} מופיעה פעמיים")
                    notes[n] = new_block("note", e["text"], e["id"], pg, number=n)
            elif t == "excursus_heading":
                out.has_notes_part = True
                L = e["letter"].strip().upper()
                if L in excs:
                    out.warnings.append(f"עמ' {pg}: נספח {L} מופיע פעמיים")
                cur_exc = excs.setdefault(L, {"letter": L, "title": e["text"].strip(), "ref": e["ref"].strip(), "paras": [], "page": pg, "id": e["id"]})
                open_blk = None
            elif t == "excursus_body":
                if cur_exc is None:
                    out.warnings.append(f"עמ' {pg}: גוף נספח בלי כותרת נספח")
                    cur_exc = excs.setdefault("?", {"letter": "?", "title": "", "ref": "", "paras": [], "page": pg, "id": ""})
                if open_blk is not None and e["continues_prev"] and open_blk.get("kind") == "exc_p" and first_para_of_page:
                    open_blk["text"] = open_blk["text"].rstrip() + " " + e["text"].lstrip()
                    owner[e["id"]] = open_blk
                    blk = open_blk
                else:
                    blk = new_block("exc_p", e["text"], e["id"], pg)
                    cur_exc["paras"].append(blk)
                open_blk = blk if e["continues_next"] else None
                first_para_of_page = False
            elif t == "review_flag":
                flags.append({"page": pg, "target": e["target"], "words": e["words"], "reason": e["reason"]})

    out.blocks = flow
    if notes or excs:
        _link_excursuses(notes, excs, out)
        if notes:
            out.blocks.append(new_block("h2", NOTE_TITLE, "", out.pages[-1]))
            out.blocks += [notes[k] for k in sorted(notes)]
        if excs:
            out.blocks.append(new_block("h2", EXC_TITLE, "", out.pages[-1]))
            for L, x in excs.items():
                label = excursus_label(L) if L != "?" else ""
                title = (f"נספח {label}" if label else "נספח") + (f" – {x['title']}" if x["title"] else "")
                out.blocks.append(new_block("exc_h", title, x["id"], x["page"], letter=L, ref=_note_no(x["ref"])))
                out.blocks += x["paras"]
    # review flags become Word comments anchored to a block
    by_fn_ref: dict[str, dict] = {}
    for b in out.blocks:
        for k, v in tokens(b["text"]):
            if k == "fn":
                by_fn_ref[v] = b
    for f in flags:
        o = owner.get(f["target"])
        blk = None
        if isinstance(o, dict) and "footnote" in o:
            blk = by_fn_ref.get(o["footnote"]) or by_fn_ref.get(f["target"])
        elif isinstance(o, dict):
            blk = o
        if blk is None:
            cands = [b for b in out.blocks if b.get("page") == f["page"] and b["kind"] in ("p", "note", "exc_p")]
            blk = cands[-1] if cands else (out.blocks[0] if out.blocks else None)
            if blk is not None and f["target"]:
                out.warnings.append(f"עמ' {f['page']}: review_flag מצביע על {f['target']} שלא נמצא; הוצמד לפסקה אחרונה בעמוד")
        if blk is not None:
            out.comments.append({"block": blk["id"], "words": f["words"], "text": f"עמ' {f['page']}: {f['reason']}"})
    return out


def _note_no(ref: str) -> int:
    m = re.search(r"\d+", ref or "")
    return int(m.group()) if m else 0


def _link_excursuses(notes, excs, out: Assembled) -> None:
    """The note that introduced an excursus says "see excursus X at the end of the chapter" and links to it."""
    for L, x in excs.items():
        n = _note_no(x["ref"])
        if not n:
            out.warnings.append(f"נספח {L}: לא צוינה ההערה שאליה הוא שייך")
            continue
        pointer = f"ראה נספח {excursus_label(L)} בסוף הפרק ⟦ex:{L}⟧"
        if n not in notes:
            notes[n] = {"kind": "note", "text": pointer, "id": f"bn{n}", "src_id": "", "page": x["page"], "number": n}
        elif f"⟦ex:{L}⟧" not in notes[n]["text"]:
            notes[n]["text"] = notes[n]["text"].rstrip() + " " + pointer
