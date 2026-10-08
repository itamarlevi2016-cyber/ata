"""The names dictionary: loads the guide's tables and the "new names" files, finds names in
text, and applies the fallback replacements (the role of apply_names.py)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

HEB = re.compile(r"[֐-׿]")
LAT = re.compile(r"[A-Za-z]")
PAREN_COUNT = re.compile(r"\s*\((?:[\d,]+\+?)\)\s*$")


@dataclass
class Entry:
    en: str
    he: str
    source: str = ""


def _clean_key(s: str) -> str:
    s = s.replace("**", "").strip()
    s = PAREN_COUNT.sub("", s)
    return s.strip(" `")


def _cells(line: str) -> list[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def parse_entries(text: str, source: str = "") -> list[Entry]:
    """Accepts markdown tables (first two columns), `EN = HE`, `EN → HE` and bullet lines."""
    out: list[Entry] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        en = he = ""
        if line.startswith("|"):
            c = _cells(line)
            if len(c) < 2 or re.match(r"^:?-{2,}", c[0]):
                continue
            en, he = c[0], c[1]
        else:
            m = re.match(r"^[-*•]?\s*(.+?)\s*(?:=|＝|→|->|⇒)\s*(.+)$", line)
            if not m:
                continue
            en, he = m.group(1), m.group(2)
        en, he = _clean_key(en), he.replace("**", "").strip()
        he = re.split(r"\s{2,}[(\[]", he)[0].strip()
        if not en or not he or not LAT.search(en) or not HEB.search(he):
            continue
        ens = [x.strip() for x in en.split(" / ")]
        hes = [x.strip() for x in he.split(" / ")]
        if len(ens) > 1 and len(ens) == len(hes):
            out += [Entry(a, b, source) for a, b in zip(ens, hes)]
        else:
            out += [Entry(a, hes[0] if len(ens) > 1 else he, source) for a in ens]
    return out


@dataclass
class NamesDB:
    entries: dict[str, Entry] = field(default_factory=dict)  # key: lowercase english

    def add(self, e: Entry, override: bool = False) -> None:
        k = e.en.lower()
        if k not in self.entries or override:
            self.entries[k] = e

    def load_text(self, text: str, source: str) -> int:
        n = 0
        for e in parse_entries(text, source):
            self.add(e)
            n += 1
        return n

    def find(self, text: str) -> list[Entry]:
        """Dictionary names that appear (case-insensitively) in `text`. The text layer is unreliable,
        so this is a hint for the prompt and never a reason to rewrite anything."""
        low = text.lower()
        hits = []
        for k, e in self.entries.items():
            if len(k) < 4:
                continue
            if re.search(r"(?<![a-z])" + re.escape(k) + r"(?![a-z])", low):
                hits.append(e)
        hits.sort(key=lambda e: -len(e.en))
        return hits

    def replacements(self) -> list[tuple[str, str]]:
        """Longest key first, so that 'Katz III' is replaced before 'Katz II'."""
        pairs = [(e.en, e.he) for e in self.entries.values()]
        pairs.sort(key=lambda p: -len(p[0]))
        return pairs

    def apply(self, text: str) -> str:
        """Safety net: an English dictionary key left inside the Hebrew becomes its Hebrew form."""
        for en, he in self.replacements():
            if len(en) < 3:
                continue
            text = re.sub(r"(?<![A-Za-z])" + re.escape(en) + r"(?![A-Za-z])", he, text)
        return text

    def hebrew_of(self, en: str) -> str | None:
        e = self.entries.get(en.strip().lower())
        return e.he if e else None


def load_names(materials: Path, work_book: Path | None = None) -> NamesDB:
    db = NamesDB()
    guide = materials / "מדריך תרגום.md"
    files: list[Path] = []
    if guide.exists():
        db.load_text(guide.read_text(encoding="utf-8"), guide.name)
    for p in sorted(materials.glob("שמות חדשים*.md")):
        files.append(p)
    if work_book:
        approved = work_book / "שמות חדשים – מאושרים.md"
        if approved.exists():
            files.append(approved)
    for p in files:
        db.load_text(p.read_text(encoding="utf-8"), p.name)
    return db


def pending_path(work_book: Path) -> Path:
    return work_book / "שמות חדשים – ממתינים לאישור.md"


def read_pending(work_book: Path) -> list[dict]:
    p = pending_path(work_book)
    if not p.exists():
        return []
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s*(.+?)\s*=\s*(.+?)\s*(?:\(עמ' ([\d, ]+)\))?\s*$", line)
        if m:
            out.append({"en": m.group(1), "he": m.group(2), "pages": m.group(3) or ""})
    return out


def write_pending(work_book: Path, items: list[dict]) -> None:
    lines = ["# שמות חדשים – ממתינים לאישור", ""]
    for it in items:
        lines.append(f"{it['en']} = {it['he']}" + (f" (עמ' {it['pages']})" if it.get("pages") else ""))
    pending_path(work_book).write_text("\n".join(lines) + "\n", encoding="utf-8")


def add_pending(work_book: Path, db: NamesDB, new: list[dict], page: int) -> tuple[list[dict], list[dict]]:
    """Adds names the model met to the pending file. A name that already exists in the dictionary with
    another Hebrew form is returned as a conflict and is never written over."""
    items = read_pending(work_book)
    by_en = {i["en"].lower(): i for i in items}
    conflicts = []
    for n in new:
        en, he = (n.get("en") or "").strip(), (n.get("he") or "").strip()
        if not en or not he:
            continue
        known = db.hebrew_of(en)
        if known and known != he:
            conflicts.append({"en": en, "he": he, "dictionary": known, "page": page})
            continue
        if known:
            continue
        cur = by_en.get(en.lower())
        if cur:
            pages = {p.strip() for p in cur["pages"].split(",") if p.strip()}
            pages.add(str(page))
            cur["pages"] = ", ".join(sorted(pages, key=int))
        else:
            items.append({"en": en, "he": he, "pages": str(page)})
            by_en[en.lower()] = items[-1]
    write_pending(work_book, items)
    return items, conflicts


def approve_pending(work_book: Path, ens: list[str]) -> int:
    items = read_pending(work_book)
    keep = [i for i in items if i["en"] not in ens]
    take = [i for i in items if i["en"] in ens]
    if take:
        ap = work_book / "שמות חדשים – מאושרים.md"
        old = ap.read_text(encoding="utf-8") if ap.exists() else "# שמות חדשים – מאושרים\n\n"
        ap.write_text(old.rstrip("\n") + "\n" + "\n".join(f"{i['en']} = {i['he']}" for i in take) + "\n", encoding="utf-8")
    write_pending(work_book, keep)
    return len(take)


def reject_pending(work_book: Path, ens: list[str]) -> int:
    items = read_pending(work_book)
    keep = [i for i in items if i["en"] not in ens]
    write_pending(work_book, keep)
    return len(items) - len(keep)
