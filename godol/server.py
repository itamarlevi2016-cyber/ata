"""The web app: upload the PDF once, pick a segment from the book map, press translate, follow progress
page by page, redo a single page, download the Word file and the control report."""
from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, costs, journal, names as names_mod, settings
from .book import Book
from .jobs import JOBS, start_job
from .service import page_hebrew, segments

app = FastAPI(title="מתרגם Making of a Godol")
STATIC = Path(__file__).parent / "static"


def _book(book_id: str) -> Book:
    try:
        return Book.open(book_id)
    except FileNotFoundError:
        raise HTTPException(404, "ספר לא נמצא")


class RangeIn(BaseModel):
    start: int
    end: int
    seg_start: int | None = None
    seg_end: int | None = None
    chapter: int | None = None
    verify: bool = True


class NamesIn(BaseModel):
    names: list[str]


@app.get("/api/status")
def status():
    segs, src = segments()
    has_key = bool(__import__("os").environ.get("ANTHROPIC_API_KEY")) or config.USE_MOCK
    materials = {n: (config.MATERIALS / n).exists() for n in ("מדריך תרגום.md", "מיפוי הספר.md", "יומן התקדמות.md", "פיילוט.docx")}
    materials["שמות חדשים"] = bool(list(config.MATERIALS.glob("שמות חדשים*.md")))
    st = settings.get()
    return {"settings": st, "mock": config.USE_MOCK, "has_credentials": has_key, "model": config.MODEL, "dpi": config.DPI,
            "pages_per_call": config.PAGES_PER_CALL, "materials": materials, "segments_source": src, "segments": len(segs)}


class SettingsIn(BaseModel):
    model: str | None = None
    effort: str | None = None
    verify: bool | None = None
    budget_usd: float | None = None


@app.get("/api/settings")
def get_settings():
    return {**settings.get(), "models": costs.MODELS, "efforts": settings.EFFORTS}


@app.post("/api/settings")
def set_settings(s: SettingsIn):
    return {**settings.save(s.model_dump(exclude_none=True)), "models": costs.MODELS, "efforts": settings.EFFORTS}


@app.get("/api/cost")
def get_cost():
    c = costs.summary()
    b = settings.get()["budget_usd"]
    return {**c, "budget": b, "remaining": round(b - c["spent"], 4) if b else None}


@app.get("/api/books")
def books():
    return Book.list()


@app.post("/api/books")
async def upload(file: UploadFile = File(...)):
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "זה לא קובץ PDF")
    try:
        b = Book.create(file.filename or "book.pdf", data)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"לא ניתן לפתוח את ה-PDF: {e}")
    return {"id": b.id, **b.meta}


@app.get("/api/books/{book_id}")
def book_info(book_id: str):
    b = _book(book_id)
    return {"id": b.id, **b.meta, "done_pages": b.done_pages()}


@app.delete("/api/books/{book_id}")
def book_delete(book_id: str):
    _book(book_id).remove()
    return {"ok": True}


@app.get("/api/mapping")
def mapping():
    segs, src = segments()
    return {"source": src, "segments": [s.to_dict() for s in segs]}


@app.get("/api/books/{book_id}/pages/{n}")
def page(book_id: str, n: int):
    b = _book(book_id)
    p = b.load_page(n)
    if not p:
        raise HTTPException(404, "העמוד עוד לא תורגם")
    return {**p, "hebrew": page_hebrew(p)}


@app.get("/api/books/{book_id}/pages/{n}/image")
def page_image(book_id: str, n: int, dpi: int = 110):
    b = _book(book_id)
    try:
        data, mt = b.pdf.image(n, dpi=min(max(dpi, 60), 220))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return Response(data, media_type=mt)


def _start(book_id: str, kind: str, r: RangeIn):
    b = _book(book_id)
    opts = {k: v for k, v in r.model_dump().items() if k not in ("start", "end") and v is not None}
    try:
        job = start_job(b, kind, r.start, r.end, opts)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(409, str(e))
    return job.to_dict()


@app.post("/api/books/{book_id}/translate")
def translate(book_id: str, r: RangeIn):
    return _start(book_id, "translate", r)


@app.post("/api/books/{book_id}/redo")
def redo(book_id: str, r: RangeIn):
    """Translate again one page (or a short range) and rebuild the segment it belongs to."""
    return _start(book_id, "redo", r)


@app.post("/api/books/{book_id}/build")
def build(book_id: str, r: RangeIn):
    return _start(book_id, "build", r)


@app.get("/api/jobs/{job_id}")
def job(job_id: str):
    j = JOBS.get(job_id)
    if not j:
        raise HTTPException(404, "עבודה לא נמצאה")
    return j.to_dict()


@app.get("/api/books/{book_id}/jobs/latest")
def latest(book_id: str):
    js = [j for j in JOBS.values() if j.book.id == book_id]
    return js[-1].to_dict() if js else JSONResponse(None)


@app.post("/api/jobs/{job_id}/stop")
def stop(job_id: str):
    j = JOBS.get(job_id)
    if not j:
        raise HTTPException(404, "עבודה לא נמצאה")
    j.stop.set()
    return {"ok": True}


@app.get("/api/books/{book_id}/files")
def files(book_id: str):
    b = _book(book_id)
    out = []
    for p in sorted(b.out_dir.glob("*")):
        out.append({"name": p.name, "size": p.stat().st_size, "kind": "docx" if p.suffix == ".docx" else "report" if p.suffix == ".md" else "json"})
    return out


@app.get("/api/books/{book_id}/files/{name}")
def download(book_id: str, name: str):
    b = _book(book_id)
    if "/" in name or ".." in name:
        raise HTTPException(400, "שם קובץ לא חוקי")
    p = b.out_dir / name
    if not p.exists():
        raise HTTPException(404, "הקובץ לא נמצא")
    return FileResponse(p, filename=name)


@app.get("/api/books/{book_id}/report/{start}/{end}")
def report(book_id: str, start: int, end: int):
    b = _book(book_id)
    cands = sorted(b.out_dir.glob(f"דוח בקרה – * – עמ' {start}–{end}.json"))
    if not cands:
        raise HTTPException(404, "אין דוח לטווח הזה. בנו את הקטע קודם.")
    return json.loads(cands[0].read_text(encoding="utf-8"))


@app.get("/api/books/{book_id}/names")
def names_list(book_id: str):
    return names_mod.read_pending(_book(book_id).dir)


@app.post("/api/books/{book_id}/names/approve")
def names_approve(book_id: str, n: NamesIn):
    return {"approved": names_mod.approve_pending(_book(book_id).dir, n.names)}


@app.post("/api/books/{book_id}/names/reject")
def names_reject(book_id: str, n: NamesIn):
    return {"rejected": names_mod.reject_pending(_book(book_id).dir, n.names)}


@app.get("/api/journal")
def get_journal():
    p = journal.log_path()
    return {"text": p.read_text(encoding="utf-8") if p.exists() else ""}


app.mount("/", StaticFiles(directory=str(STATIC), html=True), name="static")
