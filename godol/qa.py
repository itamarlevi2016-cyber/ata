"""The eight quality checks. A segment is "ready" only when none of them fails and the independent
verifier has run. `warn` means a note for the reviewer, `fail` blocks."""
from __future__ import annotations

import re

from . import config, prompts
from .assemble import Assembled, strip_tokens
from .docx_check import validate_docx
from .llm import LLMError
from .schema import TOKEN, tokens

ALLOWED_PHRASES = ["Making of a Godol", "Reb Yaakov", "konieh", "foot", "datus", "KEY", "Heb."]
LAT_TOKEN = re.compile(r"[A-Za-z][A-Za-z'’]*")
ROMAN = re.compile(r"^[ivxlcdm]+$")
ASTERISKS = {"*", "∗", "⁎", "†", "‡"}
HEB = r"֐-׿"


def _norm(s: str) -> str:
    s = TOKEN.sub("", s).replace("**", "")
    s = re.sub(rf"[^{HEB}A-Za-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _allowed_extra() -> list[str]:
    p = config.MATERIALS / "allowed_latin.txt"
    return [l.strip() for l in p.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")] if p.exists() else []


def _all_texts(asm: Assembled) -> list[tuple[str, int, str]]:
    out = [(b["kind"], b.get("page", 0), b["text"]) for b in asm.blocks]
    out += [("footnote", 0, t) for t in asm.footnotes.values()]
    return out


def check_latin(asm: Assembled) -> dict:
    bad = []
    phrases = ALLOWED_PHRASES + _allowed_extra()
    for kind, pg, text in _all_texts(asm):
        t = TOKEN.sub(" ", text).replace("**", "")
        for ph in phrases:
            t = t.replace(ph, " ")
        t = re.sub(r"\(([A-Z]{1,2})\)", " ", t)  # excursus letters: (D), (AA)
        for m in LAT_TOKEN.finditer(t):
            w = m.group(0)
            if len(w) == 1 or ROMAN.match(w):
                continue
            bad.append(f"עמ' {pg or '?'} ({kind}): \"{w}\" ... {t[max(0, m.start() - 25):m.end() + 25].strip()}")
    return _res(1, "אין אותיות לועזיות בגוף ובהערות (פרט לחריגים במדריך)", bad)


def check_residue(asm: Assembled) -> dict:
    bad, warn = [], []
    for kind, pg, text in _all_texts(asm):
        t = text.replace("**", "")
        t_nt = TOKEN.sub("", t)
        where = f"עמ' {pg or '?'} ({kind})"
        if "⟦" in t_nt or "⟧" in t_nt:
            bad.append(f"{where}: סימון פנימי שבור ⟦…⟧: {t_nt[:60]}")
        for m in re.finditer(r"[\^£°§#|_~\\*]", t_nt):
            bad.append(f"{where}: תו שאריות \"{m.group()}\" ... {t_nt[max(0, m.start() - 20):m.end() + 20]}")
        if t_nt.count("[") != t_nt.count("]") or t_nt.count("(") != t_nt.count(")"):
            bad.append(f"{where}: סוגריים לא מאוזנים: {t_nt[:70]}")
        for m in re.finditer(rf"(?<=[{HEB}])\d|\d(?=[{HEB}])", t_nt):
            warn.append(f"{where}: ספרה הדבוקה למילה: {t_nt[max(0, m.start() - 15):m.end() + 15]}")
        if re.search(r"\s{3,}", t_nt):
            warn.append(f"{where}: רווחים מרובים")
    return _res(2, "אין שאריות סימון (^ * £ °, ספרות דבוקות, סוגריים שבורים)", bad, warn)


def check_counts(pages: list[dict]) -> dict:
    bad = []
    for p in pages:
        els = p["elements"]
        fn = [e for e in els if e["type"] == "footnote_source"]
        ast = [e for e in fn if e["marker"].strip() in ASTERISKS]
        let = [e for e in fn if e["marker"].strip() not in ASTERISKS]
        nn = [e for e in els if e["type"] == "numbered_note" and not e["continues_prev"]]
        ex = [e for e in els if e["type"] == "excursus_heading"]
        c = p["counts"]
        for label, declared, actual in (("הערות שוליים באותיות", c["source_footnotes"], len(let)), ("הערות כוכבית", c["asterisk_footnotes"], len(ast)),
                                        ("הערות ממוספרות", c["numbered_notes"], len(nn)), ("כותרות נספח", c["excursus_headings"], len(ex))):
            if declared != actual:
                bad.append(f"עמ' {p['page']}: {label}: המודל ספר {declared} בתמונה, בפלט יש {actual}")
    return _res(3, "מספר הערות השוליים, הכוכביות, הממוספרות והנספחים שווה לספירה מהתמונה", bad)


def check_coverage(pages: list[dict], asm: Assembled, expected: list[int]) -> dict:
    bad, warn = [], []
    have = {p["page"] for p in pages}
    for n in expected:
        if n not in have:
            bad.append(f"עמ' {n}: אין תרגום")
    flat_all = " ".join(_norm(t) for _, _, t in _all_texts(asm))
    for p in pages:
        page_text = " ".join(_norm(e["text"]) for e in p["elements"] if e["type"] != "review_flag")
        if not page_text.strip():
            warn.append(f"עמ' {p['page']}: אין תוכן (עמוד ריק?)")
            continue
        for key in ("first_sentence_he", "last_sentence_he"):
            s = _norm(p[key])
            if not s:
                bad.append(f"עמ' {p['page']}: חסר {key}")
            elif s not in page_text and s not in flat_all:
                bad.append(f"עמ' {p['page']}: {key} לא נמצא בתרגום: \"{p[key][:50]}\"")
        for key in ("first_sentence_src", "last_sentence_src"):
            if not _norm(p[key]):
                bad.append(f"עמ' {p['page']}: חסר {key}")
    seen: dict[str, str] = {}
    for b in asm.blocks:
        if b["kind"] in ("p", "exc_p", "note"):
            n = _norm(b["text"])
            if len(n) >= 40:
                if n in seen:
                    bad.append(f"פסקה כפולה בעמ' {b.get('page')}: \"{b['text'][:50]}\"")
                seen[n] = b["id"]
    return _res(4, "כל עמוד מיוצג (משפט פתיחה וסיום), בלי פסקה חסרה או כפולה", bad, warn)


def check_names(pages: list[dict], asm: Assembled, db) -> dict:
    bad, warn = [], []
    for p in pages:
        for c in p.get("name_conflicts", []):
            bad.append(f"עמ' {c['page']}: המודל הציע \"{c['he']}\" ל-{c['en']}, במילון: \"{c['dictionary']}\" (נשאר כמו במילון, ממתין להחלטה)")
        page_he = " ".join(e["text"] for e in p["elements"])
        for en, he in p.get("names_hint", []):
            if he not in page_he:
                warn.append(f"עמ' {p['page']}: {en} מופיע (אולי) בעמוד, אבל \"{he}\" לא נמצא בתרגום")
    for kind, pg, text in _all_texts(asm):
        for en, he in db.replacements():
            if len(en) >= 3 and re.search(r"(?<![A-Za-z])" + re.escape(en) + r"(?![A-Za-z])", TOKEN.sub(" ", text)):
                bad.append(f"עמ' {pg or '?'}: שם מהמילון נשאר באנגלית: {en} ← {he}")
    return _res(5, "כל השמות תואמים למילון, ושמות קיימים לא שונו", bad, warn)


def check_footnotes_not_paragraphs(asm: Assembled, facts: dict) -> dict:
    bad = []
    fns = [(_norm(t), t) for t in asm.footnotes.values() if len(_norm(t)) >= 25]
    for b in asm.blocks:
        if b["kind"] not in ("p", "exc_p"):
            continue
        n = _norm(b["text"])
        for fnorm, raw in fns:
            if fnorm in n and len(fnorm) >= 0.8 * len(n):
                bad.append(f"עמ' {b.get('page')}: הערת שוליים מופיעה כפסקה בגוף: \"{raw[:50]}\"")
    for f in facts.get("footnotes_unreferenced", []):
        bad.append(f"הערת שוליים {f} אין לה סימון בטקסט")
    return _res(6, "אין הערת שוליים שמופיעה כפסקה בגוף הטקסט", bad)


def check_docx(path, asm: Assembled, facts: dict, soffice: bool = True) -> dict:
    v = validate_docx(path, expect_footnotes=len(asm.footnotes) - len(facts.get("footnotes_unreferenced", [])), soffice=soffice)
    r = _res(7, "הקובץ נפתח ועובר בדיקת תקינות", v["problems"], v["notes"])
    r["info"] = v["info"]
    return r


def verify_pages(book, pages: list[int], asm_by_page: dict[int, str], llm, on_event=None) -> list[dict]:
    """Check 8's raw material: an independent call per page that sees only the image and the Hebrew."""
    results = []
    for n in pages:
        img, mt = book.pdf.image(n)
        heb = asm_by_page.get(n, "")
        last = None
        for attempt in range(1, config.MAX_ATTEMPTS + 1):
            try:
                rep = llm.verify(prompts.VERIFIER_SYSTEM, prompts.verifier_blocks(n, img, mt, heb))
                results.append({"page": n, "differences": rep.data.get("differences", []), "usage": rep.usage.to_dict()})
                last = None
                break
            except LLMError as e:
                last = e
                if not e.retryable:
                    break
        if last is not None:
            results.append({"page": n, "error": str(last), "differences": []})
        if on_event:
            on_event({"type": "verified", "page": n})
    return results


def check_verifier(results: list[dict] | None, expected: list[int]) -> dict:
    if results is None:
        return {"id": 8, "name": "בודק עצמאי מול תמונת העמוד", "status": "pending", "details": ["הבודק עדיין לא הורץ על הקטע הזה"]}
    bad, warn = [], []
    done = {r["page"] for r in results if "error" not in r}
    for n in expected:
        if n not in done:
            bad.append(f"עמ' {n}: הבודק לא הצליח לרוץ")
    for r in results:
        for d in r.get("differences", []):
            line = f"עמ' {r['page']} [{d['kind']}]: {d['explanation']} | מקור: \"{d['source_quote'][:60]}\" | תרגום: \"{d['hebrew_quote'][:60]}\""
            (bad if d["severity"] == "major" else warn).append(line)
    return _res(8, "בודק עצמאי מול תמונת העמוד: אין השמטות, תוספות או שינויים מהותיים", bad, warn)


def _res(i: int, name: str, bad: list[str], warn: list[str] | None = None) -> dict:
    status = "fail" if bad else ("warn" if warn else "pass")
    return {"id": i, "name": name, "status": status, "details": bad + (warn or [])[:60], "fails": len(bad), "warnings": len(warn or [])}


def summarize(checks: list[dict]) -> dict:
    fails = [c for c in checks if c["status"] == "fail"]
    pend = [c for c in checks if c["status"] == "pending"]
    ready = not fails and not pend
    return {"ready": ready, "failed": [c["id"] for c in fails], "pending": [c["id"] for c in pend],
            "label": "מוכן" if ready else ("נכשלו בדיקות: " + ", ".join(map(str, [c["id"] for c in fails])) if fails else "ממתין לבודק העצמאי")}


def report_markdown(title: str, summary: dict, checks: list[dict]) -> str:
    lines = [f"# דוח בקרה – {title}", "", f"**מצב: {summary['label']}**", ""]
    icon = {"pass": "✅", "warn": "⚠️", "fail": "❌", "pending": "⏳"}
    for c in checks:
        lines.append(f"## {c['id']}. {c['name']} {icon[c['status']]}")
        if c.get("details"):
            lines += [f"- {d}" for d in c["details"][:80]]
            if len(c["details"]) > 80:
                lines.append(f"- … ועוד {len(c['details']) - 80}")
        lines.append("")
    return "\n".join(lines)
