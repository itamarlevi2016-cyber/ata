"""CI smoke test: index sample files, search, and save a screenshot.
Usage: python tests/gui_screenshot.py <samples_dir> <out.png>"""
import os
import sys
import tempfile
import time

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


def step3():
    ok["rows"] = len(app.tree.get_children())
    print("status:", app.status.cget("text"), "rows:", ok["rows"])
    root.lift()
    root.attributes("-topmost", True)
    root.update()
    time.sleep(1)
    from PIL import ImageGrab
    x, y = root.winfo_rootx(), root.winfo_rooty()
    ImageGrab.grab((x, y, x + root.winfo_width(), y + root.winfo_height())).save(ok["out"])
    app.on_close()


def main():
    global app, root
    samples, out = sys.argv[1], sys.argv[2]
    ok["out"] = out
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
