"""Page-by-page translation with checkpoints, bounded retries and no silent continuation after a failure."""
from __future__ import annotations

import threading
import time
from typing import Callable

from . import config, names as names_mod
from .book import Book
from .llm import LLMError, Usage
from .prompts import load_guide, translator_system, user_blocks
from .style import load_style
from .schema import TOKEN, validate_page

Event = Callable[[dict], None]


class PageFailed(Exception):
    def __init__(self, pages: list[int], message: str, kind: str = "failed"):
        super().__init__(message)
        self.pages = pages
        self.kind = kind


class Stopped(Exception):
    pass


def _apply_names_to_text(db: names_mod.NamesDB, text: str) -> str:
    """The safety net must never touch the ⟦…⟧ tokens (their ids contain Latin letters)."""
    out, pos = [], 0
    for m in TOKEN.finditer(text):
        out.append(db.apply(text[pos:m.start()]))
        out.append(m.group(0))
        pos = m.end()
    out.append(db.apply(text[pos:]))
    return "".join(out)


def carry_for(book: Book, first_page: int) -> dict | None:
    prev = book.load_page(first_page - 1)
    if not prev:
        return None
    paras = [e for e in prev["elements"] if e["type"] in ("body_paragraph", "excursus_body") and e["text"].strip()]
    if not paras:
        return None
    last = paras[-1]
    return {"he": last["text"][-1500:], "open": bool(last["continues_next"])}


def chunks(pages: list[int], size: int) -> list[list[int]]:
    """Groups of consecutive page numbers, at most `size` per call."""
    out: list[list[int]] = []
    for n in pages:
        if out and len(out[-1]) < size and out[-1][-1] == n - 1:
            out[-1].append(n)
        else:
            out.append([n])
    return out


def translate_range(book: Book, start: int, end: int, llm, on_event: Event | None = None, stop: threading.Event | None = None,
                    force: bool = False, chapter_hint: str = "") -> Usage:
    emit = on_event or (lambda e: None)
    total = Usage()
    guide = load_guide(config.MATERIALS)
    system = translator_system(guide, load_style())
    pages = [n for n in range(start, end + 1) if force or book.load_page(n) is None]
    for n in range(start, end + 1):
        if n not in pages:
            emit({"type": "page_done", "page": n, "skipped": True, "message": "כבר מתורגם (מנקודת שמירה)"})
    for group in chunks(pages, config.PAGES_PER_CALL):
        if stop and stop.is_set():
            raise Stopped()
        db = names_mod.load_names(config.MATERIALS, book.dir)
        text_all = ""
        payload = []
        for n in group:
            img, mt = book.pdf.image(n)
            layer = book.pdf.text(n)
            text_all += "\n" + layer
            payload.append({"n": n, "image": img, "media_type": mt, "text_layer": layer})
        known = [(e.en, e.he) for e in db.find(text_all)][:80]
        pending = [(i["en"], i["he"]) for i in names_mod.read_pending(book.dir)][:80]
        content = user_blocks(payload, carry_for(book, group[0]), known, pending, chapter_hint)
        feedback = ""
        last_err = ""
        result = None
        for attempt in range(1, config.MAX_ATTEMPTS + 1):
            if stop and stop.is_set():
                raise Stopped()
            for n in group:
                emit({"type": "page_start", "page": n, "attempt": attempt})
            blocks = content + ([{"type": "text", "text": feedback}] if feedback else [])
            try:
                reply = llm.translate(system, blocks)
            except LLMError as e:
                last_err = f"{e.kind}: {e}"
                if not e.retryable or attempt == config.MAX_ATTEMPTS:
                    emit({"type": "page_failed", "pages": group, "message": last_err})
                    raise PageFailed(group, last_err, e.kind)
                wait = config.RETRY_BASE_SECONDS * (2 ** (attempt - 1))
                emit({"type": "retry", "pages": group, "attempt": attempt, "message": last_err, "wait": wait})
                _sleep(wait, stop)
                continue
            total.add(reply.usage)
            got = {p.get("page"): p for p in reply.data.get("pages", [])}
            problems = []
            if set(got) != set(group):
                problems.append(f"expected pages {group}, got {sorted(k for k in got if k is not None)}")
            for n in group:
                if n in got:
                    problems += [f"page {n}: {x}" for x in validate_page(got[n], n)]
            if problems:
                last_err = "; ".join(problems[:6])
                if attempt == config.MAX_ATTEMPTS:
                    emit({"type": "page_failed", "pages": group, "message": "הפלט לא עבר אימות: " + last_err})
                    raise PageFailed(group, "הפלט לא עבר אימות: " + last_err, "invalid")
                emit({"type": "retry", "pages": group, "attempt": attempt, "message": last_err, "wait": 0})
                feedback = "Your previous answer was rejected for these reasons. Return the complete corrected JSON again:\n- " + "\n- ".join(problems[:12])
                continue
            result = (got, reply.usage, attempt)
            break
        got, usage, attempt = result
        for n in group:
            _finish_page(book, n, got[n], db, usage, attempt, emit, known)
    return total


def _finish_page(book: Book, n: int, page: dict, db, usage: Usage, attempt: int, emit: Event, known=None) -> None:
    for e in page["elements"]:
        if e["type"] != "review_flag":
            e["text"] = _apply_names_to_text(db, e["text"])
        e["page"] = n
    _, conflicts = names_mod.add_pending(book.dir, db, page.get("new_names", []), n)
    page["meta"] = {"model": config.MODEL, "attempts": attempt, "usage": usage.to_dict(), "ts": time.time(), "status": "ok"}
    page["name_conflicts"] = conflicts
    page["names_hint"] = [list(x) for x in (known or [])]
    book.save_page(n, page)
    emit({"type": "page_done", "page": n, "attempt": attempt, "conflicts": conflicts,
          "message": f"{len(page['elements'])} רכיבים" + (f", {len(conflicts)} התנגשויות שמות" if conflicts else "")})


def _sleep(sec: float, stop: threading.Event | None) -> None:
    end = time.time() + sec
    while time.time() < end:
        if stop and stop.is_set():
            raise Stopped()
        time.sleep(min(0.5, max(0.0, end - time.time())))
