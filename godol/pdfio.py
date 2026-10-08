"""PDF access: page images for the model (the real source) and the text layer (an unreliable hint)."""
from __future__ import annotations

from pathlib import Path

import pymupdf

from . import config


class Pdf:
    def __init__(self, path: Path, cache: Path | None = None):
        self.path = Path(path)
        self.doc = pymupdf.open(str(self.path))
        self.cache = cache
        if cache:
            cache.mkdir(parents=True, exist_ok=True)

    @property
    def n_pages(self) -> int:
        return self.doc.page_count

    def _check(self, n: int) -> None:
        if not 1 <= n <= self.n_pages:
            raise ValueError(f"עמוד {n} מחוץ לטווח (1–{self.n_pages})")

    def image(self, n: int, dpi: int | None = None) -> tuple[bytes, str]:
        """JPEG of page n (1-based) at the configured DPI, cached on disk."""
        self._check(n)
        dpi = dpi or config.DPI
        f = self.cache / f"p{n:04d}_{dpi}.jpg" if self.cache else None
        if f and f.exists():
            return f.read_bytes(), "image/jpeg"
        pix = self.doc[n - 1].get_pixmap(dpi=dpi, alpha=False)
        data = pix.tobytes("jpg", jpg_quality=92)
        if f:
            f.write_bytes(data)
        return data, "image/jpeg"

    def text(self, n: int) -> str:
        self._check(n)
        return self.doc[n - 1].get_text("text")

    def close(self) -> None:
        self.doc.close()
