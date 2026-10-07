"""הורדת שמע מקישור (יוטיוב ואתרים נוספים) בעזרת yt-dlp. זה השלב היחיד שדורש אינטרנט."""

from pathlib import Path
from typing import Callable


def download_audio(url: str, dest_dir: Path, check_cancel: Callable[[], None] | None = None) -> tuple[Path, str]:
    """מוריד את ערוץ השמע הטוב ביותר. מחזיר (נתיב הקובץ, כותרת).

    check_cancel נקרא במהלך ההורדה ויכול לזרוק חריגה כדי לעצור אותה.
    """
    import yt_dlp

    opts = {
        "format": "bestaudio/best",
        "outtmpl": str(dest_dir / "source.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "progress_hooks": [lambda _d: check_cancel()] if check_cancel else [],
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        path = Path(ydl.prepare_filename(info))
    if not path.exists():
        matches = sorted(dest_dir.glob("source.*"))
        if not matches:
            raise RuntimeError("ההורדה הסתיימה אך הקובץ לא נמצא")
        path = matches[0]
    return path, info.get("title") or url
