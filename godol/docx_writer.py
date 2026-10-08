"""Builds the Word file directly as OOXML: real footnotes (Hebrew letters, restarting in each chapter),
Word comments authored by "Claude", internal links between notes and text, 17x24 cm RTL pages in David 12.
When the pilot .docx is present in materials/, its styles and page geometry are used, so the output matches it."""
from __future__ import annotations

import re
import time
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from . import config
from .assemble import Assembled
from .schema import TOKEN

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS = f'xmlns:w="{W}" xmlns:r="{R}"'
HEB = re.compile(r"[֐-׿]")


def esc(s: str) -> str:
    return escape(s, {'"': "&quot;"})


# ---------------------------------------------------------------------------------------- styles
def _styles_xml() -> str:
    f, sz, fsz = config.FONT, config.BODY_HALF_POINTS, config.FOOTNOTE_HALF_POINTS

    def heading(sid, name, outline, size, before, after):
        return (f'<w:style w:type="paragraph" w:styleId="{sid}"><w:name w:val="{name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>'
                f'<w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="{before}" w:after="{after}"/><w:jc w:val="center"/>'
                f'<w:outlineLvl w:val="{outline}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr></w:style>')

    return (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles {NS}>'
            f'<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="{f}" w:hAnsi="{f}" w:cs="{f}" w:eastAsia="{f}"/>'
            f'<w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/><w:lang w:val="en-US" w:eastAsia="he-IL" w:bidi="he-IL"/></w:rPr></w:rPrDefault>'
            f'<w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault></w:docDefaults>'
            f'<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>'
            f'<w:pPr><w:bidi/><w:spacing w:after="120" w:line="320" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:style>'
            f'<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>'
            + heading("Heading1", "heading 1", 0, 36, 240, 120)
            + heading("Heading2", "heading 2", 1, 30, 360, 120)
            + heading("Heading3", "heading 3", 2, 26, 240, 80)
            + f'<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:link w:val="FootnoteTextChar"/>'
              f'<w:pPr><w:spacing w:after="40" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="{fsz}"/><w:szCs w:val="{fsz}"/></w:rPr></w:style>'
              f'<w:style w:type="character" w:styleId="FootnoteTextChar"><w:name w:val="Footnote Text Char"/><w:link w:val="FootnoteText"/><w:rPr><w:sz w:val="{fsz}"/><w:szCs w:val="{fsz}"/></w:rPr></w:style>'
              f'<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>'
              f'<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="1F3A6E"/><w:u w:val="single"/></w:rPr></w:style>'
              f'<w:style w:type="character" w:styleId="NoteRef"><w:name w:val="Note Ref"/><w:rPr><w:vertAlign w:val="superscript"/><w:color w:val="1F3A6E"/></w:rPr></w:style>'
              f'<w:style w:type="character" w:styleId="CommentReference"><w:name w:val="annotation reference"/><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>'
              f'<w:style w:type="paragraph" w:styleId="CommentText"><w:name w:val="annotation text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>'
              f'</w:styles>')


REQUIRED_STYLES = ["Normal", "Heading1", "Heading2", "Heading3", "FootnoteText", "FootnoteReference", "Hyperlink", "NoteRef",
                   "CommentReference", "CommentText"]


def _merge_pilot(pilot: Path) -> tuple[str, dict]:
    """Styles from the pilot, plus any of our required styles that the pilot lacks; and its page geometry."""
    with zipfile.ZipFile(pilot) as z:
        styles = z.read("word/styles.xml").decode("utf-8")
        doc = z.read("word/document.xml").decode("utf-8")
    ours = _styles_xml()
    missing = ""
    for sid in REQUIRED_STYLES:
        if f'w:styleId="{sid}"' not in styles:
            m = re.search(rf'<w:style [^>]*w:styleId="{sid}".*?</w:style>', ours, re.S)
            if m:
                missing += m.group(0)
    styles = styles.replace("</w:styles>", missing + "</w:styles>")
    geo = {}
    sp = re.findall(r"<w:sectPr.*?</w:sectPr>", doc, re.S)
    if sp:
        pg = re.search(r"<w:pgSz[^>]*/>", sp[-1]); mg = re.search(r"<w:pgMar[^>]*/>", sp[-1])
        geo = {"pgSz": pg.group(0) if pg else None, "pgMar": mg.group(0) if mg else None}
    return styles, geo


