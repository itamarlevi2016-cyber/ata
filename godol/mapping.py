"""The book map: chapters, sections and page ranges, read from "מיפוי הספר.md".
Falls back to the segment table of the progress log when the map file is not present."""
from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from pathlib import Path

EMBEDDED = re.compile(r"עמ['׳]\s*(\d{1,4})\s*[–\-—]\s*(\d{1,4})\s*$")
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
        if pi >= 0:
            a, b = RANGE.match(c[pi]).groups()
            title = max(c[1:pi], key=len, default="")
        else:  # the map file writes the range inside the name: "פרק 3 – עמ' 331–379"
            hit = next(((k, EMBEDDED.search(c[k])) for k in range(1, len(c)) if EMBEDDED.search(c[k])), None)
            if not hit:
                continue
            pi, m = hit
            a, b = m.groups()
            title = EMBEDDED.sub("", c[pi]).strip(" –-")
        if int(b) < int(a):
            continue
        st = c[pi + 1] if pi + 1 < len(c) else ""
        m = re.search(r"פרק\s*(\d+)", title) or re.search(r"פרק\s*(\d+)", c[pi])
        out.append(Segment(int(c[0]), title, int(a), int(b), int(m.group(1)) if m else chapter, _status(st), st))
    return out


def load_segments(materials: Path) -> tuple[list[Segment], str]:
    """Segments from the book map (page ranges, chapters); their status from the progress log.
    Returns (segments, description of the sources)."""
    mp, log = materials / "מיפוי הספר.md", materials / "יומן התקדמות.md"
    from_map = parse_segments(mp.read_text(encoding="utf-8")) if mp.exists() else []
    from_log = parse_segments(log.read_text(encoding="utf-8")) if log.exists() else []
    if not from_map:
        note = " (מיפוי הספר.md לא נמצא)" if not mp.exists() else " (מיפוי הספר.md קיים אך לא נקראו ממנו קטעים)"
        return from_log, (log.name + note) if from_log else ""
    by_log = {s.n: s for s in from_log}
    for s in from_map:
        if s.n in by_log:
            s.status, s.note = by_log[s.n].status, by_log[s.n].note
    have = {s.n for s in from_map}
    merged = from_map + [s for n, s in by_log.items() if n not in have]   # e.g. segment 0, the pilot
    merged.sort(key=lambda s: s.n)
    return merged, mp.name + (" + " + log.name + " (סטטוס)" if from_log else "")


def next_todo(segs: list[Segment]) -> Segment | None:
    return next((s for s in segs if s.status in ("todo", "partial")), None)
