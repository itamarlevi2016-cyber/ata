"""Create sample files of every supported type (needs python-docx, openpyxl,
python-pptx, and LibreOffice for .doc/.rtf/.odt/.pdf conversion)."""
import base64
import os
import shutil
import subprocess
import sys

TEXT = ("ויאמר משה אל העם לאמר זכור את היום הזה אשר יצאתם ממצרים. "
        "וּבַיּוֹם הַשְּׁבִיעִי יִשְׁבֹּת משה מכל מלאכתו. "
        "הרמב\"ם כתב בספר המדע שהלכה כמותו. The quick brown fox jumps.")


def main(out):
    os.makedirs(out, exist_ok=True)
    import docx
    import openpyxl
    import pptx

    d = docx.Document()
    for line in TEXT.split(". "):
        d.add_paragraph(line)
    d.save(os.path.join(out, "sample.docx"))

    wb = openpyxl.Workbook()
    ws = wb.active
    ws["A1"] = "שלום עולם ומלואו"
    ws["B2"] = "בית המקדש השלישי"
    ws["C3"] = 1234
    wb.save(os.path.join(out, "sample.xlsx"))

    p = pptx.Presentation()
    s = p.slides.add_slide(p.slide_layouts[1])
    s.shapes.title.text = "מצגת על ירושלים"
    s.placeholders[1].text = "עיר הקודש והחומות העתיקות"
    p.save(os.path.join(out, "sample.pptx"))

    with open(os.path.join(out, "sample_utf8.txt"), "w", encoding="utf-8") as f:
        f.write(TEXT)
    with open(os.path.join(out, "sample_1255.txt"), "wb") as f:
        f.write("ספר בראשית ברא אלהים את השמים ואת הארץ".encode("cp1255"))
    with open(os.path.join(out, "sample.html"), "w", encoding="utf-8") as f:
        f.write("<html><head><meta charset='utf-8'><style>x{}</style></head>"
                "<body><p>דף אינטרנט עם &quot;ציטוט&quot; ותוכן</p></body></html>")

    with open(os.path.join(out, "sample.eml"), "w", encoding="utf-8") as f:
        f.write("Subject: =?utf-8?b?" + base64.b64encode("הזמנה לחתונה".encode()).decode()
                + "?=\nFrom: a@example.com\nMIME-Version: 1.0\n"
                "Content-Type: text/plain; charset=utf-8\n"
                "Content-Transfer-Encoding: base64\n\n"
                + base64.b64encode("שלום רב, אתם מוזמנים לשמחה".encode()).decode() + "\n")

    if shutil.which("soffice"):
        for src, fmts in (("sample.docx", ("doc", "rtf", "odt", "pdf")),
                          ("sample.xlsx", ("xls",)), ("sample.pptx", ("ppt",))):
            for fmt in fmts:
                subprocess.run(["soffice", "--headless", "--convert-to", fmt, "--outdir",
                                out, os.path.join(out, src)], check=True,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        make_pdf(os.path.join(out, "sample.pdf"))


def make_pdf(path):
    """PDF with Hebrew text, made with PyMuPDF (when LibreOffice is absent)."""
    import pymupdf
    font = None
    for cand in (r"C:\Windows\Fonts\arial.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(cand):
            font = cand
            break
    doc = pymupdf.open()
    page = doc.new_page()
    y = 72
    for line in TEXT.split(". "):
        plain = "".join(c for c in line if not "\u0591" <= c <= "\u05c7")
        page.insert_text((72, y), plain, fontfile=font, fontname="F0")
        y += 20
    doc.save(path)


if __name__ == "__main__":
    main(sys.argv[1])
