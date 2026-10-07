"""תמלול מקומי בעזרת faster-whisper ומודל עברי של ivrit.ai."""

import logging
import threading
from typing import Callable

import numpy as np

from . import config

log = logging.getLogger(__name__)

SAMPLE_RATE = 16000

_model = None
_model_lock = threading.Lock()


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
                download_root=str(config.MODELS_DIR),
            )
        return _model


def load_audio(path: str) -> np.ndarray:
    """מפענח כל קובץ שמע/וידאו לגל מונו 16kHz (בעזרת PyAV, ללא צורך ב-ffmpeg נפרד)."""
    from faster_whisper import decode_audio

    return decode_audio(path, sampling_rate=SAMPLE_RATE)


def transcribe(audio: np.ndarray, on_progress: Callable[[float], None] | None = None) -> dict:
    model = get_model()
    duration = len(audio) / SAMPLE_RATE

    # ההגדרות כאן נבחרו לטובת אמינות: חיפוש קרן, סינון שקט (VAD) כדי שהמודל
    # לא "ימציא" טקסט בקטעים שקטים, וללא התניה על טקסט קודם כדי למנוע לולאות חזרה.
    segments_iter, info = model.transcribe(
        audio,
        language="he",
        task="transcribe",
        beam_size=config.BEAM_SIZE,
        best_of=config.BEAM_SIZE,
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

    segments = []
    for seg in segments_iter:
        words = [
            {
                "start": round(w.start, 3),
                "end": round(w.end, 3),
                "word": w.word,
                "p": round(w.probability, 3),
            }
            for w in (seg.words or [])
        ]
        segments.append(
            {
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg.text.strip(),
                "words": words,
                "speaker": None,
                "avg_logprob": round(seg.avg_logprob, 3),
                "no_speech_prob": round(seg.no_speech_prob, 3),
            }
        )
        if on_progress and duration > 0:
            on_progress(min(seg.end / duration, 1.0))

    return {
        "duration": round(duration, 3),
        "language": info.language,
        "model": config.WHISPER_MODEL,
        "segments": segments,
    }
