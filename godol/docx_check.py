"""Does the file open? Package integrity, XML well-formedness, relationships, footnote/comment/bookmark ids,
python-docx, and (when LibreOffice is installed) a real conversion to PDF."""
from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

from lxml import etree

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def validate_docx(path: Path, expect_footnotes: int | None = None, soffice: bool = True) -> dict:
    problems: list[str] = []
    notes: list[str] = []
    info: dict = {}
    try:
        z = zipfile.ZipFile(path)
        bad = z.testzip()
        if bad:
            problems.append(f"קובץ פגום בתוך החבילה: {bad}")
    except zipfile.BadZipFile:
        return {"ok": False, "problems": ["הקובץ אינו חבילת zip תקינה"], "notes": [], "info": {}}
    names = set(z.namelist())
    trees: dict[str, etree._Element] = {}
    for n in names:
        if n.endswith(".xml") or n.endswith(".rels"):
            try:
                trees[n] = etree.fromstring(z.read(n))
            except etree.XMLSyntaxError as e:
                problems.append(f"XML לא תקין ב-{n}: {e}")
    for req in ("[Content_Types].xml", "word/document.xml", "word/styles.xml", "word/footnotes.xml"):
        if req not in names:
            problems.append(f"חסר חלק חובה: {req}")
    # relationships point at existing parts
    rels = trees.get("word/_rels/document.xml.rels")
    if rels is not None:
        for r in rels:
            t = r.get("Target")
            if t and r.get("TargetMode") != "External" and f"word/{t}" not in names:
                problems.append(f"קשר מצביע על חלק שלא קיים: {t}")
    doc, fns, cms = trees.get("word/document.xml"), trees.get("word/footnotes.xml"), trees.get("word/comments.xml")
    if doc is not None and fns is not None:
        refs = [int(e.get(W + "id")) for e in doc.iter(W + "footnoteReference")]
        have = {int(e.get(W + "id")) for e in fns.iter(W + "footnote")}
        info["footnote_refs"] = len(refs)
        if len(set(refs)) != len(refs):
            problems.append("הערת שוליים מופנית יותר מפעם אחת")
        for r in set(refs):
            if r not in have:
                problems.append(f"footnoteReference {r} בלי הערה ב-footnotes.xml")
        real = {i for i in have if i > 0}
        for i in real - set(refs):
            problems.append(f"הערת שוליים {i} קיימת בקובץ ואין לה סימון בטקסט")
        if expect_footnotes is not None and expect_footnotes != len(refs):
            problems.append(f"מספר הערות השוליים בקובץ ({len(refs)}) שונה מהצפוי ({expect_footnotes})")
        for fn in fns.iter(W + "footnote"):
            if fn.get(W + "type") is None and not list(fn.iter(W + "footnoteRef")):
                problems.append(f"הערת שוליים {fn.get(W + 'id')} בלי footnoteRef")
        # footnote numbering format and per-chapter restart
        st = trees.get("word/settings.xml")
        fmt = [e.get(W + "val") for e in doc.iter(W + "numFmt")] + ([e.get(W + "val") for e in st.iter(W + "numFmt")] if st is not None else [])
        info["footnote_numfmt"] = sorted(set(fmt))
        if "hebrew1" not in fmt:
            problems.append("מספור הערות השוליים אינו באותיות עבריות (hebrew1)")
        if not any(e.get(W + "val") == "eachSect" for e in doc.iter(W + "numRestart")):
            problems.append("המספור לא מתחיל מחדש בכל פרק (numRestart=eachSect חסר)")
    if doc is not None:
        ids = [e.get(W + "id") for e in doc.iter(W + "commentRangeStart")]
        ends = [e.get(W + "id") for e in doc.iter(W + "commentRangeEnd")]
        crefs = [e.get(W + "id") for e in doc.iter(W + "commentReference")]
        have_c = {e.get(W + "id") for e in cms.iter(W + "comment")} if cms is not None else set()
        info["comments"] = len(have_c)
        if sorted(ids) != sorted(ends) or sorted(ids) != sorted(crefs):
            problems.append("הערות Word: טווחי תחילה/סוף/הפניה לא תואמים")
        for i in set(ids) | set(crefs):
            if i not in have_c:
                problems.append(f"הערה {i} חסרה ב-comments.xml")
        authors = {e.get(W + "author") for e in cms.iter(W + "comment")} if cms is not None else set()
        info["comment_authors"] = sorted(a for a in authors if a)
        bms = [e.get(W + "name") for e in doc.iter(W + "bookmarkStart")]
        bm_ids = [e.get(W + "id") for e in doc.iter(W + "bookmarkStart")]
        if len(set(bms)) != len(bms):
            problems.append("שמות סימניות כפולים")
        if len(set(bm_ids)) != len(bm_ids):
            problems.append("מזהי סימניות כפולים")
        for h in doc.iter(W + "hyperlink"):
            a = h.get(W + "anchor")
            if a and a not in bms:
                notes.append(f"קישור פנימי ליעד שאינו בקובץ: {a}")
        info["sections"] = len(list(doc.iter(W + "sectPr")))
        pg = next(doc.iter(W + "pgSz"), None)
        if pg is not None:
            w, h = int(pg.get(W + "w")), int(pg.get(W + "h"))
            info["page_cm"] = [round(w / 566.93, 1), round(h / 566.93, 1)]
    # python-docx
    try:
        import docx
        d = docx.Document(str(path))
        info["paragraphs"] = len(d.paragraphs)
    except Exception as e:  # noqa: BLE001
        problems.append(f"python-docx לא הצליח לפתוח: {e}")
    # LibreOffice round trip
    if soffice and shutil.which("soffice"):
        with tempfile.TemporaryDirectory() as td:
            try:
                r = subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", td, str(path)],
                                   capture_output=True, text=True, timeout=180,
                                   env={"HOME": td, "PATH": "/usr/bin:/bin:/usr/local/bin"})
                pdf = Path(td) / (path.stem + ".pdf")
                if r.returncode != 0 or not pdf.exists():
                    problems.append("LibreOffice לא הצליח להמיר את הקובץ: " + (r.stderr or r.stdout)[:200])
                else:
                    import pymupdf
                    pd = pymupdf.open(str(pdf))
                    info["pdf_pages"] = pd.page_count
                    txt = "".join(p.get_text() for p in pd)
                    info["pdf_has_text"] = bool(re.search(r"[֐-׿]", txt))
            except subprocess.TimeoutExpired:
                problems.append("המרה ב-LibreOffice חרגה מהזמן")
    else:
        notes.append("LibreOffice לא מותקן: לא בוצעה המרה לבדיקת פתיחה")
    return {"ok": not problems, "problems": problems, "notes": notes, "info": info}
