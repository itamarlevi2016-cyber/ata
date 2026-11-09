"""
MCP server that lets an AI agent (Claude Desktop / Claude Code) search the
Bar-Ilan Responsa Project desktop app running on this Windows PC -- in the
background, WITHOUT moving the mouse, typing keystrokes, or stealing focus.

How it stays out of your way:
  * It talks to the app's controls through Windows UI Automation / window
    messages (set text via ValuePattern/WM_SETTEXT, press buttons via
    InvokePattern/BM_CLICK). The real mouse and keyboard are never used.
  * All UI work runs on one dedicated background thread, one request at a time.

Usage:
  python server.py                 # run as MCP server (stdio) - used by Claude
  python server.py --inspect       # dump the app's control tree for calibration
  python server.py --test "שבת"    # run one search from the command line
"""

import argparse
import asyncio
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.json"

DEFAULT_CONFIG = {
    # "uia" (modern UI Automation) or "win32" (classic window messages).
    # --inspect shows which one exposes the app's controls better.
    "backend": "uia",
    # Exe name of the Bar-Ilan program (most reliable way to find it).
    # Leave empty to find the window by title instead.
    "process_name": "",
    "window_title_re": r".*(שו\"ת|פרויקט השו|Responsa|בר[- ]?אילן).*",
    # Optional: full path to the exe on the USB stick, to auto-start it.
    "exe_path": "",
    # Selectors are passed as-is to pywinauto's child_window(**selector).
    "search_box": {"control_type": "Edit", "found_index": 0},
    "search_button": {"title_re": ".*(חפש|חיפוש|Search).*", "control_type": "Button"},
    # If the app searches on Enter instead of a button (win32 backend only).
    "submit_with_enter": False,
    "results_list": {"control_type": "List", "found_index": 0},
    "document_view": {"control_type": "Document", "found_index": 0},
    # How to open a result: "select" or "invoke".
    "open_result_action": "select",
    "wait_seconds": 30,
    "max_chars": 60000,
}


def load_config():
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_PATH.exists():
        cfg.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
    return cfg


CFG = load_config()


# --------------------------------------------------------------------------
# UI worker: everything that touches pywinauto runs on this single thread.
# --------------------------------------------------------------------------

def _init_worker():
    sys.coinit_flags = 2  # COM STA, recommended by pywinauto for threads
    import pywinauto  # noqa: F401  (import inside the worker thread)


EXECUTOR = ThreadPoolExecutor(max_workers=1, initializer=_init_worker)


def _app_window():
    from pywinauto import Application

    backend = CFG["backend"]
    app = Application(backend=backend)
    try:
        if CFG["process_name"]:
            app.connect(path=CFG["process_name"], timeout=3)
        else:
            app.connect(title_re=CFG["window_title_re"], timeout=3)
    except Exception:
        if not CFG["exe_path"]:
            raise RuntimeError(
                "תוכנת שו\"ת בר אילן לא פתוחה (או שלא נמצאה). פתח אותה ונסה שוב."
            )
        app.start(CFG["exe_path"])
        time.sleep(5)
        app.connect(path=CFG["exe_path"], timeout=60)
    if CFG["process_name"] or CFG["exe_path"]:
        return app.top_window()
    return app.window(title_re=CFG["window_title_re"], found_index=0)


def _find(win, key):
    return win.child_window(**CFG[key]).wrapper_object()


def _read_text(w):
    getters = (
        lambda: w.iface_text.DocumentRange.GetText(-1),  # UIA TextPattern
        lambda: w.get_value(),
        lambda: "\n".join(t for t in w.texts() if t and t.strip()),
        lambda: w.window_text(),
    )
    for get in getters:
        try:
            t = get()
            if t and str(t).strip():
                return str(t)
        except Exception:
            pass
    return ""


def _list_items(lst):
    try:
        items = lst.item_texts()  # win32 ListBox / ListView
        if items:
            return [str(i) for i in items]
    except Exception:
        pass
    try:
        kids = lst.children()
        texts = [_read_text(k) for k in kids]
        if any(texts):
            return texts
    except Exception:
        pass
    return [t for t in lst.texts() if t]


def _wait_change(get_snapshot, before, seconds):
    """Wait until get_snapshot() differs from `before` and is stable."""
    deadline = time.time() + seconds
    last = None
    while time.time() < deadline:
        try:
            cur = get_snapshot()
        except Exception:
            cur = None
        if cur and cur != before and cur == last:
            return cur
        last = cur
        time.sleep(0.7)
    return last


def _truncate(s):
    m = CFG["max_chars"]
    return s if len(s) <= m else s[:m] + f"\n\n[...קוצר, {len(s) - m} תווים נוספים]"


def do_status():
    win = _app_window()
    return f"מחובר לחלון: {win.window_text()!r} (backend={CFG['backend']})"


