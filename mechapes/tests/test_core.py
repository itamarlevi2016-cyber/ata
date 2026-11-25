"""Core tests: extraction, indexing and search. Run: python -m pytest tests"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mechapes import extract as ex  # noqa: E402
from mechapes import search as se  # noqa: E402
from mechapes.index import Indexer, connect  # noqa: E402
from mechapes.textutil import fix_reversed_hebrew, tokenize  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))


@pytest.fixture(scope="module")
def samples():
    d = tempfile.mkdtemp()
    sys.path.insert(0, HERE)
    import make_samples
    make_samples.main(d)
    return d


@pytest.fixture(scope="module")
def db(samples):
    path = os.path.join(tempfile.mkdtemp(), "index.db")
    con = connect(path)
    Indexer.add_folder(con, samples)
    res = Indexer(path, workers=2).run()
    assert res["errors"] == 0, res
    return con


def test_tokenize_niqqud_and_quotes():
    terms, _, _ = tokenize('וּבַיּוֹם הַשְּׁבִיעִי הרמב"ם ז\'')
    assert terms == ["וביום", "השביעי", "הרמבם", "ז"]


def test_reversed_pdf_text():
    assert fix_reversed_hebrew("םולש םלוע ןאכ ץרא ףוס ךלמ") == "מלך סוף ארץ כאן עולם שלום"


@pytest.mark.parametrize("name", ["sample.docx", "sample.doc", "sample.rtf",
                                  "sample.odt", "sample.pdf", "sample_utf8.txt"])
def test_extract_contains_text(samples, name):
    path = os.path.join(samples, name)
    if not os.path.exists(path):
        pytest.skip("converter not available")
    text = ex.extract(path)
    terms = tokenize(text)[0]
    assert "משה" in terms and "ממצרים" in terms, text[:300]


def test_extract_others(samples):
    assert "המקדש" in ex.extract(os.path.join(samples, "sample.xlsx"))
    assert "ירושלים" in ex.extract(os.path.join(samples, "sample.pptx"))
    assert "בראשית" in ex.extract(os.path.join(samples, "sample_1255.txt"))
    assert '"ציטוט"' in ex.extract(os.path.join(samples, "sample.html"))


def names(results):
    return sorted(os.path.basename(r.path) for r in results)


def test_all_words(db):
    res, _, missing = se.run_search(db, "משה ממצרים")
    assert not missing
    assert "sample.docx" in names(res) and "sample.pdf" in names(res)


def test_prefix_stripping(db):
    # "יום" should find "היום" and "וביום"
    res, q, _ = se.run_search(db, "יום", strip_prefixes=True)
    assert "sample.docx" in names(res)
    assert {"היום", "וביום"} <= set(q.slots[0].terms)
    res, _, _ = se.run_search(db, "יום", strip_prefixes=False)
    assert "sample.docx" not in names(res)


def test_near(db):
    # "משה ... העם" with 1 word between (אל)
    res, _, _ = se.run_search(db, "משה העם", mode=se.MODE_NEAR, gap=1)
    assert "sample.docx" in names(res)
    res, _, _ = se.run_search(db, "משה העם", mode=se.MODE_NEAR, gap=0)
    assert res == []
    # reversed order: only when unordered
    res, _, _ = se.run_search(db, "העם משה", mode=se.MODE_NEAR, gap=1)
    assert res == []
    res, _, _ = se.run_search(db, "העם משה", mode=se.MODE_NEAR, gap=1, ordered=False)
    assert "sample.docx" in names(res)


def test_phrase_and_niqqud_query(db):
    res, _, _ = se.run_search(db, "בַּיּוֹם הַשְּׁבִיעִי", mode=se.MODE_PHRASE)
    assert "sample.docx" in names(res)


def test_wildcard_alternatives_exclude(db):
    res, _, _ = se.run_search(db, "ירושל*")
    assert names(res) == ["sample.pptx"]
    res, _, _ = se.run_search(db, "ירושלים|המקדש")
    assert names(res) == ["sample.pptx", "sample.xlsx"]
    res, _, _ = se.run_search(db, "משה -fox")
    assert res == []


def test_filters(db):
    res, _, _ = se.run_search(db, "משה", exts={".pdf"})
    assert names(res) == ["sample.pdf"]
    res, _, _ = se.run_search(db, "משה", folder_ids={9999})
    assert res == []


def test_snippets(db):
    from mechapes.index import load_file_text
    res, _, _ = se.run_search(db, "משה העם", mode=se.MODE_NEAR, gap=2)
    r = [r for r in res if r.path.endswith(".docx")][0]
    text, starts, ends = load_file_text(db, r.file_id)
    snips = se.make_snippets(text, starts, ends, r.matches)
    s, hls = snips[0]
    assert [s[a:b] for a, b in hls] == ["משה", "העם"]


def test_update_detects_changes(samples, db):
    path = os.path.join(samples, "sample_utf8.txt")
    with open(path, "a", encoding="utf-8") as f:
        f.write(" מילהחדשהלגמרי")
    os.utime(path, (1, 2_000_000_000))
    dbfile = db.execute("PRAGMA database_list").fetchone()[2]
    Indexer(dbfile, workers=1).run()
    res, _, _ = se.run_search(db, "מילהחדשהלגמרי")
    assert names(res) == ["sample_utf8.txt"]
    os.remove(path)
    Indexer(dbfile, workers=1).run()
    res, _, missing = se.run_search(db, "מילהחדשהלגמרי")
    assert res == []
