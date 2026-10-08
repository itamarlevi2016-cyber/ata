import json
import zipfile

import pytest

from conftest import make_pdf
from godol import assemble as asm_mod, names as names_mod, mapping, qa, schema
from godol.book import Book
from godol.docx_check import validate_docx
from godol.docx_writer import build_docx
from godol.llm import LLMError, MockLLM, Reply, Usage
from godol.pipeline import PageFailed, translate_range
from godol.service import build_segment


def el(**k):
    return MockLLM._el(**k)


def page(n, elements, **kw):
    base = dict(page=n, elements=elements, counts=dict(source_footnotes=0, asterisk_footnotes=0, numbered_notes=0, excursus_headings=0),
                first_sentence_src="x", last_sentence_src="y", first_sentence_he="", last_sentence_he="", dropped_artifacts=[], new_names=[])
    base.update(kw)
    return base


# ---- materials -----------------------------------------------------------------------------
def test_guide_tables_become_the_names_dictionary(env):
    db = names_mod.load_names(env / "materials")
    assert db.hebrew_of("Slabodka") == "סלבודקה"
    assert db.hebrew_of("R' Hayyim Soloveichik") == "ר' חיים סולובייצ'יק (מבריסק)"
    assert db.hebrew_of("Minsk") == "מינסק" and db.hebrew_of("Lida") == "לידה"   # "A / B / C" rows split pairwise
    assert db.hebrew_of("the Netziv") == 'הנצי"ב'


def test_longest_name_is_replaced_first(env):
    db = names_mod.NamesDB()
    db.load_text("Katz II = כץ ב\nKatz III = כץ ג\nKatz I = כץ א", "t")
    assert db.apply("see Katz III and Katz II") == "see כץ ג and כץ ב"


def test_book_map_gives_segments_and_the_log_gives_their_status(env):
    segs, src = mapping.load_segments(env / "materials")
    assert "מיפוי הספר.md" in src and "יומן התקדמות.md" in src
    by = {s.n: s for s in segs}
    assert (by[9].start, by[9].end) == (331, 379) and by[9].status == "partial"
    assert by[8].status == "done_outside" and by[8].end == 330
    assert mapping.next_todo(segs).n == 9
    assert len(segs) == 32 and (by[13].start, by[13].end, by[13].chapter, by[13].status) == (505, 553, 3, "todo")
    assert (by[27].start, by[27].end, by[27].chapter) == (1086, 1130, 5) and by[0].status == "done_outside"


def test_log_alone_still_gives_a_map_when_the_map_file_is_missing(env):
    (env / "materials" / "מיפוי הספר.md").unlink()
    segs, src = mapping.load_segments(env / "materials")
    assert len(segs) == 13 and "לא נמצא" in src


def test_hebrew_numerals_and_excursus_labels():
    assert [asm_mod.heb_num(n) for n in (1, 10, 11, 15, 16, 20, 27)] == ["א", "י", "יא", "טו", "טז", "כ", "כז"]
    assert asm_mod.excursus_label("D") == "ד (D)" and asm_mod.excursus_label("K") == "יא (K)" and asm_mod.excursus_label("AA") == "כז (AA)"


# ---- schema --------------------------------------------------------------------------------
def test_unreferenced_footnote_is_rejected():
    p = page(5, [el(type="body_paragraph", id="p1", text="טקסט", page=5), el(type="footnote_source", id="f5-a", text="הערה", marker="a", page=5)])
    assert any("referenced 0 times" in e for e in schema.validate_page(p, 5))
    p["elements"][0]["text"] = "טקסט ⟦fn:f5-a⟧"
    assert schema.validate_page(p, 5) == []


# ---- assembly ------------------------------------------------------------------------------
def test_paragraph_cut_by_page_break_is_one_paragraph():
    a = page(10, [el(id="a", text="תחילת המשפט", continues_next=True, page=10)])
    b = page(11, [el(id="b", text="וסופו.", continues_prev=True, page=11), el(id="c", text="פסקה הבאה.", page=11)])
    r = asm_mod.assemble([b, a])
    paras = [x["text"] for x in r.blocks if x["kind"] == "p"]
    assert paras == ["תחילת המשפט וסופו.", "פסקה הבאה."]


def test_chapter_structure_story_then_notes_then_excursuses():
    p = page(100, [
        el(type="heading_chapter", id="h", text="פרק שני\nהשם", page=100),
        el(id="s1", region="frame", text="סיפור ⟦nn:71⟧ ממשיך.", page=100),
        el(type="numbered_note", id="n71", number=71, text="ראה", region="notes", page=100),
        el(type="excursus_heading", id="e1", letter="D", text="כותרת הנספח", ref="71", region="excursus", page=100),
        el(type="excursus_body", id="e2", text="גוף הנספח", region="excursus", page=100),
    ])
    r = asm_mod.assemble([p])
    kinds = [b["kind"] for b in r.blocks]
    assert kinds == ["h1", "h1", "p", "h2", "note", "h2", "exc_h", "exc_p"]
    note = next(b for b in r.blocks if b["kind"] == "note")
    assert "ראה נספח ד (D) בסוף הפרק ⟦ex:D⟧" in note["text"]       # the pointer to the excursus is added


