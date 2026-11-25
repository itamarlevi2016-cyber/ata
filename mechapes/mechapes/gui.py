"""Tkinter user interface (Hebrew, right-to-left layout)."""
import json
import os
import queue
import subprocess
import sys
import threading
import time
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from . import __version__
from . import search as se
from .extract import TYPE_GROUPS
from .index import Indexer, connect, load_file_text

APP_NAME = "מחפש"
HELP_TEXT = """איך מחפשים

• כמה מילים עם רווח ביניהן: כל המילים צריכות להופיע בקובץ.
• מצב "בדילוג": המילים צריכות להופיע קרוב זו לזו, עם עד N מילים בין מילה למילה.
   סמנו "לפי הסדר" כדי לדרוש את סדר המילים כפי שהקלדתם.
• מצב "צירוף מדויק": המילים צמודות, בסדר שהוקלד.

סימנים מיוחדים:
   *      כל רצף אותיות.  לדוגמה:  ירושל*
   ?      אות אחת בדיוק.   לדוגמה:  כ?ב
   |      אחת מכמה אפשרויות (בלי רווח).  לדוגמה:  משה|אהרן
   -מילה  קבצים שלא מופיעה בהם המילה.  לדוגמה:  -טיוטה

"גם עם אותיות שימוש": החיפוש "ספר" ימצא גם "והספר", "בספר", "שבספר"
(עד שלוש אותיות מתוך ו,ה,ב,כ,ל,מ,ש בתחילת המילה).
ניקוד, טעמים וגרשיים לא משנים את החיפוש:  רמב"ם = רמבם.

תיקיות: הוסיפו תיקיות למאגר. החיפוש ייעשה רק בתיקיות המסומנות ברשימה.
לחיצה כפולה על תוצאה פותחת את הקובץ.
"""


