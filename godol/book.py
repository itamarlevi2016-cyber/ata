"""A book workspace on disk: the PDF, rendered images, one JSON checkpoint per page, outputs and jobs."""
from __future__ import annotations

import json
import re
import shutil
import time
from pathlib import Path

from . import config
from .pdfio import Pdf


def new_id() -> str:
    return "bk" + time.strftime("%y%m%d%H%M%S")


class Book:
    def __init__(self, book_id: str):
        self.id = book_id
        self.dir = config.WORK / book_id
        self.pages_dir = self.dir / "pages"
        self.out_dir = self.dir / config.OUT_DIR_NAME
        self.jobs_dir = self.dir / "jobs"
        self._pdf: Pdf | None = None

    # creation ----------------------------------------------------------------
    @classmethod
    def create(cls, name: str, pdf_bytes: bytes) -> "Book":
        config.ensure_dirs()
        b = cls(new_id())
        for d in (b.dir, b.pages_dir, b.out_dir, b.jobs_dir):
            d.mkdir(parents=True, exist_ok=True)
        (b.dir / "book.pdf").write_bytes(pdf_bytes)
        pdf = b.pdf
        (b.dir / "meta.json").write_text(json.dumps({"name": name, "n_pages": pdf.n_pages, "created": time.time()},
                                                    ensure_ascii=False), encoding="utf-8")
        return b

    @classmethod
    def open(cls, book_id: str) -> "Book":
        if not re.fullmatch(r"bk\d+", book_id) or not (config.WORK / book_id / "meta.json").exists():
            raise FileNotFoundError("ספר לא נמצא")
        return cls(book_id)

    @staticmethod
    def list() -> list[dict]:
        out = []
        if config.WORK.exists():
            for p in sorted(config.WORK.glob("bk*/meta.json")):
                m = json.loads(p.read_text(encoding="utf-8"))
                out.append({"id": p.parent.name, **m})
        return out

    # accessors ---------------------------------------------------------------
    @property
    def meta(self) -> dict:
        return json.loads((self.dir / "meta.json").read_text(encoding="utf-8"))

    @property
    def pdf(self) -> Pdf:
        if self._pdf is None:
            self._pdf = Pdf(self.dir / "book.pdf", self.dir / "img")
        return self._pdf

    def page_path(self, n: int) -> Path:
        return self.pages_dir / f"p{n:04d}.json"

    def load_page(self, n: int) -> dict | None:
        p = self.page_path(n)
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

    def save_page(self, n: int, data: dict) -> None:
        self.pages_dir.mkdir(parents=True, exist_ok=True)
        tmp = self.page_path(n).with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(self.page_path(n))  # atomic: a crash never leaves half a checkpoint

    def done_pages(self) -> list[int]:
        return sorted(int(p.stem[1:]) for p in self.pages_dir.glob("p*.json"))

    def delete_page(self, n: int) -> None:
        self.page_path(n).unlink(missing_ok=True)

    def remove(self) -> None:
        if self._pdf:
            self._pdf.close()
        shutil.rmtree(self.dir, ignore_errors=True)