# ---- docx ----------------------------------------------------------------------------------
def _sample_asm():
    p = page(100, [
        el(type="heading_chapter", id="h", text="פרק שלישי\nשם הפרק", page=100),
        el(id="s1", region="frame", text="סיפור **מודגש** ⟦nn:71⟧ עם הערה ⟦fn:f100-a⟧ ועוד ⟦fn:f100-b⟧.", page=100),
        el(type="footnote_source", id="f100-a", text="הערה ראשונה", marker="a", page=100),
        el(type="footnote_source", id="f100-b", text="הערה שנייה", marker="b", page=100),
        el(type="numbered_note", id="n71", number=71, text="ההערה", region="notes", page=100),
        el(type="review_flag", id="r1", reason="ציטוט לא נמצא", words="מודגש", target="s1", page=100),
    ], counts=dict(source_footnotes=2, asterisk_footnotes=0, numbered_notes=1, excursus_headings=0))
    return asm_mod.assemble([p])


def test_docx_has_real_footnotes_comments_and_hebrew_numbering(env):
    out = env / "t.docx"
    facts = build_docx(_sample_asm(), out)
    assert facts["footnotes_written"] == 2 and facts["comments"] == 1
    z = zipfile.ZipFile(out)
    doc = z.read("word/document.xml").decode()
    assert doc.count("<w:footnoteReference") == 2 and 'w:numFmt w:val="hebrew1"' in doc and 'w:numRestart w:val="eachSect"' in doc
    assert 'w:author="Claude"' in z.read("word/comments.xml").decode()
    assert 'w:w="9639" w:h="13608"' in doc                          # 17 x 24 cm
    v = validate_docx(out)
    assert v["ok"], v["problems"]
    assert v["info"]["page_cm"] == [17.0, 24.0] and v["info"]["comment_authors"] == ["Claude"]


# ---- QA ------------------------------------------------------------------------------------
def test_qa_catches_latin_residue_and_wrong_counts(env):
    p = page(100, [el(id="s1", text="תרגום עם Brisk ו^ שאריות", page=100),
                   el(type="footnote_source", id="f", text="x", marker="a", page=100)],
             first_sentence_he="תרגום עם", last_sentence_he="שאריות")
    a = asm_mod.assemble([p])
    assert qa.check_latin(a)["status"] == "fail"
    assert qa.check_residue(a)["status"] == "fail"
    assert qa.check_counts([p])["status"] == "fail"                 # model counted 0 footnotes, 1 present


def test_qa_allows_the_guides_latin_exceptions():
    p = page(1, [el(id="s", text="הספר Making of a Godol, נספח (D), עמ' xxii, הערה w, KEY", page=1)])
    assert qa.check_latin(asm_mod.assemble([p]))["status"] == "pass"


def test_existing_name_is_never_changed_without_approval(env):
    book_dir = env / "work" / "bkx"
    book_dir.mkdir(parents=True)
    db = names_mod.load_names(env / "materials")
    items, conflicts = names_mod.add_pending(book_dir, db, [{"en": "Slabodka", "he": "סלובודקה"}, {"en": "Zed Newname", "he": "זד"}], 5)
    assert conflicts and conflicts[0]["dictionary"] == "סלבודקה"
    assert [i["en"] for i in items] == ["Zed Newname"]
    assert names_mod.approve_pending(book_dir, ["Zed Newname"]) == 1
    assert names_mod.load_names(env / "materials", book_dir).hebrew_of("Zed Newname") == "זד"


# ---- pipeline ------------------------------------------------------------------------------
def _book(env, pages=12):
    pdf = env / "t.pdf"
    make_pdf(pdf, pages)
    return Book.create("t.pdf", pdf.read_bytes())


def test_end_to_end_with_checkpoints_and_report(env):
    book = _book(env)
    llm = MockLLM()
    events = []
    translate_range(book, 3, 6, llm, events.append)
    assert book.done_pages() == [3, 4, 5, 6]
    calls = llm.calls
    translate_range(book, 3, 6, llm, events.append)                  # resume: nothing is translated twice
    assert llm.calls == calls
    rep = build_segment(book, 3, 6, llm=llm, verify=True, update_journal=True)
    assert rep["file"] == "קטע – עמ' 3–6.docx" and (book.out_dir / rep["file"]).exists()
    ids = {c["id"]: c["status"] for c in rep["checks"]}
    assert ids[7] == "pass" and ids[8] == "pass" and ids[3] == "pass"
    assert (book.out_dir / "דוח בקרה – קטע – עמ' 3–6.md").exists()
    log = (env / "work" / "יומן התקדמות (מדומה).md").read_text(encoding="utf-8")
    assert "תרגום אוטומטי, עמ' 3–6" in log and "Zalman Test = זלמן טסט" in log
    assert "Zalman" not in (env / "materials" / "יומן התקדמות.md").read_text(encoding="utf-8")   # the real log is untouched


