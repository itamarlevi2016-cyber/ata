(() => {
"use strict";
const $ = s => document.querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const api = async (url, opt) => {
  const r = await fetch(url, opt);
  if (!r.ok) { let m = r.statusText; try { m = (await r.json()).detail || m; } catch (e) {} throw new Error(m); }
  return r.json();
};
const post = (url, body) => api(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });

let bookId = null, book = null, segs = [], selSeg = null, job = null, timer = null, viewPage = null;

/* ---- tabs ---- */
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(x => x.setAttribute("aria-selected", x === t ? "true" : "false"));
  document.querySelectorAll(".panel").forEach(p => p.hidden = p.id !== "tab-" + t.dataset.tab);
  if (t.dataset.tab === "names") loadNames();
  if (t.dataset.tab === "log") loadLog();
  if (t.dataset.tab === "settings") loadSettings();
  if (t.dataset.tab === "report" && !$("#rFrom").value && selSeg) { $("#rFrom").value = selSeg.start; $("#rTo").value = selSeg.end; }
}));

/* ---- status banner ---- */
async function loadStatus() {
  const s = await api("/api/status");
  const miss = [];
  if (!s.has_credentials) miss.push("לא הוגדר מפתח API (ANTHROPIC_API_KEY). אפשר לראות את הממשק, אבל לא לתרגם.");
  for (const [k, v] of Object.entries(s.materials)) if (!v) miss.push(`חסר בתיקיית materials: ${k}`);
  const b = $("#banner");
  b.hidden = !miss.length && !s.mock;
  b.textContent = "";
  if (s.mock) b.appendChild(el("div", null, "מצב בדיקה (mock): המודל מדומה, התרגום אינו אמיתי."));
  if (miss.length) { const ul = el("ul"); miss.forEach(m => ul.appendChild(el("li", null, m))); b.appendChild(ul); }
}

/* ---- books ---- */
async function loadBooks(selectId) {
  const list = await api("/api/books");
  const sel = $("#bookSel"); sel.textContent = "";
  if (!list.length) sel.appendChild(new Option("אין ספר. העלו PDF", ""));
  list.forEach(b => sel.appendChild(new Option(`${b.name} (${b.n_pages} עמ')`, b.id)));
  const want = selectId || localStorage.getItem("godol:book") || (list[0] && list[0].id) || "";
  if (list.some(b => b.id === want)) sel.value = want;
  await pickBook(sel.value);
}
async function pickBook(id) {
  bookId = id || null; book = null;
  if (id) { try { book = await api("/api/books/" + id); localStorage.setItem("godol:book", id); } catch (e) { bookId = null; } }
  $("#bookInfo").textContent = book ? `${book.done_pages.length} מתוך ${book.n_pages} עמודים מתורגמים` : "";
  $("#go").disabled = $("#build").disabled = !book;
  renderGrid(); loadFiles(); loadNames(true);
}
$("#bookSel").addEventListener("change", e => pickBook(e.target.value));
$("#pdfFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const fd = new FormData(); fd.append("file", f);
  $("#bookInfo").textContent = "מעלה…";
  try { const r = await api("/api/books", { method: "POST", body: fd }); await loadBooks(r.id); }
  catch (err) { $("#bookInfo").textContent = "ההעלאה נכשלה: " + err.message; }
});

