"""The structured output the translating model must return, and the checks on it."""
from __future__ import annotations

import re

ELEMENT_TYPES = [
    "heading_chapter", "heading_section", "body_paragraph", "footnote_source", "numbered_note",
    "excursus_heading", "excursus_body", "review_flag",
]
REGIONS = ["front", "text", "frame", "notes", "excursus"]

_ELEMENT = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "type": {"type": "string", "enum": ELEMENT_TYPES},
        "id": {"type": "string"},
        "text": {"type": "string"},
        "region": {"type": "string", "enum": REGIONS},
        "marker": {"type": "string"},
        "number": {"type": "integer"},
        "letter": {"type": "string"},
        "ref": {"type": "string"},
        "continues_prev": {"type": "boolean"},
        "continues_next": {"type": "boolean"},
        "reason": {"type": "string"},
        "words": {"type": "string"},
        "target": {"type": "string"},
        "page": {"type": "integer"},
    },
    "required": ["type", "id", "text", "region", "marker", "number", "letter", "ref",
                 "continues_prev", "continues_next", "reason", "words", "target", "page"],
}

_PAGE = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "page": {"type": "integer"},
        "elements": {"type": "array", "items": _ELEMENT},
        "counts": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "source_footnotes": {"type": "integer"},
                "asterisk_footnotes": {"type": "integer"},
                "numbered_notes": {"type": "integer"},
                "excursus_headings": {"type": "integer"},
            },
            "required": ["source_footnotes", "asterisk_footnotes", "numbered_notes", "excursus_headings"],
        },
        "first_sentence_src": {"type": "string"},
        "last_sentence_src": {"type": "string"},
        "first_sentence_he": {"type": "string"},
        "last_sentence_he": {"type": "string"},
        "dropped_artifacts": {"type": "array", "items": {"type": "string"}},
        "new_names": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {"en": {"type": "string"}, "he": {"type": "string"}, "note": {"type": "string"}},
                "required": ["en", "he", "note"],
            },
        },
    },
    "required": ["page", "elements", "counts", "first_sentence_src", "last_sentence_src",
                 "first_sentence_he", "last_sentence_he", "dropped_artifacts", "new_names"],
}

TRANSLATION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {"pages": {"type": "array", "items": _PAGE}},
    "required": ["pages"],
}

VERIFY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "page": {"type": "integer"},
        "differences": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "kind": {"type": "string", "enum": ["omitted", "added", "changed"]},
                    "severity": {"type": "string", "enum": ["major", "minor"]},
                    "source_quote": {"type": "string"},
                    "hebrew_quote": {"type": "string"},
                    "explanation": {"type": "string"},
                },
                "required": ["kind", "severity", "source_quote", "hebrew_quote", "explanation"],
            },
        },
    },
    "required": ["page", "differences"],
}

TOKEN = re.compile(r"⟦(fn|nn|ex):([^⟧]+)⟧")


def tokens(text: str) -> list[tuple[str, str]]:
    return TOKEN.findall(text or "")


def validate_page(p: dict, expected_page: int) -> list[str]:
    """Semantic problems that the JSON schema cannot express. An empty list means usable."""
    errs: list[str] = []
    if p.get("page") != expected_page:
        errs.append(f"page field is {p.get('page')!r}, expected {expected_page}")
    els = p.get("elements") or []
    ids: dict[str, str] = {}
    for e in els:
        if e["type"] != "review_flag" and e["id"]:
            if e["id"] in ids:
                errs.append(f"duplicate id {e['id']}")
            ids[e["id"]] = e["type"]
    fn_ids = {e["id"] for e in els if e["type"] == "footnote_source"}
    used: list[str] = []
    for e in els:
        if e["type"] in ("body_paragraph", "numbered_note", "excursus_body", "excursus_heading", "heading_section"):
            used += [v for k, v in tokens(e["text"]) if k == "fn"]
    for i in fn_ids:
        if used.count(i) != 1:
            errs.append(f"footnote {i} is referenced {used.count(i)} times in the text (must be exactly once)")
    for i in set(used) - fn_ids:
        errs.append(f"text refers to footnote {i} that has no footnote_source element")
    for e in els:
        if e["type"] == "numbered_note" and e["number"] <= 0:
            errs.append(f"numbered_note {e['id']} has no number")
        if e["type"] in ("excursus_heading",) and not e["letter"]:
            errs.append(f"excursus_heading {e['id']} has no letter")
        if e["type"] == "review_flag" and not e["reason"].strip():
            errs.append("review_flag without a reason")
        if e["type"] in ("body_paragraph", "footnote_source", "numbered_note", "excursus_body") and not e["text"].strip():
            errs.append(f"empty text in {e['type']} {e['id']}")
    return errs
