"""שרת האתר המקומי."""

import logging
import mimetypes
import os
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import cloud, config, diarizer, exporters, jobs, transcriber

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

STATIC_DIR = Path(__file__).parent / "static"
mimetypes.add_type("application/manifest+json", ".webmanifest")



@asynccontextmanager
async def lifespan(_app: FastAPI):
    jobs.start()
    yield


app = FastAPI(title="תמלול עברית", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/status")
def status():
    try:
        device, compute_type = transcriber.resolve_device()
    except Exception:  # noqa: BLE001
        device, compute_type = "unknown", "unknown"
    return {
        "model": config.WHISPER_MODEL,
        "device": device,
        "compute_type": compute_type,
        "diarization_installed": diarizer.is_available(),
        "hf_token": bool(config.HF_TOKEN),
        "cpu_count": os.cpu_count(),
        "cloud_configured": cloud.is_configured(),
        "low_confidence": config.LOW_CONFIDENCE,
    }


@app.post("/api/jobs")
def create_job(
    file: UploadFile | None = File(None),
    url: str = Form(""),
    diarize: bool = Form(False),
    num_speakers: int = Form(0),
    quality: str = Form("accurate"),
    engine: str = Form("local"),
):
    url = url.strip()
    if not file and not url:
        raise HTTPException(400, "יש להעלות קובץ או להזין קישור")
    if diarize and not diarizer.is_available():
        raise HTTPException(400, "זיהוי דוברים לא מותקן. הריצו את install-diarization.")

    if quality not in ("accurate", "fast"):
        raise HTTPException(400, "מצב איכות לא תקין")
    if engine not in ("local", "cloud"):
        raise HTTPException(400, "מנוע תמלול לא תקין")
    if engine == "cloud" and not cloud.is_configured():
        raise HTTPException(400, "תמלול בענן לא הוגדר. הוסיפו RUNPOD_API_KEY ו-RUNPOD_ENDPOINT_ID לקובץ .env")
    options = {"diarize": diarize, "num_speakers": num_speakers or None, "quality": quality, "engine": engine}
    if file:
        title = Path(file.filename or "קובץ").stem
        job = jobs.create_job(title, {"type": "file", "filename": file.filename}, options)
        suffix = Path(file.filename or "").suffix.lower()[:10]
        dest = jobs.job_dir(job["id"]) / f"source{suffix}"
        with dest.open("wb") as out:
            shutil.copyfileobj(file.file, out, length=1024 * 1024)
        if dest.stat().st_size > config.MAX_UPLOAD_MB * 1024 * 1024:
            jobs.delete_job(job["id"])
            raise HTTPException(413, "הקובץ גדול מדי")
        jobs._update(job["id"], audio_file=dest.name)
    else:
        if not url.startswith(("http://", "https://")):
            raise HTTPException(400, "קישור לא תקין")
        job = jobs.create_job(url, {"type": "url", "url": url}, options)

    jobs.enqueue(job["id"])
    return jobs.get_job(job["id"])


@app.get("/api/jobs")
def list_jobs():
    return jobs.list_jobs()


def _job_or_404(job_id: str) -> dict:
    job = jobs.get_job(job_id)
    if not job:
        raise HTTPException(404, "העבודה לא נמצאה")
    return job


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    return _job_or_404(job_id)


@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: str):
    _job_or_404(job_id)
    return {"ok": True, "state": jobs.delete_job(job_id)}


@app.post("/api/jobs/{job_id}/pause")
def pause_job(job_id: str):
    _job_or_404(job_id)
    if not jobs.pause_job(job_id):
        raise HTTPException(409, "אפשר להשהות רק תמלול במחשב שרץ כרגע")
    return jobs.get_job(job_id)


@app.post("/api/jobs/{job_id}/resume")
def resume_job(job_id: str):
    _job_or_404(job_id)
    if not jobs.resume_job(job_id):
        raise HTTPException(409, "העבודה אינה מושהית")
    return jobs.get_job(job_id)


@app.get("/api/jobs/{job_id}/live")
def live(job_id: str, since: int = 0):
    """קטעי הביניים שכבר תומללו (החל מקטע מספר since)."""
    _job_or_404(job_id)
    return jobs.live_segments(job_id, max(0, since))


def _result_or_404(job_id: str) -> dict:
    result = jobs.load_result(job_id)
    if result is None:
        raise HTTPException(404, "התמלול עדיין לא מוכן")
    return result


@app.get("/api/jobs/{job_id}/result")
def get_result(job_id: str):
    _job_or_404(job_id)
    return _result_or_404(job_id)


class SegmentEdit(BaseModel):
    i: int
    text: str | None = None
    speaker: str | None = None


class ResultEdits(BaseModel):
    edits: list[SegmentEdit] = []
    speakers: dict[str, str] | None = None


@app.put("/api/jobs/{job_id}/result")
def edit_result(job_id: str, body: ResultEdits):
    _job_or_404(job_id)
    result = _result_or_404(job_id)
    segments = result["segments"]
    for e in body.edits:
        if not 0 <= e.i < len(segments):
            raise HTTPException(400, f"קטע {e.i} לא קיים")
        seg = segments[e.i]
        if e.text is not None and e.text.strip() != seg["text"]:
            seg["text"] = e.text.strip()
            seg["edited"] = True
        if e.speaker is not None:
            seg["speaker"] = e.speaker
    if body.speakers is not None:
        result["speakers"] = body.speakers
    jobs.save_result(job_id, result)
    return result


@app.get("/api/jobs/{job_id}/audio")
def get_audio(job_id: str):
    job = _job_or_404(job_id)
    if not job.get("audio_file"):
        raise HTTPException(404, "אין קובץ שמע")
    return FileResponse(jobs.job_dir(job_id) / job["audio_file"])


@app.get("/api/jobs/{job_id}/export/{fmt}")
def export(job_id: str, fmt: str, timestamps: bool = True):
    job = _job_or_404(job_id)
    result = _result_or_404(job_id)
    name = quote(f"{job['title'][:80]}.{fmt}")
    headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{name}"}
    if fmt == "txt":
        return PlainTextResponse(exporters.to_txt(result, timestamps), headers=headers)
    if fmt == "srt":
        return PlainTextResponse(exporters.to_srt(result), headers=headers)
    if fmt == "docx":
        return Response(
            exporters.to_docx(result, job["title"]),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers=headers,
        )
    raise HTTPException(400, "פורמט לא נתמך")