def do_search(query, max_results):
    win = _app_window()
    lst_snapshot = lambda: tuple(_list_items(_find(win, "results_list")))
    try:
        before = lst_snapshot()
    except Exception:
        before = ()

    box = _find(win, "search_box")
    box.set_edit_text(query)  # ValuePattern / WM_SETTEXT - no focus needed

    if CFG["submit_with_enter"]:
        box.send_keystrokes("{ENTER}")  # posted message, win32 backend only
    else:
        btn = _find(win, "search_button")
        if CFG["backend"] == "uia":
            btn.invoke()
        else:
            btn.click()  # BM_CLICK message, not the real mouse

    items = _wait_change(lst_snapshot, before, CFG["wait_seconds"]) or ()
    if not items:
        return f"לא נמצאו תוצאות (או שהחיפוש לא הסתיים תוך {CFG['wait_seconds']} שניות)."
    shown = items[:max_results]
    lines = [f"{i}. {t}" for i, t in enumerate(shown)]
    head = f"נמצאו {len(items)} תוצאות" + (f" (מוצגות {len(shown)})" if len(items) > len(shown) else "")
    return _truncate(head + ":\n" + "\n".join(lines))


def do_open_result(index):
    win = _app_window()
    lst = _find(win, "results_list")
    doc_snapshot = lambda: _read_text(_find(win, "document_view"))
    try:
        before = doc_snapshot()
    except Exception:
        before = ""

    try:
        lst.select(index)  # win32 ListBox/ListView
    except Exception:
        item = lst.children()[index]
        if CFG["open_result_action"] == "invoke":
            item.invoke()
        else:
            item.select()  # UIA SelectionItemPattern

    text = _wait_change(doc_snapshot, before, CFG["wait_seconds"]) or doc_snapshot()
    return _truncate(text) if text else "לא הצלחתי לקרוא את טקסט המקור."


def do_window_text():
    """Fallback: every visible text in the app window."""
    win = _app_window()
    parts = []
    for el in win.descendants():
        t = _read_text(el)
        if t and t.strip() and t not in parts:
            parts.append(t)
    return _truncate("\n".join(parts))


async def run_ui(fn, *args):
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(EXECUTOR, fn, *args)
    except Exception as e:  # report errors to the agent as text
        return f"שגיאה: {type(e).__name__}: {e}"


# --------------------------------------------------------------------------
# MCP tools
# --------------------------------------------------------------------------

def build_server():
    from mcp.server.fastmcp import FastMCP

    mcp = FastMCP("bar-ilan-responsa")

    @mcp.tool()
    async def barilan_status() -> str:
        """Check that the Bar-Ilan Responsa desktop app is open and reachable."""
        return await run_ui(do_status)

    @mcp.tool()
    async def barilan_search(query: str, max_results: int = 100) -> str:
        """Search the Bar-Ilan Responsa Project (שו"ת בר אילן) on this PC.
        Use the app's query syntax (Hebrew words; quotes for exact phrases).
        Returns a numbered list of results; open one with barilan_open_result."""
        return await run_ui(do_search, query, max_results)

    @mcp.tool()
    async def barilan_open_result(index: int) -> str:
        """Open result number `index` (from the last barilan_search) and return
        the source text shown in the app."""
        return await run_ui(do_open_result, index)

    @mcp.tool()
    async def barilan_window_text() -> str:
        """Fallback: return all text currently visible in the app window."""
        return await run_ui(do_window_text)

    return mcp


# --------------------------------------------------------------------------
# Calibration helpers
# --------------------------------------------------------------------------

def inspect(out_dir):
    from pywinauto import Desktop

    try:
        import psutil
    except ImportError:
        psutil = None

    out_dir = Path(out_dir)
    lines = ["== Top-level windows =="]
    for backend in ("uia", "win32"):
        for w in Desktop(backend=backend).windows():
            try:
                title = w.window_text()
                pid = w.process_id()
                exe = psutil.Process(pid).exe() if psutil else "?"
            except Exception:
                continue
            if title:
                lines.append(f"[{backend}] {title!r}  pid={pid}  exe={exe}")
    (out_dir / "barilan_windows.txt").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))

    for backend in ("uia", "win32"):
        CFG["backend"] = backend
        path = out_dir / f"barilan_ui_{backend}.txt"
        try:
            win = _app_window()
            win.print_control_identifiers(depth=8, filename=str(path))
            print(f"\nנשמר: {path}")
        except Exception as e:
            print(f"\n[{backend}] לא הצלחתי: {e}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--inspect", action="store_true", help="dump the UI tree")
    p.add_argument("--test", metavar="QUERY", help="run one search and print it")
    p.add_argument("--open", type=int, metavar="N", help="with --test: open result N")
    args = p.parse_args()

    if args.inspect or args.test:
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
        _init_worker()
        if args.inspect:
            inspect(HERE)
        else:
            print(do_search(args.test, 50))
            if args.open is not None:
                print("\n" + "=" * 60 + "\n" + do_open_result(args.open))
        return

    build_server().run()  # stdio


if __name__ == "__main__":
    main()