/* ---- segments ---- */
async function loadSegs() {
  const m = await api("/api/mapping"); segs = m.segments;
  $("#mapSource").textContent = segs.length ? "מקור: " + m.source : "לא נמצא מיפוי. הוסיפו את מיפוי הספר.md ל-materials, או הזינו טווח ידנית.";
  const box = $("#segList"); box.textContent = "";
  segs.forEach(s => {
    const b = el("button", "seg"); b.type = "button"; b.setAttribute("role", "option"); b.setAttribute("aria-selected", "false");
    b.append(el("span", "n", s.n), el("span", null, `${s.title}  ·  עמ' ${s.start}–${s.end}`));
    const st = el("span", "pill " + (s.status === "done_outside" ? "done" : s.status === "partial" ? "partial" : ""), s.status === "done_outside" ? "הושלם" : s.status === "partial" ? "חלקי" : "טרם");
    b.append(st);
    b.onclick = () => { selSeg = s; $("#from").value = s.start; $("#to").value = s.end; box.querySelectorAll(".seg").forEach(x => x.setAttribute("aria-selected", x === b ? "true" : "false")); renderGrid(); };
    box.appendChild(b);
  });
  const nx = segs.find(s => s.status === "todo" || s.status === "partial");
  if (nx) box.children[segs.indexOf(nx)].click();
}
const range = () => ({ start: +$("#from").value, end: +$("#to").value });

/* ---- jobs ---- */
function setJobUi(j) {
  job = j;
  const running = j && j.status === "running";
  $("#stop").hidden = !running; $("#go").disabled = running || !book; $("#build").disabled = running || !book;
  const names = { running: "רץ", done: "הסתיים", failed: "נכשל", stopped: "נעצר" };
  $("#jobStatus").textContent = j ? `${names[j.status] || j.status} · עמ' ${j.start}–${j.end}` : "אין עבודה פעילה";
  const err = $("#jobErr"); err.hidden = !(j && j.error); err.textContent = j && j.error || "";
  const ul = $("#events"); ul.textContent = "";
  (j ? j.events.slice(-12).reverse() : []).forEach(e => { if (e.message || e.type) ul.appendChild(el("li", null, (e.page ? `עמ' ${e.page}: ` : e.pages ? `עמ' ${e.pages.join(",")}: ` : "") + (e.message || e.type))); });
  renderGrid();
}
function renderGrid() {
  const g = $("#pageGrid"); g.textContent = "";
  let a, b;
  if (job && (job.status === "running" || job.pages)) { a = job.start; b = job.end; } else { const r = range(); a = r.start; b = r.end; }
  if (!(a >= 1 && b >= a)) return;
  const done = new Set(book ? book.done_pages : []);
  for (let n = a; n <= b && n < a + 400; n++) {
    const p = job && job.pages && job.pages[n];
    const s = p ? p.state : done.has(n) ? "done" : "pending";
    const c = el("button", "pg", n); c.type = "button"; c.dataset.s = s === "pending" ? "" : s; c.title = p && p.message || ""; c.onclick = () => openPage(n);
    g.appendChild(c);
  }
}
async function poll() {
  if (!job) return;
  try { const j = await api("/api/jobs/" + job.id); setJobUi(j); if (j.status !== "running") { stopPoll(); await pickBook(bookId); if (j.report) showReport(j.report); } }
  catch (e) { stopPoll(); }
}
function startPoll() { stopPoll(); timer = setInterval(poll, 1500); }
function stopPoll() { if (timer) clearInterval(timer); timer = null; }
async function launch(kind, extra) {
  if (!book) return;
  const r = range();
  const body = { start: r.start, end: r.end, verify: $("#verify").checked, ...(extra || {}) };
  if (selSeg && selSeg.start === r.start && selSeg.end === r.end) { body.seg_start = selSeg.start; body.seg_end = selSeg.end; body.chapter = selSeg.chapter; }
  try { const j = await post(`/api/books/${bookId}/${kind}`, body); setJobUi(j); startPoll(); }
  catch (e) { $("#jobErr").hidden = false; $("#jobErr").textContent = e.message; }
}
$("#go").onclick = () => launch("translate");
$("#build").onclick = () => launch("build");
$("#stop").onclick = () => job && post(`/api/jobs/${job.id}/stop`);
["#from", "#to"].forEach(s => $(s).addEventListener("input", renderGrid));

