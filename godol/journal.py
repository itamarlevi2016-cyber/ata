"""Updates "יומן התקדמות.md" at the end of every segment: pages done, new names, open questions, and the
segment's row in the status table."""
from __future__ import annotations

import re
import time
from pathlib import Path

from . import config

HE_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"]


def _today() -> str:
    t = time.localtime()
    return f"{t.tm_mday} ב{HE_MONTHS[t.tm_mon - 1]} {t.tm_year}"


def log_path() -> Path:
    """The real log, except in mock mode: demo and test runs write to a copy under the work dir."""
    real = config.MATERIALS / "יומן התקדמות.md"
    if not config.USE_MOCK:
        return real
    mock = config.WORK / "יומן התקדמות (מדומה).md"
    if not mock.exists():
        config.ensure_dirs()
        mock.write_text(real.read_text(encoding="utf-8") if real.exists() else "# יומן התקדמות\n\n## רישום עבודה\n", encoding="utf-8")
    return mock


def update_table_row(text: str, seg_n: int | None, start: int, end: int, status_text: str, file_name: str) -> tuple[str, bool]:
    """Replaces the status (and file) cells of the segment row, matched by number and page range."""
    if seg_n is None:
        return text, False
    lines = text.splitlines()
    for i, l in enumerate(lines):
        if not l.strip().startswith("|"):
            continue
        c = [x.strip() for x in l.strip().strip("|").split("|")]
        if len(c) >= 4 and re.fullmatch(r"\d{1,3}", c[0]) and int(c[0]) == seg_n and re.search(rf"{start}\s*[–\-]\s*{end}", " ".join(c[1:4])):
            pi = next(k for k in range(1, len(c)) if re.search(r"\d+\s*[–\-]\s*\d+", c[k]))
            c[pi + 1] = status_text
            if pi + 2 < len(c):
                c[pi + 2] = file_name
            lines[i] = "| " + " | ".join(c) + " |"
            return "\n".join(lines) + ("\n" if text.endswith("\n") else ""), True
    return text, False


def append_entry(book_name: str, start: int, end: int, seg_n: int | None, summary: dict, new_names: list[dict],
                 open_questions: list[str], file_name: str) -> Path:
    p = log_path()
    text = p.read_text(encoding="utf-8") if p.exists() else "# יומן התקדמות\n\n## רישום עבודה\n"
    ready = summary["ready"]
    status = ("תורגם + נבדק (אוטומטי)" if ready else "תורגם, ממתין לבדיקה: " + summary["label"])
    text, row = update_table_row(text, seg_n, start, end, status, file_name)
    entry = [f"### {_today()} – תרגום אוטומטי, עמ' {start}–{end}", ""]
    entry.append(f"- ספר: {book_name}. עמודים שהושלמו: {start}–{end}. קובץ: `{file_name}`.")
    entry.append(f"- בקרת איכות: {summary['label']}.")
    if new_names:
        entry.append(f"- **שמות חדשים לאישור ({len(new_names)}):** " + "; ".join(f"{n['en']} = {n['he']}" for n in new_names[:40]) + (" …" if len(new_names) > 40 else ""))
    if open_questions:
        entry.append("- **שאלות פתוחות:**")
        entry += [f"  - {q}" for q in open_questions[:40]]
    if seg_n is not None and not row:
        entry.append(f"- (לא נמצאה שורה לקטע {seg_n} בטבלת הקטעים; הסטטוס לא עודכן בטבלה.)")
    block = "\n".join(entry) + "\n"
    if "## רישום עבודה" in text:
        head, _, rest = text.partition("## רישום עבודה")
        nxt = re.search(r"^## ", rest, re.M)
        if nxt:
            sec, tail = rest[:nxt.start()], rest[nxt.start():]
        else:
            sec, tail = rest, ""
        text = head + "## רישום עבודה" + sec.rstrip("\n") + "\n\n" + block + ("\n" + tail if tail else "")
    else:
        text = text.rstrip("\n") + "\n\n## רישום עבודה\n\n" + block
    p.write_text(text, encoding="utf-8")
    return p
