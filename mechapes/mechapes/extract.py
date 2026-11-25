"""Extract plain text from many file types. Pure Python except PDF (PyMuPDF)."""
import html
import os
import re
import struct
import zipfile

from .textutil import fix_reversed_hebrew

TEXT_EXT = {
    ".txt", ".md", ".csv", ".tsv", ".log", ".ini", ".json", ".xml", ".yaml",
    ".yml", ".py", ".js", ".ts", ".java", ".c", ".cpp", ".h", ".cs", ".sql",
    ".bat", ".ps1", ".sh", ".css", ".srt", ".vtt", ".tex", ".bib",
}
HTML_EXT = {".html", ".htm", ".xhtml", ".mht"}
DOCX_EXT = {".docx", ".docm", ".dotx", ".dotm"}
XLSX_EXT = {".xlsx", ".xlsm", ".xltx"}
PPTX_EXT = {".pptx", ".pptm", ".ppsx"}
ODF_EXT = {".odt", ".ods", ".odp"}
OTHER_EXT = {".pdf", ".rtf", ".doc", ".epub"}

SUPPORTED_EXT = (TEXT_EXT | HTML_EXT | DOCX_EXT | XLSX_EXT | PPTX_EXT
                 | ODF_EXT | OTHER_EXT)

# Groups for the type filter in the UI
TYPE_GROUPS = {
    "Word": DOCX_EXT | {".doc", ".rtf", ".odt"},
    "PDF": {".pdf"},
    "Excel": XLSX_EXT | {".ods", ".csv", ".tsv"},
    "PowerPoint": PPTX_EXT | {".odp"},
    "טקסט / HTML": (TEXT_EXT - {".csv", ".tsv"}) | HTML_EXT | {".epub"},
}


class ExtractError(Exception):
    pass


# ---------------------------------------------------------------- plain text
def decode_bytes(data: bytes) -> str:
    if data.startswith(b"\xef\xbb\xbf"):
        return data[3:].decode("utf-8", "replace")
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        return data.decode("utf-16", "replace")
    # UTF-16 without BOM: many NULs at odd/even positions
    sample = data[:4000]
    if sample and sample.count(b"\x00") > len(sample) // 4:
        le = sample[1::2].count(b"\x00") > sample[0::2].count(b"\x00")
        return data.decode("utf-16-le" if le else "utf-16-be", "replace")
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("cp1255", "replace")  # Hebrew Windows


def read_text(path):
    with open(path, "rb") as f:
        return decode_bytes(f.read())


# ---------------------------------------------------------------- XML helpers
_TAG_RE = re.compile(r"<[^>]+>")


def _xml_text(xml: str, para_tags=("w:p", "a:p", "text:p", "text:h", "row")) -> str:
    # Turn paragraph ends / tabs / breaks into whitespace, then drop tags.
    for t in para_tags:
        xml = xml.replace(f"</{t}>", "\n")
    xml = re.sub(r"<(w:tab|w:br|w:cr|a:br|text:tab|text:line-break|text:s)\b[^>]*/?>",
                 " ", xml)
    xml = re.sub(r"</(c|si|w:tc|table:table-cell)>", " ", xml)
    return html.unescape(_TAG_RE.sub("", xml))


def _zip_read(z, name):
    return z.read(name).decode("utf-8", "replace")


def _natural_key(name):
    return [int(s) if s.isdigit() else s for s in re.split(r"(\d+)", name)]


def extract_docx(path):
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        parts = ["word/document.xml"]
        parts += sorted(n for n in names if re.match(r"word/(header|footer)\d*\.xml$", n))
        parts += [n for n in ("word/footnotes.xml", "word/endnotes.xml",
                              "word/comments.xml") if n in names]
        out = []
        for p in parts:
            if p in names:
                xml = _zip_read(z, p)
                # Drop deleted text (track changes) and field instructions
                xml = re.sub(r"<w:delText\b[^>]*>.*?</w:delText>", "", xml, flags=re.S)
                xml = re.sub(r"<w:instrText\b[^>]*>.*?</w:instrText>", "", xml, flags=re.S)
                out.append(_xml_text(xml))
        return "\n".join(out)


