"""Prompts. The translation guide is loaded verbatim from materials/ and is never paraphrased here."""
from __future__ import annotations

from pathlib import Path

TRANSLATOR_RULES = """You translate one printed page at a time of an English book into Hebrew, following the translation guide below, which is binding.

THE SOURCE IS THE PAGE IMAGE. Read every word from the image. Each page also comes with a machine text layer. That layer is NOT reliable: it contains scan damage, wrong characters, garbled Hebrew, running heads and page numbers. Use it only as a hint for what to look at. Never copy anything from it that you did not read in the image.

Return JSON in the required structure. For every page return the elements in reading order, using exactly these types:
- heading_chapter: a chapter heading. Text is the Hebrew heading; use a line break between the line "פרק ..." and the chapter name.
- heading_section: a numbered section heading such as "1.".
- body_paragraph: running text. Set region to "text" for the main running text of the book and the front matter ("front" for title page, contents, foreword and similar), and "frame" for the story text inside the decorated frames of the Notes and Excursuses part.
- footnote_source: a source footnote (a small lettered mark a, b, c, or an asterisk, with a short note at the bottom of the same page). Give it a unique id such as "f{page}-a", put the printed mark in marker, and put the Hebrew note text in text. In the paragraph, place the token ⟦fn:ID⟧ at the exact spot of the mark. Every footnote_source must be referenced by exactly one ⟦fn:ID⟧ token on the same page, and every token must have a footnote_source.
- numbered_note: a numbered note of the Notes part. number is its number, text is the Hebrew text. In the frame text, mark the reference to it with ⟦nn:NUMBER⟧ at the exact spot of the number.
- excursus_heading and excursus_body: an excursus (an appendix essay attached to a note). letter is the printed Latin letter (A, B, ...); ref is the number of the note it belongs to; text of the heading is the Hebrew title. Inside the numbered_note that points to an excursus write the pointer text from the guide and put ⟦ex:LETTER⟧ where the link goes.
- review_flag: a doubt for the reviewer, using the cases listed in the guide. reason says what is doubtful and where to check; words are the exact Hebrew words in the target element the comment attaches to; target is that element's id; page is the page number.

Rules for the structure:
- A paragraph that is cut at the bottom of the page and continues on the next sets continues_next=true. A paragraph at the top of the page that continues the previous page sets continues_prev=true. The program joins them. Never repeat the text of one on the other page.
- Do not output running heads, page numbers, scan residue or the page's own printed header. List what you dropped in dropped_artifacts.
- Text you write must contain no Latin letters except the exceptions the guide allows.
- Bold text goes in **double asterisks**. Do not use any other markup.
- Count from the image, before you write the elements: counts.source_footnotes (lettered notes at the foot), counts.asterisk_footnotes, counts.numbered_notes, counts.excursus_headings that start on this page. The program compares your counts with your elements.
- first_sentence_src / last_sentence_src: the first and the last sentence on the page, copied from the image (English). first_sentence_he / last_sentence_he: their Hebrew translation exactly as it appears in your elements.
- new_names: every person, place, book or institution name that is not in the guide's name tables or the name list below, with the Hebrew form you used. Never change a name that is in the dictionary.
- When in doubt, translate as written and add a review_flag with the reason and the page. Do not guess.
- Fill every field of every element; use "" , 0 or false where a field does not apply, and use the page number in "page".
"""


def translator_system(guide_text: str) -> list[dict]:
    """System prompt as blocks. The guide block carries the cache breakpoint, so every page call after the
    first one reads the whole prefix from the cache."""
    return [
        {"type": "text", "text": TRANSLATOR_RULES},
        {"type": "text", "text": "TRANSLATION GUIDE (binding):\n\n" + guide_text,
         "cache_control": {"type": "ephemeral"}},
    ]


VERIFIER_SYSTEM = """You check a Hebrew translation of one printed page against the page image.
You are given the image of the page and a Hebrew text. You do not know how the Hebrew was produced and you must not assume anything about it.
Read the page image carefully. Compare the content, sentence by sentence, including footnotes and notes at the foot of the page.
Report every place where content in the image is missing from the Hebrew (kind "omitted"), content in the Hebrew is not on the page (kind "added"), or the meaning, a number, a date, a name or a quotation differs (kind "changed").
severity "major" means a reader would be misled or something substantive is missing. "minor" means wording or style only.
Ignore running heads and page numbers. Do not report differences of style, word order or register. If you find nothing, return an empty list.
Quote the source and the Hebrew briefly in source_quote and hebrew_quote. Write explanation in Hebrew, one sentence."""


def user_blocks(pages: list[dict], carry: dict | None, known_names: list[tuple[str, str]],
                pending_names: list[tuple[str, str]], chapter_hint: str = "") -> list[dict]:
    """pages: [{n, image_b64, media_type, text_layer}]"""
    from base64 import standard_b64encode

    blocks: list[dict] = []
    nums = ", ".join(str(p["n"]) for p in pages)
    intro = f"Translate PDF page(s): {nums}. The page number printed on a page equals its PDF page number."
    if chapter_hint:
        intro += f"\nContext from the book map: {chapter_hint}"
    blocks.append({"type": "text", "text": intro})
    for p in pages:
        blocks.append({"type": "text", "text": f"--- PAGE {p['n']} IMAGE (the source) ---"})
        blocks.append({"type": "image", "source": {"type": "base64", "media_type": p["media_type"],
                                                   "data": standard_b64encode(p["image"]).decode("ascii")}})
        blocks.append({"type": "text", "text": f"--- PAGE {p['n']} TEXT LAYER (UNRELIABLE, may contain scan errors; a hint only) ---\n"
                                               + (p["text_layer"].strip() or "(empty)")})
    if carry and carry.get("he"):
        blocks.append({"type": "text", "text":
                       "--- LAST PARAGRAPH ALREADY TRANSLATED (from the previous page; for continuity only, do not translate it again) ---\n"
                       + carry["he"] + ("\n[this paragraph was cut at the end of the previous page: if the top of the first page continues it, set continues_prev=true]"
                                        if carry.get("open") else "")})
    if known_names:
        blocks.append({"type": "text", "text": "--- NAMES FROM THE DICTIONARY LIKELY ON THESE PAGES (binding) ---\n"
                       + "\n".join(f"{en} = {he}" for en, he in known_names)})
    if pending_names:
        blocks.append({"type": "text", "text": "--- NAMES ALREADY PROPOSED EARLIER IN THIS BOOK, NOT YET APPROVED (use the same form for consistency) ---\n"
                       + "\n".join(f"{en} = {he}" for en, he in pending_names)})
    blocks.append({"type": "text", "text": "Return the JSON now."})
    return blocks


def verifier_blocks(page: int, image: bytes, media_type: str, hebrew: str) -> list[dict]:
    from base64 import standard_b64encode
    return [
        {"type": "text", "text": f"Page {page}. Image:"},
        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": standard_b64encode(image).decode("ascii")}},
        {"type": "text", "text": "Hebrew text to check:\n\n" + hebrew},
    ]


def load_guide(materials: Path) -> str:
    p = materials / "מדריך תרגום.md"
    if not p.exists():
        raise FileNotFoundError(f"חסר קובץ המדריך: {p}")
    return p.read_text(encoding="utf-8")