# ------------------------------------------------------------ paths
def data_dir():
    """Next to the program if that folder is writable (portable use),
    otherwise in the user's AppData."""
    base = (os.path.dirname(sys.executable) if getattr(sys, "frozen", False)
            else os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    portable = os.path.join(base, "MechapesData")
    try:
        os.makedirs(portable, exist_ok=True)
        test = os.path.join(portable, ".write_test")
        with open(test, "w") as f:
            f.write("x")
        os.remove(test)
        return portable
    except OSError:
        root = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~/.local/share")
        d = os.path.join(root, "Mechapes")
        os.makedirs(d, exist_ok=True)
        return d


def open_path(path, select=False):
    try:
        if sys.platform.startswith("win"):
            if select:
                subprocess.Popen(["explorer", "/select,", os.path.normpath(path)])
            else:
                os.startfile(path)  # noqa: S606 - opening the user's own file
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-R", path] if select else ["open", path])
        else:
            subprocess.Popen(["xdg-open", os.path.dirname(path) if select else path])
    except OSError as e:
        messagebox.showerror(APP_NAME, f"לא ניתן לפתוח:\n{path}\n\n{e}")


def human_size(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return str(n)


# ------------------------------------------------------------ application
class App:
    def __init__(self, root):
        self.root = root
        self.dir = data_dir()
        self.db_path = os.path.join(self.dir, "index.db")
        self.settings_path = os.path.join(self.dir, "settings.json")
        self.con = connect(self.db_path)
        self.settings = self._load_settings()
        self.msgs = queue.Queue()
        self.index_thread = None
        self.cancel_event = threading.Event()
        self.results = []
        self.current_query = None
        self.search_seq = 0

        root.title(f"{APP_NAME} – חיפוש בתוך קבצים")
        root.geometry(self.settings.get("geometry", "1150x720"))
        root.minsize(800, 500)
        self._build_ui()
        self.refresh_folders()
        root.protocol("WM_DELETE_WINDOW", self.on_close)
        root.after(100, self.poll)
        if self.settings.get("auto_update", True) and self.folder_rows():
            root.after(500, self.update_index)

    # ---------------- settings
    def _load_settings(self):
        try:
            with open(self.settings_path, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return {}

    def _save_settings(self):
        s = {
            "geometry": self.root.geometry(),
            "mode": self.mode.get(), "gap": self.gap.get(),
            "ordered": self.ordered.get(), "prefixes": self.prefixes.get(),
            "auto_update": self.auto_update.get(),
            "unchecked": sorted(self.unchecked),
        }
        try:
            with open(self.settings_path, "w", encoding="utf-8") as f:
                json.dump(s, f, ensure_ascii=False, indent=1)
        except OSError:
            pass

    # ---------------- layout
    def _build_ui(self):
        st = self.settings
        style = ttk.Style()
        if "vista" in style.theme_names():
            style.theme_use("vista")
        base_font = ("Segoe UI", 10) if sys.platform.startswith("win") else ("DejaVu Sans", 10)
        self.root.option_add("*Font", base_font)
        style.configure("Treeview", rowheight=24)
        style.configure("Big.TButton", padding=(14, 4))

        # --- search bar
        bar = ttk.Frame(self.root, padding=(8, 8, 8, 2))
        bar.pack(fill="x")
        ttk.Label(bar, text="חיפוש:").pack(side="right")
        self.query = tk.StringVar()
        self.entry = ttk.Entry(bar, textvariable=self.query, justify="right",
                               font=(base_font[0], 13))
        self.entry.pack(side="right", fill="x", expand=True, padx=6)
        self.entry.bind("<Return>", lambda e: self.do_search())
        ttk.Button(bar, text="חפש", style="Big.TButton",
                   command=self.do_search).pack(side="right")
        ttk.Button(bar, text="?", width=3, command=self.show_help).pack(side="left")

        # --- options
        opts = ttk.Frame(self.root, padding=(8, 2))
        opts.pack(fill="x")
        self.mode = tk.StringVar(value=st.get("mode", se.MODE_NEAR))
        self.gap = tk.IntVar(value=st.get("gap", 5))
        self.ordered = tk.BooleanVar(value=st.get("ordered", False))
        self.prefixes = tk.BooleanVar(value=st.get("prefixes", True))
        ttk.Radiobutton(opts, text="כל המילים בקובץ", value=se.MODE_ALL,
                        variable=self.mode).pack(side="right", padx=(0, 10))
        ttk.Radiobutton(opts, text="בדילוג: עד", value=se.MODE_NEAR,
                        variable=self.mode).pack(side="right")
        ttk.Spinbox(opts, from_=0, to=500, width=4, textvariable=self.gap,
                    justify="center").pack(side="right", padx=3)
        ttk.Label(opts, text="מילים בין מילה למילה").pack(side="right", padx=(0, 4))
        ttk.Checkbutton(opts, text="לפי הסדר", variable=self.ordered).pack(side="right", padx=(0, 14))
        ttk.Radiobutton(opts, text="צירוף מדויק", value=se.MODE_PHRASE,
                        variable=self.mode).pack(side="right", padx=(0, 14))
        ttk.Checkbutton(opts, text="גם עם אותיות שימוש (והבכלמש)",
                        variable=self.prefixes).pack(side="right", padx=(0, 14))

        filt = ttk.Frame(self.root, padding=(8, 2, 8, 6))
        filt.pack(fill="x")
        ttk.Label(filt, text="סוג קובץ:").pack(side="right")
        self.type_filter = ttk.Combobox(filt, state="readonly", width=14, justify="right",
                                        values=["הכל"] + list(TYPE_GROUPS))
        self.type_filter.current(0)
        self.type_filter.pack(side="right", padx=4)
        ttk.Label(filt, text="שם/נתיב הקובץ מכיל:").pack(side="right", padx=(14, 0))
        self.name_filter = tk.StringVar()
        ne = ttk.Entry(filt, textvariable=self.name_filter, width=22, justify="right")
        ne.pack(side="right", padx=4)
        ne.bind("<Return>", lambda e: self.do_search())

        # --- main panes
        main = ttk.PanedWindow(self.root, orient="horizontal")
        main.pack(fill="both", expand=True, padx=8)

        left = ttk.PanedWindow(main, orient="vertical")
        right = ttk.Frame(main, padding=(6, 0, 0, 0))
        main.add(left, weight=4)
        main.add(right, weight=1)

        # folders (right side)
        ttk.Label(right, text="תיקיות לחיפוש", font=(base_font[0], 11, "bold"),
                  anchor="e").pack(fill="x")
        ttk.Label(right, text="לחיצה מסמנת / מבטלת", foreground="gray",
                  anchor="e").pack(fill="x")
        self.folders = ttk.Treeview(right, columns=("path",), show="tree", height=8,
                                    selectmode="browse")
        self.folders.column("#0", width=30, stretch=False, anchor="center")
        self.folders.column("path", anchor="e", width=230)
        self.folders.pack(fill="both", expand=True, pady=4)
        self.folders.bind("<Button-1>", self.on_folder_click)
        self.unchecked = set(st.get("unchecked", []))
        fb = ttk.Frame(right)
        fb.pack(fill="x")
        ttk.Button(fb, text="הוסף תיקייה…", command=self.add_folder).pack(fill="x", pady=1)
        ttk.Button(fb, text="הסר תיקייה", command=self.remove_folder).pack(fill="x", pady=1)
        ttk.Button(fb, text="עדכן את המאגר", command=self.update_index).pack(fill="x", pady=1)
        ttk.Button(fb, text="בנה מחדש תיקייה", command=self.rebuild_folder).pack(fill="x", pady=1)
        self.auto_update = tk.BooleanVar(value=st.get("auto_update", True))
        ttk.Checkbutton(right, text="עדכן אוטומטית בפתיחה",
                        variable=self.auto_update).pack(anchor="e", pady=(6, 0))
        self.stats = ttk.Label(right, foreground="gray", anchor="e", justify="right")
        self.stats.pack(fill="x", pady=4)

        # results
        res_frame = ttk.Frame(left)
        cols = ("modified", "size", "hits", "folder", "name")
        self.tree = ttk.Treeview(res_frame, columns=cols, show="headings", selectmode="browse")
        heads = {"name": ("שם הקובץ", 230), "folder": ("תיקייה", 330), "hits": ("התאמות", 70),
                 "size": ("גודל", 80), "modified": ("תאריך שינוי", 125)}
        for c in cols:
            title, w = heads[c]
            self.tree.heading(c, text=title, anchor="e", command=lambda c=c: self.sort_by(c))
            self.tree.column(c, width=w, anchor="e", stretch=c in ("folder", "name"))
        ysb = ttk.Scrollbar(res_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=ysb.set)
        ysb.pack(side="left", fill="y")
        self.tree.pack(side="right", fill="both", expand=True)
        self.tree.bind("<<TreeviewSelect>>", self.on_select)
        self.tree.bind("<Double-1>", lambda e: self.open_selected())
        self.tree.bind("<Return>", lambda e: self.open_selected())
        self.tree.bind("<Button-3>", self.on_right_click)
        left.add(res_frame, weight=3)

        # snippets
        snip_frame = ttk.Frame(left)
        top = ttk.Frame(snip_frame)
        top.pack(fill="x", pady=(4, 2))
        ttk.Button(top, text="פתח קובץ", command=self.open_selected).pack(side="right")
        ttk.Button(top, text="פתח תיקייה", command=lambda: self.open_selected(True)).pack(side="right", padx=4)
        self.snip_title = ttk.Label(top, anchor="e")
        self.snip_title.pack(side="right", fill="x", expand=True, padx=6)
        self.snip = tk.Text(snip_frame, wrap="word", height=10, padx=8, pady=6,
                            font=(base_font[0], 11), relief="flat", background="#fbfbf8")
        sb = ttk.Scrollbar(snip_frame, orient="vertical", command=self.snip.yview)
        self.snip.configure(yscrollcommand=sb.set)
        sb.pack(side="left", fill="y")
        self.snip.pack(side="right", fill="both", expand=True)
        self.snip.tag_configure("p", justify="right", spacing1=4, spacing3=8,
                                lmargin1=4, rmargin=4)
        self.snip.tag_configure("hit", background="#ffe066",
                                font=(base_font[0], 11, "bold"))
        self.snip.tag_configure("sep", foreground="#999999", justify="center")
        self.snip.configure(state="disabled")
        left.add(snip_frame, weight=2)

        # status bar
        status = ttk.Frame(self.root, padding=(8, 4))
        status.pack(fill="x", side="bottom")
        self.status = ttk.Label(status, anchor="e")
        self.status.pack(side="right", fill="x", expand=True)
        self.progress = ttk.Progressbar(status, length=220, mode="determinate")
        self.cancel_btn = ttk.Button(status, text="עצור עדכון", command=self.cancel_index)

        self.root.bind("<Control-f>", lambda e: (self.entry.focus_set(), self.entry.select_range(0, "end")))
        self.entry.focus_set()

    # ---------------- folders
    def folder_rows(self):
        return self.con.execute("SELECT id, path FROM folders ORDER BY path").fetchall()

    def refresh_folders(self):
        self.folders.delete(*self.folders.get_children())
        for fid, path in self.folder_rows():
            mark = "☐" if path in self.unchecked else "☑"
            self.folders.insert("", "end", iid=str(fid), text=mark, values=(path,))
        n_files, n_err = self.con.execute(
            "SELECT COUNT(*), COUNT(error) FROM files").fetchone()
        self.stats.configure(text=f"{n_files:,} קבצים במאגר" +
                             (f"\n{n_err:,} לא נקראו" if n_err else ""))

    def on_folder_click(self, event):
        iid = self.folders.identify_row(event.y)
        if not iid:
            return
        path = self.folders.set(iid, "path")
        if path in self.unchecked:
            self.unchecked.discard(path)
        else:
            self.unchecked.add(path)
        self.folders.item(iid, text="☐" if path in self.unchecked else "☑")

    def checked_folder_ids(self):
        return {fid for fid, path in self.folder_rows() if path not in self.unchecked}

    def add_folder(self):
        path = filedialog.askdirectory(title="בחר תיקייה להוספה למאגר")
        if not path:
            return
        Indexer.add_folder(self.con, path)
        self.refresh_folders()
        self.update_index()

    def selected_folder(self):
        sel = self.folders.selection()
        if not sel:
            messagebox.showinfo(APP_NAME, "בחרו קודם תיקייה מהרשימה.")
            return None
        return int(sel[0]), self.folders.set(sel[0], "path")

    def remove_folder(self):
        if self.busy():
            return
        f = self.selected_folder()
        if f and messagebox.askyesno(APP_NAME, f"להסיר את התיקייה מהמאגר?\n{f[1]}\n\n(הקבצים עצמם לא יימחקו)"):
            Indexer.remove_folder(self.con, f[0])
            self.unchecked.discard(f[1])
            self.refresh_folders()

    def rebuild_folder(self):
        if self.busy():
            return
        f = self.selected_folder()
        if f and messagebox.askyesno(APP_NAME, f"לקרוא מחדש את כל הקבצים בתיקייה?\n{f[1]}"):
            self.con.execute("UPDATE files SET mtime=-1 WHERE folder_id=?", (f[0],))
            self.con.commit()
            self.update_index([f[0]])

    # ---------------- indexing
    def busy(self):
        if self.index_thread and self.index_thread.is_alive():
            messagebox.showinfo(APP_NAME, "המאגר מתעדכן כרגע. המתינו לסיום או עצרו את העדכון.")
            return True
        return False

    def update_index(self, folder_ids=None):
        if self.index_thread and self.index_thread.is_alive():
            return
        self.cancel_event.clear()
        self.progress.pack(side="left", padx=4)
        self.cancel_btn.pack(side="left")
        self.progress.configure(value=0, maximum=1)

        def progress(**kw):
            self.msgs.put(("progress", kw))

        def work():
            try:
                res = Indexer(self.db_path, progress, self.cancel_event).run(folder_ids)
                self.msgs.put(("done", res))
            except Exception as e:  # noqa: BLE001 - show any failure to the user
                self.msgs.put(("error", str(e)))

        self.index_thread = threading.Thread(target=work, daemon=True)
        self.index_thread.start()

    def cancel_index(self):
        self.cancel_event.set()
        self.status.configure(text="עוצר…")

    def poll(self):
        last_progress = None
        try:
            while True:
                kind, data = self.msgs.get_nowait()
                if kind == "progress":
                    last_progress = data
                elif kind == "done":
                    self.progress.pack_forget()
                    self.cancel_btn.pack_forget()
                    self.refresh_folders()
                    if data.get("cancelled"):
                        msg = "העדכון נעצר."
                    else:
                        msg = (f"המאגר עודכן: {data.get('indexed', 0):,} קבצים נקראו"
                               f", {data.get('removed', 0):,} הוסרו")
                        if data.get("errors"):
                            msg += f", {data['errors']:,} לא נקראו"
                    self.status.configure(text=msg)
                elif kind == "error":
                    self.progress.pack_forget()
                    self.cancel_btn.pack_forget()
                    messagebox.showerror(APP_NAME, f"שגיאה בעדכון המאגר:\n{data}")
                elif kind == "search":
                    self.show_results(*data)
        except queue.Empty:
            pass
        if last_progress:
            kw = last_progress
            if kw.get("phase") == "scan":
                self.progress.configure(mode="indeterminate")
                self.progress.step(5)
                self.status.configure(text=f"סורק תיקיות… {kw.get('found', 0):,} קבצים | {kw.get('path', '')}")
            else:
                self.progress.configure(mode="determinate", maximum=max(1, kw["total"]),
                                        value=kw["done"])
                self.status.configure(
                    text=f"קורא קבצים {kw['done']:,} / {kw['total']:,} | {os.path.basename(kw.get('path', ''))}")
        self.root.after(150, self.poll)

    # ---------------- searching
    def do_search(self):
        text = self.query.get().strip()
        if not text:
            return
        if not self.folder_rows():
            messagebox.showinfo(APP_NAME, "עדיין אין תיקיות במאגר. לחצו על \"הוסף תיקייה…\".")
            return
        try:
            gap = max(0, int(self.gap.get()))
        except (tk.TclError, ValueError):
            gap = 5
        t = self.type_filter.get()
        params = dict(mode=self.mode.get(), gap=gap, ordered=self.ordered.get(),
                      strip_prefixes=self.prefixes.get(),
                      folder_ids=self.checked_folder_ids(),
                      exts=TYPE_GROUPS.get(t), name_filter=self.name_filter.get().strip())
        self.search_seq += 1
        seq = self.search_seq
        self.status.configure(text="מחפש…")
        self.root.configure(cursor="watch")

        def work():
            t0 = time.time()
            try:
                con = connect(self.db_path)
                try:
                    res = se.run_search(con, text, **params)
                finally:
                    con.close()
                self.msgs.put(("search", (seq, res, None, time.time() - t0)))
            except se.QueryError as e:
                self.msgs.put(("search", (seq, None, str(e), 0)))
            except Exception as e:  # noqa: BLE001
                self.msgs.put(("search", (seq, None, f"שגיאה: {e}", 0)))

        threading.Thread(target=work, daemon=True).start()

    def show_results(self, seq, res, err, elapsed):
        if seq != self.search_seq:
            return
        self.root.configure(cursor="")
        self.tree.delete(*self.tree.get_children())
        self._clear_snip()
        if err:
            self.status.configure(text=err)
            return
        results, query, missing = res
        self.results = results
        self.current_query = query
        if missing:
            self.status.configure(text="המילים האלה לא נמצאו באף קובץ: " + ", ".join(missing))
            return
        for i, r in enumerate(results):
            folder, name = os.path.split(r.path)
            self.tree.insert("", "end", iid=str(i), values=(
                time.strftime("%d/%m/%Y %H:%M", time.localtime(r.mtime)),
                human_size(r.size), len(r.matches), folder, name))
        msg = f"נמצאו {len(results):,} קבצים ({elapsed:.2f} שניות)"
        if len(results) >= se.MAX_RESULTS:
            msg += " – מוצגות התוצאות הראשונות בלבד, כדאי לצמצם את החיפוש"
        self.status.configure(text=msg)
        if results:
            self.tree.selection_set("0")
            self.tree.focus("0")

    def sort_by(self, col):
        if not self.results:
            return
        key = {"name": lambda r: os.path.basename(r.path).lower(),
               "folder": lambda r: r.path.lower(),
               "hits": lambda r: len(r.matches),
               "size": lambda r: r.size,
               "modified": lambda r: r.mtime}[col]
        rev = getattr(self, "_sort_state", None) == (col, False)
        self._sort_state = (col, rev)
        self.results.sort(key=key, reverse=rev)
        self.tree.delete(*self.tree.get_children())
        for i, r in enumerate(self.results):
            folder, name = os.path.split(r.path)
            self.tree.insert("", "end", iid=str(i), values=(
                time.strftime("%d/%m/%Y %H:%M", time.localtime(r.mtime)),
                human_size(r.size), len(r.matches), folder, name))

    def selected_result(self):
        sel = self.tree.selection()
        return self.results[int(sel[0])] if sel else None

    def _clear_snip(self):
        self.snip.configure(state="normal")
        self.snip.delete("1.0", "end")
        self.snip.configure(state="disabled")
        self.snip_title.configure(text="")

    def on_select(self, _event=None):
        r = self.selected_result()
        if not r:
            return
        self._clear_snip()
        self.snip_title.configure(text=r.path)
        text, starts, ends = load_file_text(self.con, r.file_id)
        snippets = se.make_snippets(text, starts, ends, r.matches)
        self.snip.configure(state="normal")
        for n, (s, hls) in enumerate(snippets):
            if n:
                self.snip.insert("end", "• • •\n", "sep")
            s = s.replace("\r", " ").replace("\n", " ").replace("\t", " ")
            pos = 0
            for a, b in sorted(hls):
                if a < pos:
                    continue
                self.snip.insert("end", s[pos:a], "p")
                self.snip.insert("end", s[a:b], ("p", "hit"))
                pos = b
            self.snip.insert("end", s[pos:] + "\n", "p")
        if len(r.matches) >= se.MAX_MATCHES_PER_FILE:
            self.snip.insert("end", "(מוצגות ההתאמות הראשונות בלבד)\n", "sep")
        self.snip.configure(state="disabled")

    def open_selected(self, folder=False):
        r = self.selected_result()
        if r:
            open_path(r.path, select=folder)

    def on_right_click(self, event):
        iid = self.tree.identify_row(event.y)
        if not iid:
            return
        self.tree.selection_set(iid)
        m = tk.Menu(self.root, tearoff=0)
        m.add_command(label="פתח קובץ", command=self.open_selected)
        m.add_command(label="פתח את התיקייה", command=lambda: self.open_selected(True))
        m.add_command(label="העתק נתיב", command=self.copy_path)
        m.tk_popup(event.x_root, event.y_root)

    def copy_path(self):
        r = self.selected_result()
        if r:
            self.root.clipboard_clear()
            self.root.clipboard_append(r.path)

    def show_help(self):
        messagebox.showinfo(f"{APP_NAME} {__version__} – עזרה", HELP_TEXT)

    def on_close(self):
        self.cancel_event.set()
        self._save_settings()
        if self.index_thread and self.index_thread.is_alive():
            self.index_thread.join(timeout=5)
        self.root.destroy()


def main():
    root = tk.Tk()
    App(root)
    root.mainloop()