class Flaky(MockLLM):
    def __init__(self, fail_times, kind="rate_limited", retryable=True):
        super().__init__(); self.left = fail_times; self.kind = kind; self.retryable = retryable
    def translate(self, system, content):
        if self.left > 0:
            self.left -= 1
            raise LLMError(self.kind, "boom", retryable=self.retryable)
        return super().translate(system, content)


def test_retries_are_bounded_and_a_failure_stops_the_run(env):
    book = _book(env)
    translate_range(book, 2, 2, Flaky(2), None)                      # recovers on the third attempt
    assert book.done_pages() == [2]
    with pytest.raises(PageFailed):
        translate_range(book, 3, 5, Flaky(99), None)                 # never continues silently
    assert book.done_pages() == [2]
    with pytest.raises(PageFailed) as e:
        translate_range(book, 3, 3, Flaky(1, "refusal", retryable=False), None)
    assert e.value.kind == "refusal"


class BadFootnotes(MockLLM):
    def translate(self, system, content):
        r = super().translate(system, content)
        for p in r.data["pages"]:
            for e in p["elements"]:
                e["text"] = e["text"].replace("⟦fn:", "⟦xx:")       # footnote never referenced -> invalid
        return r


def test_invalid_output_is_retried_then_rejected(env):
    book = _book(env)
    with pytest.raises(PageFailed) as e:
        translate_range(book, 2, 2, BadFootnotes(), None)
    assert e.value.kind == "invalid" and book.done_pages() == []


def test_redo_replaces_only_that_page_and_verifier_is_rerun_only_for_changed_pages(env):
    book = _book(env)
    llm = MockLLM()
    translate_range(book, 2, 4, llm, None)
    build_segment(book, 2, 4, llm=llm, update_journal=False)
    v1 = llm.calls
    before = book.load_page(3)["meta"]["ts"]
    translate_range(book, 3, 3, llm, None, force=True)               # redo one page; pages 2 and 4 are untouched
    assert book.load_page(3)["meta"]["ts"] > before and book.load_page(2)["meta"]["ts"] < book.load_page(3)["meta"]["ts"]
    build_segment(book, 2, 4, llm=llm, update_journal=False)
    assert llm.calls - v1 == 1          # only the redo itself: the Hebrew is identical, so the earlier check still stands
    p = book.load_page(3)               # a real change to page 3 invalidates only its own check
    p["elements"][0]["text"] = p["elements"][0]["text"] + " שונה"
    p["last_sentence_he"] = p["last_sentence_he"]
    book.save_page(3, p)
    v2 = llm.calls
    build_segment(book, 2, 4, llm=llm, update_journal=False)
    assert llm.calls - v2 == 1


def test_segment_not_ready_until_the_independent_verifier_has_run(env):
    book = _book(env)
    llm = MockLLM()
    translate_range(book, 2, 3, llm, None)
    rep = build_segment(book, 2, 3, llm=None, verify=False, update_journal=False)
    assert rep["summary"]["ready"] is False and rep["summary"]["pending"] == [8]


def test_api_roundtrip(env):
    from fastapi.testclient import TestClient
    from godol.server import app
    import time
    c = TestClient(app)
    pdf = env / "t.pdf"; make_pdf(pdf, 6)
    r = c.post("/api/books", files={"file": ("קמינצקי.pdf", pdf.read_bytes(), "application/pdf")}).json()
    bid = r["id"]; assert r["n_pages"] == 6
    assert c.post("/api/books", files={"file": ("x.pdf", b"nope", "application/pdf")}).status_code == 400
    j = c.post(f"/api/books/{bid}/translate", json={"start": 2, "end": 4}).json()
    for _ in range(100):
        j = c.get(f"/api/jobs/{j['id']}").json()
        if j["status"] != "running":
            break
        time.sleep(0.1)
    assert j["status"] == "done", j
    assert j["report"]["checks"][6]["status"] == "pass"
    assert c.get(f"/api/books/{bid}/pages/3").json()["hebrew"]
    assert c.get(f"/api/books/{bid}/pages/3/image").headers["content-type"] == "image/jpeg"
    f = c.get(f"/api/books/{bid}/files").json()
    assert any(x["name"].endswith(".docx") for x in f)
    from urllib.parse import quote
    d = c.get(f"/api/books/{bid}/files/{quote([x['name'] for x in f if x['name'].endswith('.docx')][0])}")
    assert d.status_code == 200 and d.content[:2] == b"PK"
    assert c.get("/api/books/bk1/pages/1").status_code == 404
    assert c.get(f"/api/books/{bid}/files/..%2Fmeta.json").status_code in (400, 404)
    assert c.get("/api/mapping").json()["segments"][9]["start"] == 331
    assert c.get("/").status_code == 200