# ---------------------------------------------------------------------------------------- inline
class Ctx:
    def __init__(self, a: Assembled):
        self.a = a
        self.bm = 0
        self.cm = 0
        self.fn_order: list[str] = []       # footnote ids in document order
        self.fn_num: dict[str, int] = {}
        self.comments: list[tuple[int, str]] = []
        self.notes_present = {b["number"] for b in a.blocks if b["kind"] == "note"}
        self.exc_present = {b["letter"] for b in a.blocks if b["kind"] == "exc_h"}
        self.comment_by_block: dict[str, list[dict]] = {}
        for c in a.comments:
            self.comment_by_block.setdefault(c["block"], []).append(c)
        self.bookmarks: set[str] = set()

    def bid(self) -> int:
        self.bm += 1
        return self.bm


def _rpr(bold=False, rtl=False, style=None, extra="") -> str:
    p = ""
    if style:
        p += f'<w:rStyle w:val="{style}"/>'
    if bold:
        p += "<w:b/><w:bCs/>"
    p += extra
    if rtl:
        p += "<w:rtl/>"
    return f"<w:rPr>{p}</w:rPr>" if p else ""


def _text_run(t: str, bold=False, style=None, extra="") -> str:
    if not t:
        return ""
    rtl = bool(HEB.search(t))
    return f'<w:r>{_rpr(bold, rtl, style, extra)}<w:t xml:space="preserve">{esc(t)}</w:t></w:r>'


def _bold_split(text: str):
    """Yields (segment, bold) for **bold** markup."""
    parts = text.split("**")
    for i, seg in enumerate(parts):
        if seg:
            yield seg, i % 2 == 1


def inline_xml(text: str, ctx: Ctx, in_footnote: bool = False) -> str:
    """Text with ⟦fn:ID⟧ ⟦nn:N⟧ ⟦ex:L⟧ tokens and **bold** -> runs."""
    out, pos = [], 0

    def plain(s):
        return "".join(_text_run(seg, b) for seg, b in _bold_split(s))

    for m in TOKEN.finditer(text):
        out.append(plain(text[pos:m.start()]))
        kind, val = m.group(1), m.group(2)
        if kind == "fn" and not in_footnote and val in ctx.a.footnotes:
            if val not in ctx.fn_num:
                ctx.fn_order.append(val)
                ctx.fn_num[val] = len(ctx.fn_order)
            out.append(f'<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="{ctx.fn_num[val]}"/></w:r>')
        elif kind == "nn":
            n = int(re.sub(r"\D", "", val) or 0)
            lab = _text_run(str(n), style="NoteRef")
            if n in ctx.notes_present:
                bid = ctx.bid(); ctx.bookmarks.add(f"ref_{n}")
                out.append(f'<w:bookmarkStart w:id="{bid}" w:name="ref_{n}"/><w:hyperlink w:anchor="note_{n}" w:history="1">{lab}</w:hyperlink><w:bookmarkEnd w:id="{bid}"/>')
            else:
                out.append(lab)
        elif kind == "ex":
            if val in ctx.exc_present:
                out.append(f'<w:hyperlink w:anchor="exc_{val}" w:history="1">{_text_run("↩" if False else "", style="Hyperlink")}</w:hyperlink>')
        pos = m.end()
    out.append(plain(text[pos:]))
    return "".join(out)


def _link_text_for_ex(text: str, ctx: Ctx) -> str:
    """A pointer "see excursus X" becomes a link on its own words."""
    m = re.search(r"(ראה נספח [^⟦]*?בסוף הפרק)\s*⟦ex:([^⟧]+)⟧", text)
    if not m:
        return inline_xml(text, ctx)
    L = m.group(2)
    before, after = text[:m.start()], text[m.end():]
    if L not in ctx.exc_present:
        return inline_xml(before + m.group(1) + after, ctx)
    link = f'<w:hyperlink w:anchor="exc_{L}" w:history="1">{_text_run(m.group(1), style="Hyperlink")}</w:hyperlink>'
    return inline_xml(before, ctx) + link + inline_xml(after, ctx)


