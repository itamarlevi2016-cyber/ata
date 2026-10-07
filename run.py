"""הפעלת האתר המקומי ופתיחתו בדפדפן."""

import threading
import webbrowser

import uvicorn

from app import config

if __name__ == "__main__":
    url = f"http://{'localhost' if config.HOST in ('127.0.0.1', '0.0.0.0') else config.HOST}:{config.PORT}"
    print(f"\n  האתר פועל בכתובת: {url}\n  לסגירה: Ctrl+C\n")
    threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    uvicorn.run("app.main:app", host=config.HOST, port=config.PORT, log_level="warning")
