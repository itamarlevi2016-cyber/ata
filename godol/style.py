"""A style reference taken from the approved Hebrew translation of earlier pages: a handful of paragraphs
spread through it, sent with every page so that the new pages are written in the same register."""
from __future__ import annotations

import re
from pathlib import Path

from . import config

HEB = re.compile(r"[֐-׿]")


def pick_sample(text: str, max_chars: int = 5800, count: int = 7) -> str:
    paras = [p.strip() for p in re.split(r"\n\s*\n|\n", text)]
    paras = [p for p in paras if 260 <= len(p) <= 950 and len(HEB.findall(p)) / len(p) > 0.7
             and not re.search(r"[A-Za-z]{4}", p) and len(re.findall(r"\d", p)) < 12]
    if not paras:
        return ""
    want = min(len(paras), count)
    out, used = [], 0
    for k in range(want):
        p = paras[int((k + 0.5) * len(paras) / want)]
        if used + len(p) > max_chars:
            break
        out.append(p)
        used += len(p)
    return "\n\n".join(out)


def _docx_text(path: Path) -> str:
    import docx
    return "\n".join(p.text for p in docx.Document(str(path)).paragraphs)


def load_style(materials: Path | None = None) -> str:
    """`דוגמת סגנון.md` if present (hand-picked, used as is); otherwise paragraphs picked from a .docx in
    materials that is mostly Hebrew (the earlier translation, e.g. the pilot)."""
    m = materials or config.MATERIALS
    f = m / "דוגמת סגנון.md"
    if f.exists():
        return f.read_text(encoding="utf-8").strip()[:6500]
    for d in sorted(m.glob("*.docx")):
        try:
            t = _docx_text(d)
        except Exception:  # noqa: BLE001
            continue
        if len(t) > 15000 and len(HEB.findall(t)) > 8 * len(re.findall(r"[A-Za-z]", t)):
            return pick_sample(t)
    return ""
