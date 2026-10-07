"""ניהול עבודות תמלול: שמירה על הדיסק ותור שמעבד עבודה אחת בכל פעם."""

import json
import logging
import queue
import shutil
import threading
import time
import traceback
import uuid
from pathlib import Path

from . import config, diarizer, downloader, transcriber

log = logging.getLogger(__name__)

ACTIVE_STATES = {"queued", "downloading", "loading", "transcribing", "diarizing"}

_lock = threading.RLock()
_jobs: dict[str, dict] = {}
_queue: "queue.Queue[str]" = queue.Queue()


def job_dir(job_id: str) -> Path:
    return config.JOBS_DIR / job_id


def _save(job: dict) -> None:
    path = job_dir(job["id"]) / "job.json"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(job, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def _update(job_id: str, **fields) -> None:
    with _lock:
        job = _jobs[job_id]
        job.update(fields)
        _save(job)


def create_job(title: str, source: dict, options: dict) -> dict:
    job_id = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]
    job_dir(job_id).mkdir(parents=True, exist_ok=True)
    job = {
        "id": job_id,
        "title": title,
        "source": source,
        "options": options,
        "status": "new",
        "progress": 0.0,
        "error": None,
        "audio_file": None,
        "created": time.time(),
    }
    with _lock:
        _jobs[job_id] = job
        _save(job)
    return job


def enqueue(job_id: str) -> None:
    _update(job_id, status="queued")
    _queue.put(job_id)


def get_job(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def list_jobs() -> list[dict]:
    with _lock:
        return sorted((dict(j) for j in _jobs.values()), key=lambda j: j["created"], reverse=True)


def delete_job(job_id: str) -> bool:
    with _lock:
        job = _jobs.get(job_id)
        if not job or job["status"] in ACTIVE_STATES - {"queued"}:
            return False
        del _jobs[job_id]
    shutil.rmtree(job_dir(job_id), ignore_errors=True)
    return True


def load_result(job_id: str) -> dict | None:
    path = job_dir(job_id) / "result.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def save_result(job_id: str, result: dict) -> None:
    path = job_dir(job_id) / "result.json"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def _process(job_id: str) -> None:
    job = get_job(job_id)
    if job is None:  # נמחקה בזמן שהמתינה בתור
        return
    d = job_dir(job_id)

    if job["source"]["type"] == "url" and not job["audio_file"]:
        _update(job_id, status="downloading", progress=0.0)
        path, title = downloader.download_audio(job["source"]["url"], d)
        _update(job_id, audio_file=path.name, title=title)
        job = get_job(job_id)

    _update(job_id, status="loading", progress=0.0)
    audio = transcriber.load_audio(str(d / job["audio_file"]))
    transcriber.get_model()

    _update(job_id, status="transcribing")
    last = [0.0]

    def on_progress(p: float) -> None:
        if p - last[0] >= 0.01:
            last[0] = p
            _update(job_id, progress=round(p, 3))

    result = transcriber.transcribe(audio, on_progress)

    if job["options"].get("diarize"):
        _update(job_id, status="diarizing", progress=1.0)
        turns = diarizer.diarize(audio, transcriber.SAMPLE_RATE, job["options"].get("num_speakers"))
        result["segments"] = diarizer.assign_speakers(result["segments"], turns)
    result["speakers"] = diarizer.speaker_names(result["segments"])

    save_result(job_id, result)
    _update(job_id, status="done", progress=1.0, duration=result["duration"])


def _worker() -> None:
    while True:
        job_id = _queue.get()
        try:
            _process(job_id)
        except Exception as e:  # noqa: BLE001
            log.error("העבודה %s נכשלה:\n%s", job_id, traceback.format_exc())
            if get_job(job_id):
                _update(job_id, status="error", error=str(e) or e.__class__.__name__)
        finally:
            _queue.task_done()


def start() -> None:
    """טוען עבודות קיימות מהדיסק, מחזיר לתור עבודות שנקטעו ומפעיל את התהליך."""
    config.JOBS_DIR.mkdir(parents=True, exist_ok=True)
    pending = []
    for f in config.JOBS_DIR.glob("*/job.json"):
        try:
            job = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        _jobs[job["id"]] = job
        if job["status"] in ACTIVE_STATES:
            pending.append(job)
    for job in sorted(pending, key=lambda j: j["created"]):
        enqueue(job["id"])
    threading.Thread(target=_worker, name="transcription-worker", daemon=True).start()
