"""The book map: chapters, sections and page ranges, read from "מיפוי הספר.md".
Falls back to the segment table of the progress log when the map file is not present."""
from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from pathlib import Path

RANGE = re.compile(r"^(?:עמ['׳]\s*)?(\d{1,4})\s*[–\-—]\s*(\d{1,4})$")
ORDINALS = ["", "ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שביעי", "שמיני", "תשיעי", "עשירי"]


@dataclass
class Segment:
    n: int
    title: str
    start: int
    end: int
    chapter: int | None = None
    status: str = "todo"  # todo | done_outside | partial
    note: str = ""

    def to_dict(self):
        return asdict(self)


def chapter_label(n: int) -> str:
    return "פרק " + (ORDINALS[n] if 0 < n < len(ORDINALS) else str(n))


def _status(text: str) -> str:
    if re.search(r"חלקית|מושהה|טרם התחיל|לא התחיל", text):
        return "partial" if "חלקית" in text else "todo"
    if re.search(r"נבדק|הושלם|תורגם", text) and not re.search(r"טרם נבדק", text):
        return "done_outside"
    return "todo"


def parse_segments(text: str) -> list[Segment]:
    """Rows shaped like `| 9 | פרק 3 | 331–379 | ... |`: a number cell, a title and a page range."""
    out: list[Segment] = []
    chapter: int | None = None
    for raw in text.splitlines():
        h = re.match(r"^#{1,4}\s*.*?(?:פרק|chapter)\s*(\d+)", raw, re.I)
        if h:
            chapter = int(h.group(1))
        if not raw.strip().startswith("|"):
            continue
        c = [x.replace("**", "").strip() for x in raw.strip().strip("|").split("|")]
        if len(c) < 3 or not re.fullmatch(r"\d{1,3}", c[0]):
            continue
        pi = next((k for k in range(1, len(c)) if RANGE.match(c[k])), -1)
        if pi < 0:
            continue
        a, b = RANGE.match(c[pi]).groups()
        if int(b) < int(a):
            continue
        title = max(c[1:pi], key=len, default="")
        st = c[pi + 1] if pi + 1 < len(c) else ""
        m = re.search(r"פרק\s*(\d+)", title)
        out.append(Segment(int(c[0]), title, int(a), int(b), int(m.group(1)) if m else chapter, _status(st), st))
    return out


def load_segments(materials: Path) -> tuple[list[Segment], str]:
    """Returns (segments, source file name)."""
    mp = materials / "מיפוי הספר.md"
    if mp.exists():
        segs = parse_segments(mp.read_text(encoding="utf-8"))
        if segs:
            return segs, mp.name
    log = materials / "יומן התקדמות.md"
    if log.exists():
        segs = parse_segments(log.read_text(encoding="utf-8"))
        if segs:
            return segs, log.name + " (מיפוי הספר.md לא נמצא)"
    return [], ""


def next_todo(segs: list[Segment]) -> Segment | None:
    return next((s for s in segs if s.status in ("todo", "partial")), None)
