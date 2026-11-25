"""Create sample files of every supported type (needs python-docx, openpyxl,
python-pptx, and LibreOffice for .doc/.rtf/.odt/.pdf conversion)."""
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

    if shutil.which("soffice"):
        src = os.path.join(out, "sample.docx")
        for fmt in ("doc", "rtf", "odt", "pdf"):
            subprocess.run(["soffice", "--headless", "--convert-to", fmt,
                            "--outdir", out, src], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == "__main__":
    main(sys.argv[1])
