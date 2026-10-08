"""Paths and tunables. Everything can be overridden with environment variables."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MATERIALS = Path(os.environ.get("GODOL_MATERIALS", ROOT / "materials"))
WORK = Path(os.environ.get("GODOL_WORK", ROOT / "work"))
OUT_DIR_NAME = "תרגום"

# model and rendering
MODEL = os.environ.get("GODOL_MODEL", "claude-opus-5-5")
VERIFIER_MODEL = os.environ.get("GODOL_VERIFIER_MODEL", MODEL)
EFFORT = os.environ.get("GODOL_EFFORT", "high")
DPI = int(os.environ.get("GODOL_DPI", "200"))
PAGES_PER_CALL = max(1, min(3, int(os.environ.get("GODOL_PAGES_PER_CALL", "1"))))
MAX_OUTPUT_TOKENS = int(os.environ.get("GODOL_MAX_TOKENS", "32000"))
MAX_ATTEMPTS = int(os.environ.get("GODOL_MAX_ATTEMPTS", "3"))
RETRY_BASE_SECONDS = float(os.environ.get("GODOL_RETRY_BASE", "4"))
USE_MOCK = os.environ.get("GODOL_MOCK") == "1"

# page: 17 x 24 cm, in twentieths of a point
PAGE_W_TWIPS = 9639
PAGE_H_TWIPS = 13608
MARGIN_TWIPS = 1134  # 2 cm, replaced by the pilot's margins when the pilot file is present
FONT = "David"
BODY_HALF_POINTS = 24      # 12 pt
FOOTNOTE_HALF_POINTS = 19  # 9.5 pt
REVIEW_AUTHOR = "Claude"


def ensure_dirs() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
