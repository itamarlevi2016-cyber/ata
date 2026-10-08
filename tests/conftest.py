import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture()
def env(tmp_path, monkeypatch):
    """Isolated work dir; materials are copied so tests can add or remove files freely."""
    import shutil
    from godol import config
    mat = tmp_path / "materials"
    shutil.copytree(ROOT / "materials", mat)
    monkeypatch.setattr(config, "MATERIALS", mat)
    monkeypatch.setattr(config, "WORK", tmp_path / "work")
    monkeypatch.setattr(config, "USE_MOCK", True)
    monkeypatch.setattr(config, "RETRY_BASE_SECONDS", 0)
    return tmp_path


def make_pdf(path: Path, pages: int = 12):
    import pymupdf
    d = pymupdf.open()
    for i in range(1, pages + 1):
        p = d.new_page(width=482, height=680)  # 17 x 24 cm
        lines = (["CHAPTER THREE"] if i == 1 else []) + [f"Paragraph one of page {i} runs on,", f"Paragraph two of page {i} ends here."]
        p.insert_text((50, 80), "\n".join(lines), fontsize=11)
    d.save(str(path))
    d.close()
