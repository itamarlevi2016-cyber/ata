"""זיהוי דוברים (אופציונלי) בעזרת pyannote, ושיוך כל מילה בתמלול לדובר."""

import logging
import threading

import numpy as np

from . import config

log = logging.getLogger(__name__)

_pipeline = None
_pipeline_lock = threading.Lock()


def is_available() -> bool:
    try:
        import pyannote.audio  # noqa: F401
    except ImportError:
        return False
    return True


def _get_pipeline():
    global _pipeline
    with _pipeline_lock:
        if _pipeline is None:
            import torch
            from pyannote.audio import Pipeline

            # אחרי ההורדה הראשונה המודל נשמר במטמון המקומי ואין צורך באינטרנט
            _pipeline = Pipeline.from_pretrained(
                config.DIARIZATION_MODEL,
                use_auth_token=config.HF_TOKEN,
                cache_dir=str(config.MODELS_DIR),
            )
            if _pipeline is None:
                raise RuntimeError(
                    "לא ניתן לטעון את מודל זיהוי הדוברים. ודאו שהגדרתם HF_TOKEN "
                    "ואישרתם את תנאי השימוש של המודל באתר Hugging Face."
                )
            if torch.cuda.is_available():
                _pipeline.to(torch.device("cuda"))
        return _pipeline


def diarize(audio: np.ndarray, sample_rate: int, num_speakers: int | None = None) -> list[dict]:
    """מחזיר רשימת קטעים: [{"start", "end", "speaker"}]."""
    import torch

    pipeline = _get_pipeline()
    waveform = torch.from_numpy(audio).unsqueeze(0)
    kwargs = {"num_speakers": num_speakers} if num_speakers else {}
    annotation = pipeline({"waveform": waveform, "sample_rate": sample_rate}, **kwargs)
    # בגרסאות חדשות של pyannote מוחזר אובייקט עטיפה
    annotation = getattr(annotation, "speaker_diarization", annotation)
    return [
        {"start": turn.start, "end": turn.end, "speaker": speaker}
        for turn, _, speaker in annotation.itertracks(yield_label=True)
    ]


def _speaker_for(start: float, end: float, turns: list[dict]) -> str | None:
    best, best_overlap = None, 0.0
    for t in turns:
        overlap = min(end, t["end"]) - max(start, t["start"])
        if overlap > best_overlap:
            best, best_overlap = t["speaker"], overlap
    if best is not None:
        return best
    # המילה נפלה בין קטעים — נשייך לדובר הקרוב ביותר בזמן
    mid = (start + end) / 2
    nearest = min(turns, key=lambda t: min(abs(mid - t["start"]), abs(mid - t["end"])), default=None)
    return nearest["speaker"] if nearest else None


def assign_speakers(segments: list[dict], turns: list[dict]) -> list[dict]:
    """משייך כל מילה לדובר ומפצל קטעים בנקודות שבהן הדובר מתחלף."""
    if not turns:
        return segments

    result = []
    for seg in segments:
        words = seg["words"]
        if not words:
            result.append({**seg, "speaker": _speaker_for(seg["start"], seg["end"], turns)})
            continue

        current: dict | None = None
        for w in words:
            speaker = _speaker_for(w["start"], w["end"], turns)
            if current is None or speaker != current["speaker"]:
                if current is not None:
                    result.append(current)
                current = {**seg, "start": w["start"], "words": [], "speaker": speaker}
            current["words"].append(w)
            current["end"] = w["end"]
        result.append(current)

    for seg in result:
        if seg["words"]:
            seg["text"] = "".join(w["word"] for w in seg["words"]).strip()

    # איחוד קטעים צמודים של אותו דובר לפסקאות קריאות
    merged: list[dict] = []
    for seg in result:
        prev = merged[-1] if merged else None
        if prev and prev["speaker"] == seg["speaker"] and seg["start"] - prev["end"] < 1.0:
            prev["words"] = prev["words"] + seg["words"]
            prev["end"] = seg["end"]
            prev["text"] = (prev["text"] + " " + seg["text"]).strip()
        else:
            merged.append(dict(seg))
    return merged


def speaker_names(segments: list[dict]) -> dict[str, str]:
    names: dict[str, str] = {}
    for seg in segments:
        sp = seg.get("speaker")
        if sp and sp not in names:
            names[sp] = f"דובר {len(names) + 1}"
    return names
