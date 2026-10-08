"""Command line: serve the web app, or run a range end to end (translate, build, check).

  python -m godol.cli serve
  python -m godol.cli run --pdf קמינצקי.pdf --start 331 --end 340 [--no-verify] [--mock]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="godol")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serve")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=8000)
    r = sub.add_parser("run")
    r.add_argument("--pdf", required=True)
    r.add_argument("--book", help="existing book id (reuses its checkpoints)")
    r.add_argument("--start", type=int, required=True)
    r.add_argument("--end", type=int, required=True)
    r.add_argument("--chapter", type=int)
    r.add_argument("--verify", action="store_true", help="run the independent checker (default: as set in the app's settings)")
    r.add_argument("--no-verify", action="store_true")
    r.add_argument("--mock", action="store_true", help="deterministic fake model, for plumbing tests only")
    a = ap.parse_args(argv)
    if getattr(a, "mock", False):
        os.environ["GODOL_MOCK"] = "1"
    from . import config  # after the env var is set
    config.USE_MOCK = os.environ.get("GODOL_MOCK") == "1"
    if a.cmd == "serve":
        import uvicorn
        uvicorn.run("godol.server:app", host=a.host, port=a.port)
        return 0
    from .book import Book
    from .llm import make_llm
    from .pipeline import PageFailed, translate_range
    from .service import build_segment, segments
    from . import settings
    st = settings.apply()
    verify = True if a.verify else False if a.no_verify else st["verify"]

    book = Book.open(a.book) if a.book else Book.create(Path(a.pdf).name, Path(a.pdf).read_bytes())
    llm = make_llm()
    segs, _ = segments()
    seg = next((x for x in segs if x.start <= a.start and a.end <= x.end), None)

    def ev(e):
        print(json.dumps(e, ensure_ascii=False)[:200])

    try:
        translate_range(book, a.start, a.end, llm, ev, chapter_hint=(seg.title if seg else ""))
    except PageFailed as e:
        print(f"נכשל בעמ' {e.pages}: {e}", file=sys.stderr)
        return 2
    rep = build_segment(book, a.start, a.end, llm=llm, verify=verify, seg=seg, chapter=a.chapter, on_event=ev)
    print("\n" + (book.out_dir / f"דוח בקרה – {rep['segment']}.md").read_text(encoding="utf-8"))
    print("book id:", book.id, "| file:", book.out_dir / rep["file"])
    return 0 if rep["summary"]["ready"] else 1


if __name__ == "__main__":
    sys.exit(main())
