"""CI smoke test: index sample files, search, and save a screenshot.
Usage: python tests/gui_screenshot.py <samples_dir> <out.png>"""
import os
import sys
import tempfile
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("LOCALAPPDATA", tempfile.mkdtemp())

import tkinter as tk  # noqa: E402

from mechapes import gui  # noqa: E402
from mechapes.index import Indexer  # noqa: E402

ok = {"rows": 0}
app = root = None


def step2():
    if app.index_thread.is_alive():
        root.after(300, step2)
        return
    app.query.set("משה העם")
    app.gap.set(3)
    app.mode.set("near")
    app.do_search()
    root.after(2000, step3)


def dump_image(path):
    """Print the screenshot into the CI log (base64), so it can be seen
    without downloading artifacts."""
    import base64
    with open(path, "rb") as f:
        data = base64.b64encode(f.read()).decode()
    print("SCREENSHOT-BEGIN")
    for i in range(0, len(data), 2000):
        print(data[i:i + 2000])
    print("SCREENSHOT-END", flush=True)


def step3():
    try:
        ok["rows"] = len(app.tree.get_children())
        print("status:", app.status.cget("text"), "rows:", ok["rows"], flush=True)
        root.lift()
        root.attributes("-topmost", True)
        root.update()
        time.sleep(1)
        from PIL import ImageGrab
        x, y = root.winfo_rootx(), root.winfo_rooty()
        ImageGrab.grab((x, y, x + root.winfo_width(), y + root.winfo_height())).save(ok["out"])
        dump_image(ok["out"])
    finally:
        app.on_close()


def watchdog():
    """If the GUI gets stuck (e.g. a dialog box), capture the whole screen
    so the problem is visible, then exit."""
    print("WATCHDOG: GUI did not finish; status:", flush=True)
    try:
        print(app.status.cget("text"), flush=True)
    except Exception as e:  # noqa: BLE001
        print("status unavailable:", e, flush=True)
    try:
        from PIL import ImageGrab
        ImageGrab.grab().save(ok["out"])
    except Exception as e:  # noqa: BLE001
        print("screenshot failed:", e, flush=True)
    os._exit(2)


def main():
    global app, root
    samples, out = sys.argv[1], sys.argv[2]
    ok["out"] = out
    import threading
    t = threading.Timer(120, watchdog)
    t.daemon = True
    t.start()
    root = tk.Tk()
    app = gui.App(root)
    Indexer.add_folder(app.con, samples)
    app.refresh_folders()
    app.update_index()
    root.after(500, step2)
    root.mainloop()
    sys.exit(0 if ok["rows"] > 0 else 1)


if __name__ == "__main__":
    main()
