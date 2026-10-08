"""Builds a segment: assemble the pages, write the Word file, run the eight checks, write the report,
update the progress log."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from . import config, journal, names as names_mod, qa
from .assemble import assemble
from .book import Book
from .docx_writer import build_docx
from .mapping import Segment, load_segments, chapter_label
from .qa import _norm


def file_stem(chapter: int | None, start: int, end: int) -> str:
    """"פרק X – עמ' Y–Z"; "קטע" replaces "פרק X" when the chapter is unknown (a "?" is not allowed in file names)."""
    return (f"פרק {chapter}" if chapter else "קטע") + f" – עמ' {start}–{end}"


def page_hebrew(p: dict) -> str:
    """The Hebrew of one page as the independent verifier will see it (footnotes included, tokens removed)."""
    parts = []
    for e in p["elements"]:
        t = re.sub(r"⟦[a-z]+:[^⟧]+⟧", "", e["text"]).replace("**", "")
        if e["type"] in ("heading_chapter", "heading_section", "excursus_heading"):
            parts.append("# " + t)
        elif e["type"] == "footnote_source":
            parts.append(f"[הערת שוליים {e['marker']}] {t}")
        elif e["type"] == "numbered_note":
            parts.append(f"[הערה {e['number']}] {t}")
        elif e["type"] in ("body_paragraph", "excursus_body"):
            parts.append(t)
    return "\n\n".join(parts)


def _vpath(book: Book, n: int) -> Path:
    d = book.dir / "verify"
    d.mkdir(exist_ok=True)
    return d / f"p{n:04d}.json"


def _hash(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:12]


def run_verifier(book: Book, pages: list[dict], llm, on_event=None, force: bool = False) -> list[dict]:
    """Calls the independent checker only for pages whose Hebrew changed since the last check."""
    todo, out = [], []
    texts = {p["page"]: page_hebrew(p) for p in pages}
    for n, t in texts.items():
        f = _vpath(book, n)
        if not force and f.exists():
            c = json.loads(f.read_text(encoding="utf-8"))
            if c.get("hash") == _hash(t):
                out.append(c["result"])
                continue
        todo.append(n)
    if todo:
        for r in qa.verify_pages(book, todo, texts, llm, on_event):
            if "error" not in r:
                _vpath(book, r["page"]).write_text(json.dumps({"hash": _hash(texts[r["page"]]), "result": r}, ensure_ascii=False), encoding="utf-8")
            out.append(r)
    return sorted(out, key=lambda r: r["page"])


def cached_verifier(book: Book, pages: list[dict]) -> list[dict] | None:
    out = []
    for p in pages:
        f = _vpath(book, p["page"])
        if not f.exists():
            return None
        c = json.loads(f.read_text(encoding="utf-8"))
        if c.get("hash") != _hash(page_hebrew(p)):
            return None
        out.append(c["result"])
    return out


def build_segment(book: Book, start: int, end: int, llm=None, verify: bool = True, seg: Segment | None = None,
                  chapter: int | None = None, update_journal: bool = True, soffice: bool = True, on_event=None) -> dict:
    pages = [p for n in range(start, end + 1) if (p := book.load_page(n))]
    if not pages:
        raise ValueError("אין עמודים מתורגמים בטווח")
    expected = list(range(start, end + 1))
    chapter = chapter or (seg.chapter if seg else None)
    stem = file_stem(chapter, start, end)
    docx_path = book.out_dir / (stem + ".docx")
    asm = assemble(pages)
    facts = build_docx(asm, docx_path, title=stem)
    db = names_mod.load_names(config.MATERIALS, book.dir)
    ver = None
    if verify and llm is not None:
        ver = run_verifier(book, pages, llm, on_event)
    else:
        ver = cached_verifier(book, pages)
    checks = [
        qa.check_latin(asm), qa.check_residue(asm), qa.check_counts(pages), qa.check_coverage(pages, asm, expected),
        qa.check_names(pages, asm, db), qa.check_footnotes_not_paragraphs(asm, facts), qa.check_docx(docx_path, asm, facts, soffice),
        qa.check_verifier(ver, expected),
    ]
    for w in asm.warnings:
        checks[3]["details"].append("הרכבה: " + w)
    summary = qa.summarize(checks)
    md = qa.report_markdown(stem, summary, checks)
    (book.out_dir / f"דוח בקרה – {stem}.md").write_text(md, encoding="utf-8")
    report = {"segment": stem, "file": docx_path.name, "start": start, "end": end, "summary": summary, "checks": checks,
              "facts": facts, "warnings": asm.warnings, "pages": [p["page"] for p in pages]}
    (book.out_dir / f"דוח בקרה – {stem}.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    if update_journal:
        pend = [i for i in names_mod.read_pending(book.dir)
                if any(start <= int(x) <= end for x in re.findall(r"\d+", i["pages"]))]
        questions = [d for c in checks if c["status"] in ("fail", "warn") for d in c["details"][:3]]
        for p in pages:
            for e in p["elements"]:
                if e["type"] == "review_flag":
                    questions.append(f"עמ' {p['page']}: {e['reason']}")
        journal.append_entry(book.meta["name"], start, end, seg.n if seg else None, summary, pend, questions[:40], docx_path.name)
    return report


def segments() -> tuple[list[Segment], str]:
    return load_segments(config.MATERIALS)