def _with_comments(block: dict, body_xml_fn, ctx: Ctx) -> str:
    """Wraps the words a review_flag points to in a comment range; whole paragraph when the words are not found."""
    cs = ctx.comment_by_block.get(block["id"], [])
    if not cs:
        return body_xml_fn(block["text"])
    text = block["text"]
    plain = TOKEN.sub("", text).replace("**", "")
    ranges = []
    whole = []
    for c in cs:
        cid = ctx.cm; ctx.cm += 1
        ctx.comments.append((cid, c["text"]))
        w = (c["words"] or "").strip()
        i = text.find(w) if w else -1
        if i >= 0 and "⟦" not in w and "**" not in w:
            ranges.append((i, i + len(w), cid))
        else:
            whole.append(cid)
    ranges.sort()
    xml, pos = "", 0
    for s, e, cid in ranges:
        if s < pos:
            whole.append(cid); continue
        xml += body_xml_fn(text[pos:s])
        xml += f'<w:commentRangeStart w:id="{cid}"/>' + body_xml_fn(text[s:e]) + f'<w:commentRangeEnd w:id="{cid}"/>' + _cref(cid)
        pos = e
    xml += body_xml_fn(text[pos:])
    if whole:
        xml = "".join(f'<w:commentRangeStart w:id="{c}"/>' for c in whole) + xml + "".join(f'<w:commentRangeEnd w:id="{c}"/>' + _cref(c) for c in whole)
    _ = plain
    return xml


def _cref(cid: int) -> str:
    return f'<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="{cid}"/></w:r>'


def _para(style: str, inner: str, ppr_extra: str = "") -> str:
    return f'<w:p><w:pPr><w:pStyle w:val="{style}"/>{ppr_extra}<w:bidi/></w:pPr>{inner}</w:p>'


# ---------------------------------------------------------------------------------------- body
def _blocks_xml(a: Assembled, ctx: Ctx) -> str:
    out = []
    for b in a.blocks:
        k = b["kind"]
        if k in ("h1", "h2", "h3"):
            st = {"h1": "Heading1", "h2": "Heading2", "h3": "Heading3"}[k]
            out.append(_para(st, _with_comments(b, lambda t: inline_xml(t, ctx), ctx)))
        elif k == "p" or k == "exc_p":
            out.append(_para("Normal", _with_comments(b, lambda t: inline_xml(t, ctx), ctx)))
        elif k == "note":
            n = b["number"]
            bid = ctx.bid(); ctx.bookmarks.add(f"note_{n}")
            lead = f'<w:bookmarkStart w:id="{bid}" w:name="note_{n}"/>{_text_run(str(n) + ". ", bold=True)}<w:bookmarkEnd w:id="{bid}"/>'
            body = _with_comments(b, lambda t: _link_text_for_ex(t, ctx), ctx)
            back = ""
            if f"ref_{n}" in _refs(a):
                back = f' <w:hyperlink w:anchor="ref_{n}" w:history="1">{_text_run("↩", style="Hyperlink")}</w:hyperlink>'
            out.append(_para("Normal", lead + body + back))
        elif k == "exc_h":
            L = b["letter"]
            bid = ctx.bid(); ctx.bookmarks.add(f"exc_{L}")
            head = f'<w:bookmarkStart w:id="{bid}" w:name="exc_{L}"/>{_with_comments(b, lambda t: inline_xml(t, ctx), ctx)}<w:bookmarkEnd w:id="{bid}"/>'
            out.append(_para("Heading3", head))
            n = b.get("ref") or 0
            if n and n in ctx.notes_present:
                out.append(_para("Normal", f'<w:hyperlink w:anchor="note_{n}" w:history="1">{_text_run("↩ להערה " + str(n), style="Hyperlink")}</w:hyperlink>'))
    return "".join(out)


def _refs(a: Assembled) -> set[str]:
    s = set()
    for b in a.blocks:
        for k, v in re.findall(r"⟦(nn):([^⟧]+)⟧", b["text"]):
            s.add("ref_" + re.sub(r"\D", "", v))
    return s