def extract_xlsx(path):
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        shared = []
        if "xl/sharedStrings.xml" in names:
            xml = _zip_read(z, "xl/sharedStrings.xml")
            for si in re.findall(r"<si\b[^>]*>(.*?)</si>", xml, flags=re.S):
                shared.append(html.unescape(_TAG_RE.sub("", si)))
        out = []
        sheets = sorted((n for n in names if re.match(r"xl/worksheets/sheet\d+\.xml$", n)),
                        key=_natural_key)
        cell_re = re.compile(r"<c\b([^>]*?)(?:/>|>(.*?)</c>)", re.S)
        for s in sheets:
            xml = _zip_read(z, s)
            for row in re.findall(r"<row\b[^>]*>(.*?)</row>", xml, flags=re.S):
                cells = []
                for attrs, inner in cell_re.findall(row):
                    if not inner:
                        continue
                    t = re.search(r'\bt="(\w+)"', attrs)
                    t = t.group(1) if t else "n"
                    if t == "s":
                        v = re.search(r"<v>(\d+)</v>", inner)
                        if v and int(v.group(1)) < len(shared):
                            cells.append(shared[int(v.group(1))])
                    elif t == "inlineStr":
                        cells.append(html.unescape(_TAG_RE.sub("", inner)))
                    else:
                        v = re.search(r"<v>(.*?)</v>", inner, flags=re.S)
                        if v:
                            cells.append(html.unescape(v.group(1)))
                if cells:
                    out.append("\t".join(cells))
        return "\n".join(out)


def extract_pptx(path):
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        slides = sorted((n for n in names
                         if re.match(r"ppt/(slides/slide|notesSlides/notesSlide)\d+\.xml$", n)),
                        key=_natural_key)
        return "\n\n".join(_xml_text(_zip_read(z, s)) for s in slides)


def extract_odf(path):
    with zipfile.ZipFile(path) as z:
        return _xml_text(_zip_read(z, "content.xml"))


def extract_epub(path):
    with zipfile.ZipFile(path) as z:
        parts = sorted((n for n in z.namelist()
                        if n.lower().endswith((".xhtml", ".html", ".htm"))),
                       key=_natural_key)
        return "\n\n".join(html_to_text(_zip_read(z, p)) for p in parts)


# ---------------------------------------------------------------- HTML
def html_to_text(s: str) -> str:
    s = re.sub(r"(?is)<(script|style|head)\b.*?</\1>", " ", s)
    s = re.sub(r"(?i)<(br|/p|/div|/h\d|/li|/tr)\b[^>]*>", "\n", s)
    s = _TAG_RE.sub(" ", s)
    return html.unescape(s)


def extract_html(path):
    with open(path, "rb") as f:
        data = f.read()
    m = re.search(rb'charset=["\']?([\w-]+)', data[:3000], re.I)
    text = None
    if m:
        try:
            text = data.decode(m.group(1).decode("ascii"), "replace")
        except LookupError:
            pass
    if text is None:
        text = decode_bytes(data)
    return html_to_text(text)


# ---------------------------------------------------------------- RTF
_RTF_DEST_SKIP = {
    "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "header",
    "footer", "headerl", "headerr", "footerl", "footerr", "listtable",
    "listoverridetable", "rsidtbl", "generator", "themedata", "colorschememapping",
    "datastore", "latentstyles", "xmlnstbl", "fldinst", "bkmkstart", "bkmkend",
    "revtbl", "pgdsctbl", "filetbl", "mmathPr", "wgrffmtfilter",
}
_RTF_TOKEN = re.compile(rb"\\([a-zA-Z]+)(-?\d+)? ?|\\'([0-9a-fA-F]{2})|\\(.)|([{}])|([^\\{}\r\n]+)|[\r\n]+",
                        re.S)


def extract_rtf(path):
    with open(path, "rb") as f:
        data = f.read()
    m = re.search(rb"\\ansicpg(\d+)", data[:2000])
    codepage = f"cp{m.group(1).decode()}" if m else "cp1255"
    try:
        "".encode(codepage)
    except LookupError:
        codepage = "cp1255"
    fonts_cp = {}  # font number -> codepage from \fcharset
    for fm in re.finditer(rb"\\f(\d+)[^{}]*?\\fcharset(\d+)", data[:200000]):
        cs = int(fm.group(2))
        cp = {177: "cp1255", 178: "cp1256", 0: "cp1252", 204: "cp1251", 161: "cp1253"}.get(cs)
        if cp:
            fonts_cp[fm.group(1)] = cp

    out = []
    pending = bytearray()
    cur_cp = codepage
    stack = []
    skip = False
    uc = 1
    skip_chars = 0
    first_in_group = False

    def flush():
        if pending:
            out.append(pending.decode(cur_cp, "replace"))
            pending.clear()

    for m in _RTF_TOKEN.finditer(data):
        word, arg, hexc, sym, brace, text = m.groups()
        if brace == b"{":
            flush()
            stack.append((skip, uc, cur_cp))
            first_in_group = True
            continue
        if brace == b"}":
            flush()
            if stack:
                skip, uc, cur_cp = stack.pop()
            first_in_group = False
            continue
        was_first = first_in_group
        first_in_group = False
        if sym is not None:
            if sym == b"*" and was_first:
                skip = True
                first_in_group = False
            elif not skip and sym in (b"\\", b"{", b"}"):
                pending.extend(sym)
            elif not skip and sym == b"~":
                pending.extend(b" ")
            continue
        if word is not None:
            w = word.decode()
            if w in _RTF_DEST_SKIP:
                skip = True
            if skip:
                continue
            if w == "uc" and arg:
                uc = int(arg)
            elif w == "u" and arg:
                flush()
                n = int(arg)
                out.append(chr(n + 65536 if n < 0 else n))
                skip_chars = uc
            elif w in ("par", "line", "sect", "page", "row"):
                flush()
                out.append("\n")
            elif w in ("tab", "cell"):
                flush()
                out.append("\t")
            elif w == "f" and arg is not None:
                flush()
                cur_cp = fonts_cp.get(arg, codepage)
            continue
        if skip:
            continue
        if hexc is not None:
            if skip_chars:
                skip_chars -= 1
                continue
            pending.append(int(hexc, 16))
            continue
        if text is not None:
            if skip_chars:
                n = min(skip_chars, len(text))
                text = text[n:]
                skip_chars -= n
            pending.extend(text)
    flush()
    return "".join(out)


