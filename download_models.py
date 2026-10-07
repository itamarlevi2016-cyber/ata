"""הורדה חד-פעמית של המודלים, כדי שהתמלול יעבוד אחר כך ללא אינטרנט."""

import sys

from app import config, diarizer, transcriber

if __name__ == "__main__":
    print(f"מוריד את מודל התמלול {config.WHISPER_MODEL} (כ-1.6GB)...")
    transcriber.get_model()
    print("מודל התמלול מוכן.")

    if diarizer.is_available():
        if not config.HF_TOKEN:
            print("דילוג על מודל זיהוי הדוברים: לא הוגדר HF_TOKEN בקובץ .env (ראו README).")
            sys.exit(0)
        print(f"מוריד את מודל זיהוי הדוברים {config.DIARIZATION_MODEL}...")
        diarizer._get_pipeline()
        print("מודל זיהוי הדוברים מוכן.")
