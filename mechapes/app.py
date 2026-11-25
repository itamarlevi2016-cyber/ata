"""Entry point: python app.py  (or the packaged Mechapes.exe)."""
import multiprocessing
import sys


def selftest(folder, db_path, out_path):
    """Hidden check used by the build: index a folder and search it."""
    from mechapes import search as se
    from mechapes.index import Indexer, connect
    con = connect(db_path)
    Indexer.add_folder(con, folder)
    res = Indexer(db_path).run()
    results, _, missing = se.run_search(con, "משה העם", mode=se.MODE_NEAR, gap=3)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"index={res}\nresults={sorted(r.path for r in results)}\nmissing={missing}\n")
    # PDF must be found too: proves PyMuPDF was bundled correctly
    has_pdf = any(r.path.lower().endswith(".pdf") for r in results)
    return 0 if has_pdf and not res.get("errors") else 1


if __name__ == "__main__":
    multiprocessing.freeze_support()  # required for worker processes in the .exe
    if len(sys.argv) == 5 and sys.argv[1] == "--selftest":
        sys.exit(selftest(*sys.argv[2:]))
    from mechapes.gui import main
    main()