/* ---- a single page ---- */
async function openPage(n) {
  viewPage = n; $("#viewer").hidden = false; $("#viewerTitle").textContent = "עמוד " + n;
  $("#pageImg").src = `/api/books/${bookId}/pages/${n}/image?dpi=110`;
  try { const p = await api(`/api/books/${bookId}/pages/${n}`); $("#pageHe").textContent = p.hebrew; $("#redo").disabled = false; }
  catch (e) { $("#pageHe").textContent = "העמוד עוד לא תורגם."; $("#redo").disabled = true; }
  $("#viewer").scrollIntoView({ block: "nearest" });
}
$("#closeViewer").onclick = () => $("#viewer").hidden = true;
$("#redo").onclick = async () => {
  if (!viewPage) return;
  const extra = selSeg && viewPage >= selSeg.start && viewPage <= selSeg.end ? { seg_start: selSeg.start, seg_end: selSeg.end, chapter: selSeg.chapter } : {};
  try { const j = await post(`/api/books/${bookId}/redo`, { start: viewPage, end: viewPage, verify: $("#verify").checked, ...extra }); setJobUi(j); startPoll(); }
  catch (e) { $("#jobErr").hidden = false; $("#jobErr").textContent = e.message; }
};

/* ---- files ---- */
async function loadFiles() {
  const ul = $("#fileList"); ul.textContent = "";
  if (!bookId) return;
  const fs = await api(`/api/books/${bookId}/files`);
  if (!fs.length) ul.appendChild(el("li", "hint", "עוד אין קבצים."));
  fs.forEach(f => { const li = el("li"); const a = el("a", null, f.name); a.href = `/api/books/${bookId}/files/${encodeURIComponent(f.name)}`; li.appendChild(a); ul.appendChild(li); });
}

/* ---- report ---- */
function showReport(r) {
  $("#rFrom").value = r.start; $("#rTo").value = r.end;
  const box = $("#reportBody"); box.textContent = "";
  box.appendChild(el("div", "verdict " + (r.summary.ready ? "ready" : "no"), `${r.segment}: ${r.summary.label}`));
  r.checks.forEach(c => {
    const d = el("details", "check"); d.dataset.s = c.status; if (c.status === "fail") d.open = true;
    const s = el("summary"); s.append(el("span", "st", { pass: "עבר", warn: "הערות", fail: "נכשל", pending: "ממתין" }[c.status]), el("span", null, `${c.id}. ${c.name}`));
    d.appendChild(s);
    if (c.details && c.details.length) { const ul = el("ul"); c.details.slice(0, 80).forEach(x => ul.appendChild(el("li", null, x))); d.appendChild(ul); }
    box.appendChild(d);
  });
  loadFiles();
}
$("#loadReport").onclick = async () => {
  try { showReport(await api(`/api/books/${bookId}/report/${$("#rFrom").value}/${$("#rTo").value}`)); }
  catch (e) { $("#reportBody").textContent = e.message; }
};

/* ---- names ---- */
async function loadNames(badgeOnly) {
  if (!bookId) return;
  const items = await api(`/api/books/${bookId}/names`);
  $("#namesBadge").textContent = items.length || "";
  if (badgeOnly) return;
  const box = $("#namesBody"); box.textContent = "";
  if (!items.length) { box.appendChild(el("p", "hint", "אין שמות שממתינים לאישור.")); return; }
  const t = el("table", "names"); const h = el("tr"); ["", "באנגלית", "בעברית", "עמודים"].forEach(x => h.appendChild(el("th", null, x))); t.appendChild(h);
  items.forEach(i => {
    const tr = el("tr"); const c = el("input"); c.type = "checkbox"; c.checked = true; c.dataset.en = i.en; c.setAttribute("aria-label", i.en);
    const td0 = el("td"); td0.appendChild(c); tr.appendChild(td0);
    const a = el("td"); const bdi = el("bdi", null, i.en); a.appendChild(bdi);
    tr.append(a, el("td", null, i.he), el("td", null, i.pages)); t.appendChild(tr);
  });
  box.appendChild(t);
  const row = el("div", "row gap");
  const pick = () => [...box.querySelectorAll("input[type=checkbox]:checked")].map(x => x.dataset.en);
  const ok = el("button", "btn primary", "אישור המסומנים"); ok.onclick = async () => { await post(`/api/books/${bookId}/names/approve`, { names: pick() }); loadNames(); };
  const no = el("button", "btn", "דחייה"); no.onclick = async () => { await post(`/api/books/${bookId}/names/reject`, { names: pick() }); loadNames(); };
  row.append(ok, no); box.appendChild(row);
}