def _footnotes_xml(ctx: Ctx) -> str:
    items = ['<w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote>',
             '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>']
    for fid in ctx.fn_order:
        n = ctx.fn_num[fid]
        text = ctx.a.footnotes[fid]
        body = inline_xml(text, ctx, in_footnote=True)
        items.append(f'<w:footnote w:id="{n}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/><w:bidi/></w:pPr>'
                     f'<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>{_text_run(" ")}{body}</w:p></w:footnote>')
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes {NS}>' + "".join(items) + "</w:footnotes>"


def _comments_xml(ctx: Ctx) -> str:
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    items = []
    for cid, text in ctx.comments:
        items.append(f'<w:comment w:id="{cid}" w:author="{esc(config.REVIEW_AUTHOR)}" w:date="{now}" w:initials="C"><w:p><w:pPr><w:pStyle w:val="CommentText"/><w:bidi/></w:pPr>'
                     f'<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>{_text_run(text)}</w:p></w:comment>')
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments {NS}>' + "".join(items) + "</w:comments>"


def _sect(geo: dict) -> str:
    pgsz = geo.get("pgSz") or f'<w:pgSz w:w="{config.PAGE_W_TWIPS}" w:h="{config.PAGE_H_TWIPS}"/>'
    pgmar = geo.get("pgMar") or (f'<w:pgMar w:top="{config.MARGIN_TWIPS}" w:right="{config.MARGIN_TWIPS}" w:bottom="{config.MARGIN_TWIPS}" '
                                 f'w:left="{config.MARGIN_TWIPS}" w:header="567" w:footer="567" w:gutter="0"/>')
    return (f'<w:sectPr><w:footnotePr><w:numFmt w:val="hebrew1"/><w:numRestart w:val="eachSect"/></w:footnotePr>'
            f'{pgsz}{pgmar}<w:cols w:space="708"/><w:bidi/></w:sectPr>')


SETTINGS = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings {NS}><w:zoom w:percent="100"/>'
            '<w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>'
            '<w:footnotePr><w:numFmt w:val="hebrew1"/><w:numRestart w:val="eachSect"/><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>'
            '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>'
            '<w:themeFontLang w:val="en-US" w:bidi="he-IL"/></w:settings>')

CONTENT_TYPES = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                 '<Default Extension="xml" ContentType="application/xml"/>'
                 '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
                 '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
                 '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
                 '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>'
                 '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>'
                 '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
                 '</Types>')
ROOT_RELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
             '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
             '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
             '</Relationships>')
DOC_RELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
            '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>'
            '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>'
            '</Relationships>')


def build_docx(a: Assembled, out: Path, title: str = "", pilot: Path | None = None) -> dict:
    """Writes `out`. Returns facts about the file for the QA step."""
    if pilot is None:
        cand = config.MATERIALS / "פיילוט.docx"
        pilot = cand if cand.exists() else None
        if pilot is None:
            for p in config.MATERIALS.glob("*.docx"):
                pilot = p
                break
    styles, geo = (_merge_pilot(pilot) if pilot else (_styles_xml(), {}))
    ctx = Ctx(a)
    body = _blocks_xml(a, ctx)
    fn_xml = _footnotes_xml(ctx)
    doc = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {NS}><w:body>{body}{_sect(geo)}</w:body></w:document>')
    core = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            f'<dc:title>{esc(title)}</dc:title><dc:creator>Claude</dc:creator><dc:language>he-IL</dc:language></cp:coreProperties>')
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", ROOT_RELS)
        z.writestr("word/_rels/document.xml.rels", DOC_RELS)
        z.writestr("word/document.xml", doc)
        z.writestr("word/styles.xml", styles)
        z.writestr("word/settings.xml", SETTINGS)
        z.writestr("word/footnotes.xml", fn_xml)
        z.writestr("word/comments.xml", _comments_xml(ctx))
        z.writestr("docProps/core.xml", core)
    unreferenced = [f for f in a.footnotes if f not in ctx.fn_num]
    return {"footnotes_written": len(ctx.fn_order), "footnotes_unreferenced": unreferenced, "comments": len(ctx.comments),
            "bookmarks": sorted(ctx.bookmarks), "template": pilot.name if pilot else "ברירת מחדל (פיילוט לא נמצא)"}
