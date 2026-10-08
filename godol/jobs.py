"""Background jobs for the web app: translate a range, then build and check it. State lives on disk, so a
restart of the server never loses what was already translated (checkpoints are per page)."""
from __future__ import annotations

import json
import threading
import time
import traceback
import uuid

from . import config
from .book import Book
from .llm import make_llm
from .pipeline import PageFailed, Stopped, translate_range
from .service import build_segment, segments

_LOCK = threading.Lock()
JOBS: dict[str, "Job"] = {}


class Job:
    def __init__(self, book: Book, kind: str, start: int, end: int, opts: dict):
        self.id = uuid.uuid4().hex[:10]
        self.book = book
        self.kind = kind
        self.start, self.end = start, end
        self.opts = opts
        self.status = "running"
        self.stop = threading.Event()
        self.pages: dict[int, dict] = {n: {"state": "pending", "message": ""} for n in range(start, end + 1)}
        self.events: list[dict] = []
        self.error = ""
        self.report: dict | None = None
        self.started = time.time()
        self.finished: float | None = None

    def emit(self, ev: dict) -> None:
        ev = {**ev, "ts": time.time()}
        with _LOCK:
            self.events.append(ev)
            self.events = self.events[-300:]
            t = ev["type"]
            pages = ev.get("pages") or ([ev["page"]] if "page" in ev else [])
            for n in pages:
                if n not in self.pages:
                    continue
                if t == "page_start":
                    self.pages[n] = {"state": "running", "message": f"ניסיון {ev.get('attempt', 1)}"}
                elif t == "page_done":
                    self.pages[n] = {"state": "done", "message": ev.get("message", "")}
                elif t == "page_failed":
                    self.pages[n] = {"state": "failed", "message": ev.get("message", "")}
                elif t == "retry":
                    self.pages[n] = {"state": "retry", "message": ev.get("message", "")[:160]}
        self._save()

    def to_dict(self) -> dict:
        return {"id": self.id, "book": self.book.id, "kind": self.kind, "start": self.start, "end": self.end, "status": self.status,
                "pages": {str(k): v for k, v in self.pages.items()}, "events": self.events[-40:], "error": self.error,
                "report": self.report, "started": self.started, "finished": self.finished}

    def _save(self) -> None:
        try:
            (self.book.jobs_dir / f"{self.id}.json").write_text(json.dumps(self.to_dict(), ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass


def start_job(book: Book, kind: str, start: int, end: int, opts: dict | None = None, llm=None) -> Job:
    opts = opts or {}
    if not 1 <= start <= end <= book.meta["n_pages"]:
        raise ValueError("טווח עמודים לא חוקי")
    if any(j.status == "running" and j.book.id == book.id for j in JOBS.values()):
        raise RuntimeError("כבר רצה עבודה על הספר הזה. אפשר לעצור אותה או לחכות לסיומה.")
    job = Job(book, kind, start, end, opts)
    JOBS[job.id] = job
    threading.Thread(target=_run, args=(job, llm), daemon=True).start()
    return job


def _run(job: Job, llm) -> None:
    try:
        llm = llm or make_llm()
    except Exception as e:  # noqa: BLE001  (missing key, SDK problem)
        job.status, job.error, job.finished = "failed", f"לא ניתן להתחיל: {e}", time.time()
        job.emit({"type": "job_failed", "message": job.error})
        return
    segs, _ = segments()
    seg = next((s for s in segs if s.start == job.opts.get("seg_start", job.start) and s.end == job.opts.get("seg_end", job.end)), None)
    try:
        if job.kind in ("translate", "redo"):
            hint = (f"{seg.title} (קטע {seg.n})" if seg else "")
            translate_range(job.book, job.start, job.end, llm, job.emit, job.stop, force=(job.kind == "redo"), chapter_hint=hint)
        if job.kind in ("translate", "redo", "build"):
            s, e = job.opts.get("seg_start", job.start), job.opts.get("seg_end", job.end)
            job.emit({"type": "building", "message": "בונה Word ומריץ בקרה"})
            job.report = build_segment(job.book, s, e, llm=llm, verify=job.opts.get("verify", True), seg=seg,
                                       chapter=job.opts.get("chapter"), on_event=job.emit)
        job.status = "done"
    except Stopped:
        job.status = "stopped"
        job.emit({"type": "stopped", "message": "נעצר. מה שכבר תורגם נשמר."})
    except PageFailed as e:
        job.status, job.error = "failed", f"נכשל בעמ' {', '.join(map(str, e.pages))}: {e}"
        job.emit({"type": "job_failed", "message": job.error})
    except Exception as e:  # noqa: BLE001
        job.status, job.error = "failed", f"{type(e).__name__}: {e}"
        job.emit({"type": "job_failed", "message": job.error, "trace": traceback.format_exc()[-800:]})
    finally:
        job.finished = time.time()
        job._save()
