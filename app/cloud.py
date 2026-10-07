"""תמלול בענן דרך שרת GPU של RunPod שמריץ את מודל ivrit.ai (אופציונלי).

לפני השליחה מזהים מקומית את קטעי הדיבור (VAD) ושולחים רק אותם, דחוסים ב-Opus
ומחולקים לחלקים. זה מקטין את הקבצים מתחת למגבלת הגודל של RunPod, חוסך זמן
(ותשלום) על שקט, ומונע מהמודל "להמציא" טקסט בקטעים שקטים.
"""

import base64
import io
import logging
from typing import Callable

import numpy as np

from . import config

log = logging.getLogger(__name__)

SAMPLE_RATE = 16000
# כ-10 דקות דיבור לכל חלק: בערך 2.5MB ב-Opus, הרבה מתחת למגבלה של RunPod (~10MB)
MAX_CHUNK_SECONDS = 600
OPUS_BITRATE = 32000


def is_configured() -> bool:
    return bool(config.RUNPOD_API_KEY and config.RUNPOD_ENDPOINT_ID)


def speech_chunks(audio: np.ndarray) -> list[dict]:
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    opts = VadOptions(min_silence_duration_ms=500, speech_pad_ms=300)
    return get_speech_timestamps(audio, opts, sampling_rate=SAMPLE_RATE)


def group_chunks(chunks: list[dict], max_seconds: float = MAX_CHUNK_SECONDS) -> list[list[dict]]:
    """מקבץ קטעי דיבור רצופים לחלקים שאורך הדיבור בכל אחד מהם לא עולה על max_seconds."""
    limit = int(max_seconds * SAMPLE_RATE)
    groups: list[list[dict]] = []
    current: list[dict] = []
    size = 0
    for c in chunks:
        # קטע דיבור ארוך מהמגבלה (נדיר מאוד) — חותכים אותו
        for start in range(c["start"], c["end"], limit):
            piece = {"start": start, "end": min(start + limit, c["end"])}
            length = piece["end"] - piece["start"]
            if current and size + length > limit:
                groups.append(current)
                current, size = [], 0
            current.append(piece)
            size += length
    if current:
        groups.append(current)
    return groups


def encode_opus(audio: np.ndarray) -> bytes:
    import av

    buf = io.BytesIO()
    with av.open(buf, mode="w", format="ogg") as container:
        stream = container.add_stream("libopus", rate=SAMPLE_RATE)
        stream.bit_rate = OPUS_BITRATE
        stream.layout = "mono"
        pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16).reshape(1, -1)
        frame = av.AudioFrame.from_ndarray(pcm, format="s16", layout="mono")
        frame.sample_rate = SAMPLE_RATE
        for packet in stream.encode(frame):
            container.mux(packet)
        for packet in stream.encode(None):
            container.mux(packet)
    return buf.getvalue()


def _get_model():
    import ivrit

    return ivrit.load_model(
        engine="runpod",
        model=config.CLOUD_MODEL,
        api_key=config.RUNPOD_API_KEY,
        endpoint_id=config.RUNPOD_ENDPOINT_ID,
    )


def _remote_segments(model, blob: str, on_fraction: Callable[[float], None]):
    def on_progress(event: dict) -> None:
        if event.get("phase") == "transcription":
            on_fraction(float(event.get("step_fraction") or 0.0))

    return model.transcribe(
        blob=blob,
        language="he",
        stream=True,
        output_options={"word_timestamps": True, "extra_data": True},
        on_progress=on_progress,
    )


def transcribe(audio: np.ndarray, on_progress: Callable[[float], None] | None = None) -> dict:
    from faster_whisper.vad import SpeechTimestampsMap

    duration = len(audio) / SAMPLE_RATE
    groups = group_chunks(speech_chunks(audio))
    total_speech = sum(c["end"] - c["start"] for g in groups for c in g) or 1
    model = _get_model() if groups else None

    segments = []
    done = 0
    for i, group in enumerate(groups):
        speech = np.concatenate([audio[c["start"]:c["end"]] for c in group])
        blob = base64.b64encode(encode_opus(speech)).decode("ascii")
        log.info("שולח חלק %d/%d לענן (%.1f דקות דיבור, %.1fMB)",
                 i + 1, len(groups), len(speech) / SAMPLE_RATE / 60, len(blob) / 1e6)
        ts_map = SpeechTimestampsMap(group, SAMPLE_RATE, time_precision=3)
        to_orig = ts_map.get_original_time

        def on_fraction(f: float, done=done, size=len(speech)) -> None:
            if on_progress:
                on_progress(min((done + f * size) / total_speech, 1.0))

        for seg in _remote_segments(model, blob, on_fraction):
            extra = seg.extra_data or {}
            words = [
                {
                    "start": to_orig(w.start),
                    "end": to_orig(w.end, is_end=True),
                    "word": w.word,
                    "p": round(w.probability, 3) if w.probability is not None else None,
                }
                for w in seg.words
            ]
            segments.append(
                {
                    "start": to_orig(seg.start),
                    "end": to_orig(seg.end, is_end=True),
                    "text": seg.text.strip(),
                    "words": words,
                    "speaker": None,
                    "avg_logprob": extra.get("avg_logprob"),
                    "no_speech_prob": extra.get("no_speech_prob"),
                }
            )
        done += len(speech)
        if on_progress:
            on_progress(min(done / total_speech, 1.0))

    return {
        "duration": round(duration, 3),
        "language": "he",
        "model": f"{config.CLOUD_MODEL} (ענן)",
        "segments": segments,
    }
