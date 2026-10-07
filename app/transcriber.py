"""תמלול מקומי בעזרת faster-whisper ומודל עברי של ivrit.ai."""

import logging
import os
import threading
from typing import Callable

import numpy as np

from . import config

log = logging.getLogger(__name__)

SAMPLE_RATE = 16000

_model = None
_model_lock = threading.Lock()

# השהיה/המשך: כשהאירוע "מכובה" לולאת התמלול נעצרת בין קטע לקטע ואינה צורכת מעבד.
# המערכת מתמללת עבודה אחת בכל פעם, ולכן מספיק מצב גלובלי אחד.
_running = threading.Event()
_running.set()

# ביטול: נבדק בין קטע לקטע (גם בזמן השהיה)
_cancel = threading.Event()


class Cancelled(Exception):
    """התמלול בוטל על ידי המשתמש."""


# טקסט ביניים: הקטעים שכבר תומללו בעבודה הנוכחית, לתצוגה חיה
_live_lock = threading.Lock()
_live_segments: list[dict] = []


def pause() -> None:
    """משהה את התמלול הנוכחי (ייעצר בסוף הקטע שמעובד כרגע)."""
    _running.clear()
    log.info("התמלול הושהה")


def resume() -> None:
    _running.set()
    log.info("התמלול ממשיך")


def cancel() -> None:
    """מבטל את התמלול הנוכחי (משחרר גם השהיה)."""
    _cancel.set()
    _running.set()


def is_paused() -> bool:
    return not _running.is_set()


def live_segments(since: int = 0) -> list[dict]:
    """מחזיר את קטעי הביניים שתומללו עד עכשיו בעבודה הנוכחית (החל מאינדקס since)."""
    with _live_lock:
        return [dict(seg) for seg in _live_segments[since:]]


def live_text() -> str:
    with _live_lock:
        return " ".join(seg["text"] for seg in _live_segments)


def resolve_device() -> tuple[str, str]:
    import ctranslate2

    device = config.DEVICE
    if device == "auto":
        device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    compute_type = config.COMPUTE_TYPE
    if compute_type == "auto":
        compute_type = "float16" if device == "cuda" else "int8"
    return device, compute_type


def get_model():
    global _model
    with _model_lock:
        if _model is None:
            from faster_whisper import WhisperModel

            device, compute_type = resolve_device()
            log.info("טוען מודל %s על %s (%s)", config.WHISPER_MODEL, device, compute_type)
            _model = WhisperModel(
                config.WHISPER_MODEL,
                device=device,
                compute_type=compute_type,
                # על מעבד רגיל — חצי מהליבות, כדי שהמחשב יישאר זמין בזמן התמלול
                cpu_threads=max(1, (os.cpu_count() or 2) // 2) if device == "cpu" else 0,
                download_root=str(config.MODELS_DIR),
            )
        return _model


def load_audio(path: str) -> np.ndarray:
    """מפענח כל קובץ שמע/וידאו לגל מונו 16kHz (בעזרת PyAV, ללא צורך ב-ffmpeg נפרד)."""
    from faster_whisper import decode_audio

    return decode_audio(path, sampling_rate=SAMPLE_RATE)


def transcribe(
    audio: np.ndarray,
    on_progress: Callable[[float], None] | None = None,
    beam_size: int | None = None,
    on_segment: Callable[[dict], None] | None = None,
) -> dict:
    """מתמלל את השמע. on_segment נקרא עם כל קטע מיד כשהוא מוכן (טקסט ביניים)."""
    model = get_model()
    beam_size = beam_size or config.BEAM_SIZE
    duration = len(audio) / SAMPLE_RATE

    # ההגדרות כאן נבחרו לטובת אמינות: חיפוש קרן, סינון שקט (VAD) כדי שהמודל
    # לא "ימציא" טקסט בקטעים שקטים, וללא התניה על טקסט קודם כדי למנוע לולאות חזרה.
    segments_iter, info = model.transcribe(
        audio,
        language="he",
        task="transcribe",
        beam_size=beam_size,
        best_of=beam_size,
        temperature=[0.0, 0.2, 0.4, 0.6],
        compression_ratio_threshold=2.4,
        log_prob_threshold=-1.0,
        no_speech_threshold=0.6,
        condition_on_previous_text=False,
        word_timestamps=True,
        hallucination_silence_threshold=2.0,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500, "speech_pad_ms": 300},
    )

    _cancel.clear()
    with _live_lock:
        _live_segments.clear()

    segments = []
    # faster-whisper מפענח את הקטע הבא רק כשמבקשים אותו מהאיטרטור, ולכן המתנה
    # כאן לפני הבקשה הבאה עוצרת את העבודה בפועל.
    while True:
        if not _running.is_set():
            _running.wait()
        if _cancel.is_set():
            raise Cancelled()
        seg = next(segments_iter, None)
        if seg is None:
            break
        words = [
            {
                "start": round(w.start, 3),
                "end": round(w.end, 3),
                "word": w.word,
                "p": round(w.probability, 3),
            }
            for w in (seg.words or [])
        ]
        segment = {
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": seg.text.strip(),
            "words": words,
            "speaker": None,
            "avg_logprob": round(seg.avg_logprob, 3),
            "no_speech_prob": round(seg.no_speech_prob, 3),
        }
        segments.append(segment)
        with _live_lock:
            _live_segments.append(segment)
        # מוצג בחלון שבו רץ השרת
        log.info("[%s] %s", _fmt(segment["start"]), segment["text"])
        if on_segment:
            on_segment(segment)
        if on_progress and duration > 0:
            on_progress(min(seg.end / duration, 1.0))

    return {
        "duration": round(duration, 3),
        "language": info.language,
        "model": config.WHISPER_MODEL,
        "segments": segments,
    }


def _fmt(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"
