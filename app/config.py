"""הגדרות המערכת. ניתן לשנות דרך משתני סביבה או קובץ .env בתיקיית הפרויקט."""

import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(ROOT_DIR / ".env")

DATA_DIR = Path(os.environ.get("ATA_DATA_DIR", ROOT_DIR / "data"))
JOBS_DIR = DATA_DIR / "jobs"
MODELS_DIR = Path(os.environ.get("ATA_MODELS_DIR", ROOT_DIR / "models"))

# מודל Whisper שאומן על עברית (ivrit.ai), בפורמט CTranslate2 עבור faster-whisper
WHISPER_MODEL = os.environ.get("ATA_WHISPER_MODEL", "ivrit-ai/whisper-large-v3-turbo-ct2")
# auto / cuda / cpu
DEVICE = os.environ.get("ATA_DEVICE", "auto")
# auto / float16 / int8_float16 / int8
COMPUTE_TYPE = os.environ.get("ATA_COMPUTE_TYPE", "auto")
BEAM_SIZE = int(os.environ.get("ATA_BEAM_SIZE", "5"))
# מצב "מהיר": חיפוש חמדני — בערך פי 2 מהר יותר על מעבד רגיל, בדיוק מעט נמוך יותר
FAST_BEAM_SIZE = int(os.environ.get("ATA_FAST_BEAM_SIZE", "1"))

# טוקן של Hugging Face — נדרש רק פעם אחת, להורדת מודל זיהוי הדוברים
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("ATA_HF_TOKEN")
DIARIZATION_MODEL = os.environ.get("ATA_DIARIZATION_MODEL", "pyannote/speaker-diarization-3.1")

# תמלול בענן (אופציונלי): נקודת קצה של RunPod שמריצה את התבנית של ivrit.ai
RUNPOD_API_KEY = os.environ.get("RUNPOD_API_KEY", "")
RUNPOD_ENDPOINT_ID = os.environ.get("RUNPOD_ENDPOINT_ID", "")
CLOUD_MODEL = os.environ.get("ATA_CLOUD_MODEL", "ivrit-ai/whisper-large-v3-turbo-ct2")

# כברירת מחדל האתר זמין רק מהמחשב הזה
HOST = os.environ.get("ATA_HOST", "127.0.0.1")
PORT = int(os.environ.get("ATA_PORT", "8000"))

# מילים עם הסתברות נמוכה מזו יסומנו כ"לבדיקה"
LOW_CONFIDENCE = float(os.environ.get("ATA_LOW_CONFIDENCE", "0.6"))

MAX_UPLOAD_MB = int(os.environ.get("ATA_MAX_UPLOAD_MB", "2048"))