/* ---- settings and spend ---- */
const usd = x => "$" + (x || 0).toFixed(2);
async function loadSettings() {
  const [st, cost, status] = await Promise.all([api("/api/settings"), api("/api/cost"), api("/api/status")]);
  const m = $("#setModel"); m.textContent = ""; Object.entries(st.models).forEach(([k, v]) => m.appendChild(new Option(v, k))); m.value = st.model;
  const e = $("#setEffort"); e.textContent = ""; st.efforts.forEach(x => e.appendChild(new Option({ low: "נמוך (זול)", medium: "בינוני", high: "גבוה (ברירת מחדל)" }[x], x))); e.value = st.effort;
  $("#setVerify").checked = st.verify; $("#setBudget").value = st.budget_usd || 0;
  $("#keyState").textContent = status.has_credentials ? "מפתח API מוגדר בשרת." : "לא הוגדר מפתח API. הגדירו ANTHROPIC_API_KEY לפני הפעלת השרת.";
  const box = $("#costBody"); box.textContent = "";
  const dl = el("dl", "cost");
  const row = (k, v) => { dl.appendChild(el("dt", null, k)); dl.appendChild(el("dd", null, v)); };
  row("הוצאה מוערכת עד כה", usd(cost.spent));
  Object.entries(cost.by_kind).forEach(([k, v]) => row({ translate: "תרגום", verify: "בודק עצמאי" }[k] || k, usd(v)));
  row("עמודים שתורגמו", String(cost.pages));
  row("ממוצע לעמוד", cost.avg_per_page ? usd(cost.avg_per_page) : "עוד אין נתון");
  if (cost.budget) row("נשאר בתקציב", usd(cost.remaining));
  box.appendChild(dl);
  if (cost.budget) { const mt = el("div", "meter" + (cost.spent >= cost.budget ? " over" : "")); const i = el("i"); i.style.width = Math.min(100, cost.spent / cost.budget * 100) + "%"; mt.appendChild(i); box.appendChild(mt); }
  if (cost.avg_per_page && cost.budget) box.appendChild(el("p", "hint", `בקצב הזה היתרה מספיקה לעוד כ-${Math.max(0, Math.floor(cost.remaining / cost.avg_per_page))} עמודים.`));
  $("#verify").checked = st.verify;
}
$("#saveSettings").onclick = async () => {
  try {
    await post("/api/settings", { model: $("#setModel").value, effort: $("#setEffort").value, verify: $("#setVerify").checked, budget_usd: +$("#setBudget").value || 0 });
    $("#settingsMsg").textContent = "נשמר. ההגדרות חלות על הריצה הבאה."; loadSettings();
  } catch (e) { $("#settingsMsg").textContent = "השמירה נכשלה: " + e.message; }
};

/* ---- journal ---- */
async function loadLog() { $("#logText").textContent = (await api("/api/journal")).text || "היומן ריק."; }

/* ---- boot ---- */
(async () => {
  try { await loadStatus(); await loadSegs(); await loadBooks();
    api("/api/settings").then(st => { $("#verify").checked = st.verify; }).catch(() => {});
    if (bookId) { const j = await api(`/api/books/${bookId}/jobs/latest`).catch(() => null); if (j) { setJobUi(j); if (j.status === "running") startPoll(); } }
  } catch (e) { $("#banner").hidden = false; $("#banner").textContent = "שגיאה בטעינה: " + e.message; }
})();
})();
