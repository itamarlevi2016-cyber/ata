"""הפעלה כאפליקציית שולחן עבודה: השרת רץ ברקע (בלי חלון שחור) והממשק נפתח בחלון משלו.

מריצים עם pythonw (ב-Windows) — דרך קיצור הדרך שנוצר בהתקנה.
אם רכיב החלון (pywebview) לא זמין, הממשק נפתח במצב "אפליקציה" של Edge/Chrome, ואם גם
זה לא אפשרי — בדפדפן הרגיל.
"""

import json
import logging
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from logging.handlers import RotatingFileHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

if sys.platform == "win32":
    # ספריות CUDA שהותקנו דרך pip (רק עם כרטיס NVIDIA) — כדי שהתמלול ירוץ על הכרטיס הגרפי
    for sub in ("cublas", "cudnn"):
        dll_dir = ROOT / ".venv" / "Lib" / "site-packages" / "nvidia" / sub / "bin"
        if dll_dir.is_dir():
            os.environ["PATH"] = f"{dll_dir}{os.pathsep}{os.environ.get('PATH', '')}"
            os.add_dll_directory(str(dll_dir))

from app import config  # noqa: E402

TITLE = "תמלול עברית"
ICON = ROOT / "app" / "static" / "icon.ico"
LOG_FILE = config.DATA_DIR / "app.log"

log = logging.getLogger("desktop")


def setup_logging() -> None:
    """ב-pythonw אין קונסולה (sys.stdout הוא None) — מפנים הכול לקובץ לוג."""
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    if sys.stdout is None or sys.stderr is None:
        stream = open(LOG_FILE, "a", encoding="utf-8", buffering=1)  # noqa: SIM115
        sys.stdout = sys.stdout or stream
        sys.stderr = sys.stderr or stream
    handler = RotatingFileHandler(LOG_FILE, maxBytes=2_000_000, backupCount=2, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(handler)


def is_our_server(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/status", timeout=1.5) as r:
            return "model" in json.loads(r.read())
    except Exception:  # noqa: BLE001
        return False


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((config.HOST, port))
            return True
        except OSError:
            return False


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((config.HOST, 0))
        return s.getsockname()[1]


def start_server(port: int):
    import uvicorn

    from app.main import app

    server = uvicorn.Server(uvicorn.Config(app, host=config.HOST, port=port, log_config=None, log_level="warning"))
    thread = threading.Thread(target=server.run, name="server", daemon=True)
    thread.start()
    deadline = time.time() + 60
    while not server.started:
        if not thread.is_alive():
            raise RuntimeError("השרת לא הצליח לעלות — ראו את קובץ הלוג")
        if time.time() > deadline:
            raise RuntimeError("השרת לא עלה בזמן")
        time.sleep(0.05)
    return server, thread


def has_running_job() -> bool:
    from app import jobs

    return any(j["status"] in jobs.ACTIVE_STATES - {"queued"} for j in jobs.list_jobs())


def open_window(url: str, owns_server: bool) -> bool:
    """פותח חלון אפליקציה. מחזיר False אם pywebview לא זמין."""
    try:
        import webview
    except ImportError:
        log.warning("pywebview לא מותקן — פותח במצב דפדפן")
        return False

    webview.settings["ALLOW_DOWNLOADS"] = True  # ייצוא ל-Word/טקסט/כתוביות
    webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True
    window = webview.create_window(
        TITLE, url, width=1280, height=860, min_size=(820, 600),
        background_color="#F5F6F8", text_select=True,
    )

    def on_closing():
        # סגירה בזמן תמלול עוצרת אותו — מבקשים אישור
        if owns_server and has_running_job():
            return window.create_confirmation_dialog(
                TITLE,
                "יש תמלול שעדיין רץ. סגירת התוכנה תעצור אותו, והוא יתחיל מחדש "
                "בפעם הבאה שתפתחו את התוכנה.\n\nלסגור בכל זאת?",
            )
        return True

    window.events.closing += on_closing
    try:
        webview.start(
            private_mode=False,  # שומר העדפות (למשל מנוע התמלול) בין הפעלות
            storage_path=str(config.DATA_DIR / "webview"),
            icon=str(ICON) if ICON.exists() else None,
        )
    except Exception:  # noqa: BLE001
        log.exception("החלון לא נפתח — פותח במצב דפדפן")
        return False
    return True


def open_browser_app(url: str) -> None:
    """חלופה: חלון "אפליקציה" של Edge/Chrome (בלי שורת כתובת), ואם אין — דפדפן רגיל."""
    candidates = ["msedge", "chrome", "google-chrome", "chromium", "chromium-browser"]
    if sys.platform == "win32":
        pf = [os.environ.get(k, "") for k in ("ProgramFiles(x86)", "ProgramFiles", "LocalAppData")]
        candidates = [
            str(Path(p) / sub) for p in pf if p for sub in (
                "Microsoft/Edge/Application/msedge.exe", "Google/Chrome/Application/chrome.exe")
        ] + candidates
    for c in candidates:
        exe = c if Path(c).exists() else shutil.which(c)
        if exe:
            subprocess.Popen([exe, f"--app={url}", "--window-size=1280,860"])  # noqa: S603
            return
    import webbrowser

    webbrowser.open(url)


def main() -> None:
    setup_logging()
    port = config.PORT

    # התוכנה כבר פתוחה? מתחברים לשרת הקיים ולא מפעילים עוד אחד
    if is_our_server(port):
        log.info("השרת כבר רץ בפורט %d — פותח חלון נוסף", port)
        if not open_window(f"http://127.0.0.1:{port}/", owns_server=False):
            open_browser_app(f"http://127.0.0.1:{port}/")
        return

    if not port_free(port):
        port = free_port()
    log.info("מפעיל שרת בפורט %d", port)
    try:
        _server, thread = start_server(port)
    except Exception as e:  # noqa: BLE001
        log.exception("ההפעלה נכשלה")
        _show_error(f"התוכנה לא הצליחה לעלות:\n{e}\n\nפרטים בקובץ:\n{LOG_FILE}")
        return

    url = f"http://127.0.0.1:{port}/"
    if open_window(url, owns_server=True):
        return  # החלון נסגר — יוצאים (השרת רץ בתהליכון רקע ונסגר יחד עם התהליך)

    # מצב דפדפן: אין לנו דרך לדעת מתי החלון נסגר, אז השרת ממשיך לרוץ ברקע
    open_browser_app(url)
    thread.join()


def _show_error(message: str) -> None:
    if sys.platform == "win32":
        import ctypes

        ctypes.windll.user32.MessageBoxW(None, message, TITLE, 0x10)
    else:
        print(message, file=sys.stderr)


if __name__ == "__main__":
    main()