# ---------------------------------------------------------------- legacy .doc
def extract_doc(path):
    """Read text from a Word 97-2003 .doc via its piece table."""
    import olefile
    if not olefile.isOleFile(path):
        # Some ".doc" files are really RTF or HTML
        with open(path, "rb") as f:
            head = f.read(10)
        if head.startswith(b"{\\rtf"):
            return extract_rtf(path)
        return extract_html(path)
    with olefile.OleFileIO(path) as ole:
        wd = ole.openstream("WordDocument").read()
        flags = struct.unpack_from("<H", wd, 0x0A)[0]
        if flags & 0x0100:
            raise ExtractError("קובץ מוצפן")
        table_name = "1Table" if flags & 0x0200 else "0Table"
        if not ole.exists(table_name):
            raise ExtractError("מבנה doc לא מוכר")
        table = ole.openstream(table_name).read()
        fc_clx, lcb_clx = struct.unpack_from("<II", wd, 0x01A2)
        clx = table[fc_clx:fc_clx + lcb_clx]
        pos = 0
        while pos < len(clx) and clx[pos] == 0x01:  # Prc entries
            cb = struct.unpack_from("<H", clx, pos + 1)[0]
            pos += 3 + cb
        if pos >= len(clx) or clx[pos] != 0x02:
            raise ExtractError("טבלת קטעים חסרה")
        lcb = struct.unpack_from("<I", clx, pos + 1)[0]
        plc = clx[pos + 5:pos + 5 + lcb]
        n = (lcb - 4) // 12
        cps = struct.unpack_from(f"<{n + 1}I", plc, 0)
        out = []
        for i in range(n):
            pcd_off = 4 * (n + 1) + 8 * i
            fc = struct.unpack_from("<I", plc, pcd_off + 2)[0]
            count = cps[i + 1] - cps[i]
            if fc & 0x40000000:
                start = (fc & ~0x40000000) // 2
                out.append(wd[start:start + count].decode("cp1252", "replace"))
            else:
                out.append(wd[fc:fc + 2 * count].decode("utf-16-le", "replace"))
        text = "".join(out)
        # Word control characters -> whitespace; drop field codes
        text = re.sub("\x13[^\x14\x15]*\x14?", "", text)
        text = re.sub("[\x00-\x08\x0b\x0c\x0e-\x1f\x15]", "\n", text)
        return text.replace("\r", "\n")


# ---------------------------------------------------------------- PDF
_MARK_RE = re.compile("[\u0591-\u05C7]")


def extract_pdf(path):
    import pymupdf
    pages = []
    with pymupdf.open(path) as doc:
        if doc.needs_pass:
            raise ExtractError("קובץ מוגן בסיסמה")
        for page in doc:
            t = page.get_text("text")
            # Pointed (niqqud) Hebrew: MuPDF inserts spaces between the marks
            # and their letters. If the page is heavily pointed, rely only on
            # the real space characters of the PDF.
            if len(_MARK_RE.findall(t)) > len(t) * 0.05:
                t = page.get_text("text", flags=pymupdf.TEXT_INHIBIT_SPACES
                                  | pymupdf.TEXT_PRESERVE_WHITESPACE)
            pages.append(t)
    text = "\n".join(pages)
    return fix_reversed_hebrew(text)


# ---------------------------------------------------------------- dispatch
def extract(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext in TEXT_EXT:
        return read_text(path)
    if ext in HTML_EXT:
        return extract_html(path)
    if ext in DOCX_EXT:
        return extract_docx(path)
    if ext in XLSX_EXT:
        return extract_xlsx(path)
    if ext in PPTX_EXT:
        return extract_pptx(path)
    if ext in ODF_EXT:
        return extract_odf(path)
    if ext == ".pdf":
        return extract_pdf(path)
    if ext == ".rtf":
        return extract_rtf(path)
    if ext == ".doc":
        return extract_doc(path)
    if ext == ".epub":
        return extract_epub(path)
    raise ExtractError("סוג קובץ לא נתמך")
