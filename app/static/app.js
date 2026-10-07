"use strict";

const $ = (id) => document.getElementById(id);

// ---------- אייקונים (קווי מתאר, בסגנון Lucide) ----------
const ICONS = {
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  wave: '<path d="M2 10v4M6 6v12M10 3v18M14 8v8M18 5v14M22 10v4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  back: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M10 12v5M7 14v1M13 13v3M16 14v1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
};

function icon(name) {
  const s = document.createElement("span");
  s.dataset.icon = name;
  fillIcon(s);
  return s;
}
function fillIcon(elm) {
  elm.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[elm.dataset.icon] || ""}</svg>`;
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

// מעדכן טקסט/מאפיין רק אם השתנה — כך הדפדפן לא מצייר מחדש בלי צורך
function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
function setClass(node, cls) { if (node.className !== cls) node.className = cls; }

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function fmtDuration(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h) return m ? `${h} ש' ${m} ד'` : `${h} ש'`;
  return m ? `${m} דקות` : `${sec} שניות`;
}
function fmtDate(ts) {
  const d = new Date(ts * 1000), now = new Date();
  const time = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `היום, ${time}`;
  return `${d.toLocaleDateString("he-IL", { day: "numeric", month: "short" })}, ${time}`;
}

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

function toast(message, kind = "") {
  const t = el("div", { class: `toast ${kind}` }, icon(kind === "error" ? "alert" : "check"), message);
  $("toasts").append(t);
  setTimeout(() => t.remove(), kind === "error" ? 6000 : 3000);
}

function confirmDialog(title, text, okLabel = "מחיקה") {
  const dlg = $("confirm");
  $("confirm-title").textContent = title;
  $("confirm-text").textContent = text;
  $("confirm-ok").textContent = okLabel;
  if (typeof dlg.showModal !== "function") return Promise.resolve(window.confirm(`${title}\n${text}`));
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok"), { once: true });
    dlg.showModal();
  });
}

// ---------- מצב כללי ----------
const STATUS = {
  new: ["בהכנה", "queued"],
  queued: ["ממתין בתור", "queued"],
  downloading: ["מוריד מהקישור", "running"],
  loading: ["טוען", "running"],
  transcribing: ["מתמלל", "running"],
  diarizing: ["מזהה דוברים", "running"],
  canceling: ["מבטל...", "canceling"],
  done: ["הושלם", "done"],
  error: ["שגיאה", "error"],
};
const ACTIVE = new Set(["new", "queued", "downloading", "loading", "transcribing", "diarizing", "canceling"]);

let serverStatus = { low_confidence: 0.6 };
let current = null; // { job, result, words: [{start,end,el}] }

function pref(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
}
function savePref(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {}
}

// ---------- רכיב בחירה מפולח ----------
function segmented(id, onChange) {
  const root = $(id);
  const set = (value) => {
    for (const b of root.querySelectorAll("button")) b.classList.toggle("active", b.dataset.value === value);
    root.dataset.value = value;
    onChange && onChange(value);
  };
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b && !b.disabled) set(b.dataset.value);
  });
  return { set, get: () => root.dataset.value, button: (v) => root.querySelector(`button[data-value="${v}"]`) };
}

const HINTS = {
  local: "חינם, ללא אינטרנט — רץ על המחשב שלכם",
  cloud: "מהיר — אותו מודל עברי על שרת GPU (בתשלום)",
  accurate: "הכי אמין (מומלץ)",
  fast: "בערך פי 2 מהר יותר, מעט פחות מדויק",
};

let engineCtl, qualityCtl;

function setupControls() {
  qualityCtl = segmented("quality", (v) => { setText($("quality-hint"), HINTS[v]); savePref("quality", v); });
  engineCtl = segmented("engine", (v) => {
    setText($("engine-hint"), HINTS[v]);
    $("quality-field").hidden = v === "cloud"; // מצב "מהיר" רלוונטי רק לתמלול במחשב
    savePref("engine", v);
  });
  qualityCtl.set(pref("quality", "accurate"));
  engineCtl.set("local");
  $("diarize").addEventListener("change", (e) => { $("speakers-row").hidden = !e.target.checked; });
}

async function loadStatus() {
  serverStatus = await api("/api/status");
  const box = $("status");
  box.textContent = "";
  const gpu = serverStatus.device === "cuda";
  box.append(el("span", { class: gpu ? "chip ok" : "chip", title: gpu ? "" : "התמלול במחשב ירוץ על המעבד, ולכן יהיה איטי יותר" },
    icon("cpu"), gpu ? "כרטיס גרפי (GPU)" : "מעבד (CPU)"));
  box.append(el("span", { class: "chip", title: serverStatus.model }, icon("wave"), "ivrit.ai"));

  if (serverStatus.cloud_configured) {
    const saved = pref("engine", "local");
    engineCtl.set(saved === "cloud" ? "cloud" : "local");
  } else {
    const b = engineCtl.button("cloud");
    b.disabled = true;
    b.title = "תמלול בענן לא הוגדר — ראו README";
  }

  if (!serverStatus.diarization_installed) {
    $("diarize").disabled = true;
    setText($("diarize-hint"), "לא מותקן — ראו README");
  } else {
    setText($("diarize-hint"), serverStatus.hf_token ? "מי אמר מה" : "בפעם הראשונה נדרש HF_TOKEN");
  }
}

// ---------- טופס ----------
function setupForm() {
  const drop = $("drop"), file = $("file");
  const showFile = () => {
    const f = file.files[0];
    setText($("drop-title"), f ? f.name : "גררו קובץ לכאן");
    setText($("drop-sub"), f ? `${(f.size / 1048576).toFixed(1)} MB · לחצו להחלפה` : "או לחצו לבחירה · שמע או וידאו");
    drop.classList.toggle("has-file", !!f);
    if (f) $("url").value = "";
  };
  file.addEventListener("change", showFile);
  $("url").addEventListener("input", () => { if ($("url").value && file.value) { file.value = ""; showFile(); } });
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.add("over");
  }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.remove("over");
  }));
  drop.addEventListener("drop", (e) => {
    if (e.dataTransfer.files.length) { file.files = e.dataTransfer.files; showFile(); }
  });

  $("new-job").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = file.files[0], url = $("url").value.trim();
    const err = $("form-error");
    err.hidden = true;
    if (!f && !url) { err.textContent = "בחרו קובץ או הדביקו קישור"; err.hidden = false; return; }

    const fd = new FormData();
    if (f) fd.append("file", f); else fd.append("url", url);
    fd.append("diarize", $("diarize").checked);
    fd.append("num_speakers", $("num-speakers").value || "0");
    fd.append("quality", qualityCtl.get());
    fd.append("engine", engineCtl.get());

    // XHR כדי להציג התקדמות העלאה של קבצים גדולים
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/jobs");
    const up = $("upload");
    up.hidden = !f;
    $("upload-bar").style.width = "0%";
    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      const pct = Math.round((ev.loaded / ev.total) * 100);
      $("upload-bar").style.width = `${pct}%`;
      setText($("upload-text"), pct < 100 ? `מעלה... ${pct}%` : "מעבד את הקובץ...");
    };
    const done = () => { $("submit").disabled = false; up.hidden = true; };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) {
        file.value = ""; $("url").value = ""; showFile();
        toast("התמלול נוסף לתור");
        refreshJobs();
      } else {
        let msg = xhr.statusText;
        try { msg = JSON.parse(xhr.responseText).detail || msg; } catch (_) {}
        err.textContent = msg; err.hidden = false;
      }
    };
    xhr.onerror = () => { done(); err.textContent = "שגיאת תקשורת עם התוכנה"; err.hidden = false; };
    $("submit").disabled = true;
    xhr.send(fd);
  });
}

// ---------- רשימת תמלולים ----------
// כל שורה נבנית פעם אחת ומתעדכנת במקום, כדי שהרשימה לא "תקפוץ" בכל ריענון.
const rows = new Map(); // jobId -> {root, refs, live: {count, box}}
let jobsCache = [];
let refreshing = false, refreshAgain = false, pollTimer = null;

function createRow(job) {
  const refs = {};
  refs.icon = icon("file");
  refs.icon.classList.add("job-icon");
  refs.title = el("div", { class: "job-title" });
  refs.pill = el("span", { class: "pill" }, el("span", { class: "dot" }), el("span"));
  refs.meta = el("div", { class: "job-meta" });
  refs.metaText = el("span");
  refs.meta.append(refs.pill, refs.metaText);
  refs.error = el("div", { class: "job-error" });
  refs.bar = el("div");
  refs.progress = el("div", { class: "progress" }, refs.bar);
  refs.live = el("div", { class: "live" });
  refs.main = el("div", { class: "job-main" }, refs.title, refs.meta, refs.error, refs.progress, refs.live);

  refs.pause = el("button", { class: "btn btn-ghost icon-btn", title: "השהיה" }, icon("pause"));
  refs.pause.addEventListener("click", (e) => { e.stopPropagation(); togglePause(refs.job); });
  refs.del = el("button", { class: "btn btn-ghost icon-btn danger", title: "מחיקה" }, icon("trash"));
  refs.del.addEventListener("click", (e) => { e.stopPropagation(); deleteJob(refs.job); });
  refs.actions = el("div", { class: "job-actions" }, refs.pause, refs.del);

  const root = el("li", { class: "job" }, refs.icon, refs.main, refs.actions);
  root.addEventListener("click", () => { if (refs.job.status === "done") location.hash = `#/job/${refs.job.id}`; });
  return { root, refs, live: { count: 0 } };
}

function updateRow(row, job) {
  const { refs } = row;
  refs.job = job;
  const [label, kind0] = STATUS[job.status] || [job.status, "queued"];
  const paused = job.status === "transcribing" && job.paused;
  const kind = paused ? "paused" : kind0;
  const isLocal = !(job.options && job.options.engine === "cloud");

  setClass(row.root, `job is-${job.status}${job.status === "done" ? " clickable" : ""}`);
  setText(refs.title, job.title);
  setClass(refs.pill, `pill ${kind}`);
  setText(refs.pill.lastChild, paused ? "מושהה" : label);

  const parts = [fmtDate(job.created)];
  if (job.duration) parts.push(fmtDuration(job.duration));
  if (!isLocal) parts.push("בענן");
  if (job.status === "transcribing") {
    parts.push(`${Math.round(job.progress * 100)}%`);
    // הערכת זמן לפי הקצב עד כה (שרת ודפדפן על אותו מחשב — אותו שעון)
    const elapsed = Date.now() / 1000 - (job.stage_started || 0);
    if (!paused && job.stage_started && job.progress > 0.03 && elapsed > 20) {
      parts.push(`נותרו כ-${fmtTime(elapsed * (1 - job.progress) / job.progress)}`);
    }
  }
  setText(refs.metaText, parts.join(" · "));

  refs.error.hidden = !job.error;
  if (job.error) setText(refs.error, job.error);

  const active = ACTIVE.has(job.status);
  refs.progress.hidden = !active || ["canceling", "queued", "new"].includes(job.status);
  const determinate = job.status === "transcribing";
  setClass(refs.progress, determinate ? "progress" : "progress indeterminate");
  const width = determinate ? `${Math.max(2, job.progress * 100)}%` : "";
  if (refs.bar.style.width !== width) refs.bar.style.width = width;

  const canPause = job.status === "transcribing" && isLocal;
  refs.pause.hidden = !canPause;
  if (canPause) {
    const want = paused ? "play" : "pause";
    if (refs.pause.firstChild.dataset.icon !== want) refs.pause.replaceChildren(icon(want));
    refs.pause.title = paused ? "המשך" : "השהיה";
    refs.pause.disabled = false;
  }
  refs.del.disabled = job.status === "canceling";
  refs.del.title = active ? "ביטול ומחיקה" : "מחיקה";

  refs.live.hidden = !canPause;
  if (!canPause && row.live.count) { refs.live.textContent = ""; row.live.count = 0; }
}

async function updateLive(row, job) {
  const box = row.refs.live;
  try {
    const segs = await api(`/api/jobs/${job.id}/live?since=${row.live.count}`);
    if (!segs.length) {
      if (!row.live.count && !box.firstChild) box.append(el("div", { class: "live-wait" }, "הטקסט יופיע כאן כשהקטע הראשון יתומלל..."));
      return;
    }
    if (!row.live.count) box.textContent = "";
    // גוללים למטה רק אם המשתמש כבר היה בתחתית
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
    for (const s of segs) {
      box.append(el("div", { class: "live-line" }, el("time", {}, fmtTime(s.start)), el("span", {}, s.text)));
    }
    row.live.count += segs.length;
    if (atBottom) box.scrollTop = box.scrollHeight;
  } catch (_) {}
}

function renderJobs() {
  const q = $("search").value.trim().toLowerCase();
  const list = q ? jobsCache.filter((j) => j.title.toLowerCase().includes(q)) : jobsCache;
  const ul = $("jobs");
  const seen = new Set();
  let prev = null;
  for (const job of list) {
    seen.add(job.id);
    let row = rows.get(job.id);
    if (!row) { row = createRow(job); rows.set(job.id, row); }
    updateRow(row, job);
    // מזיזים את השורה רק אם היא לא במקום הנכון
    const want = prev ? prev.nextSibling : ul.firstChild;
    if (want !== row.root) ul.insertBefore(row.root, want);
    prev = row.root;
  }
  for (const [id, row] of rows) {
    if (!seen.has(id)) { row.root.remove(); if (!jobsCache.some((j) => j.id === id)) rows.delete(id); }
  }
  $("empty").hidden = jobsCache.length > 0;
  setText($("count"), jobsCache.length ? `(${jobsCache.length})` : "");
}

async function refreshJobs() {
  // לא מריצים שני ריענונים במקביל — זה מה שגרם לשורות כפולות ולריצוד
  if (refreshing) { refreshAgain = true; return; }
  refreshing = true;
  clearTimeout(pollTimer);
  try {
    jobsCache = await api("/api/jobs");
    renderJobs();
    await Promise.all(jobsCache
      .filter((j) => j.status === "transcribing" && !(j.options && j.options.engine === "cloud"))
      .map((j) => rows.get(j.id) && updateLive(rows.get(j.id), j)));
  } catch (_) {
    // השרת אולי עוד עולה — ננסה שוב
  } finally {
    refreshing = false;
    const active = jobsCache.some((j) => ACTIVE.has(j.status));
    if (refreshAgain) { refreshAgain = false; refreshJobs(); }
    else if (!current) pollTimer = setTimeout(refreshJobs, active ? 1500 : 10000);
  }
}

async function togglePause(job) {
  const action = job.paused ? "resume" : "pause";
  const row = rows.get(job.id);
  if (row) row.refs.pause.disabled = true;
  try {
    await api(`/api/jobs/${job.id}/${action}`, { method: "POST" });
    if (action === "pause") toast("התמלול יושהה בסוף הקטע הנוכחי");
  } catch (err) { toast(err.message, "error"); }
  refreshJobs();
}

async function deleteJob(job) {
  const active = ACTIVE.has(job.status) && job.status !== "queued";
  const ok = await confirmDialog(
    active ? "לבטל ולמחוק?" : "למחוק את התמלול?",
    active ? `העיבוד של "${job.title}" ייעצר והקבצים יימחקו.` : `"${job.title}" יימחק לצמיתות, כולל קובץ השמע.`,
    active ? "ביטול ומחיקה" : "מחיקה",
  );
  if (!ok) return;
  try {
    const r = await api(`/api/jobs/${job.id}`, { method: "DELETE" });
    toast(r.state === "canceling" ? "מבטל... העבודה תימחק בעוד רגע" : "נמחק");
  } catch (err) { toast(err.message, "error"); }
  refreshJobs();
}

// ---------- צפייה ועריכה ----------
const SPEAKER_COLORS = ["#4f46e5", "#0891b2", "#c026d3", "#ea580c", "#16a34a", "#dc2626", "#ca8a04", "#7c3aed"];
function speakerColor(id) {
  const ids = Object.keys(current.result.speakers || {});
  return SPEAKER_COLORS[Math.max(0, ids.indexOf(id)) % SPEAKER_COLORS.length];
}

async function saveEdits(body) {
  try {
    current.result = await api(`/api/jobs/${current.job.id}/result`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) { toast(err.message, "error"); }
}

function renderSpeakers() {
  const box = $("speakers");
  box.textContent = "";
  const speakers = current.result.speakers || {};
  for (const [id, name] of Object.entries(speakers)) {
    const input = el("input", { value: name, title: "שינוי שם הדובר" });
    input.addEventListener("change", async () => {
      speakers[id] = input.value.trim() || name;
      await saveEdits({ speakers });
      renderTranscript();
    });
    box.append(el("label", { class: "speaker-chip" }, el("span", { class: "sw", style: `background:${speakerColor(id)}` }), input));
  }
}

function playAt(t) {
  const p = $("player");
  p.currentTime = t;
  p.play().catch(() => {});
}

function renderTranscript() {
  const box = $("transcript");
  box.textContent = "";
  current.words = [];
  const { segments, speakers = {} } = current.result;
  const threshold = serverStatus.low_confidence;
  const hasSpeakers = Object.keys(speakers).length > 0;

  if (!segments.length) {
    box.append(el("div", { class: "empty" }, icon("wave"), el("div", {}, "לא זוהה דיבור בהקלטה")));
    return;
  }

  const frag = document.createDocumentFragment();
  segments.forEach((seg, i) => {
    const side = el("div", { class: "seg-side" },
      el("span", { class: "ts", title: "השמעה מכאן", onclick: () => playAt(seg.start) }, fmtTime(seg.start)));
    const body = el("div");

    if (hasSpeakers || seg.edited) {
      const head = el("div", { class: "seg-speaker" });
      if (hasSpeakers) {
        const sel = el("select", { title: "שיוך לדובר", style: `color:${speakerColor(seg.speaker)}` });
        for (const [id, name] of Object.entries(speakers)) {
          const opt = el("option", { value: id }, name);
          if (id === seg.speaker) opt.selected = true;
          sel.append(opt);
        }
        sel.addEventListener("change", async () => {
          await saveEdits({ edits: [{ i, speaker: sel.value }] });
          sel.style.color = speakerColor(sel.value);
        });
        head.append(sel);
      }
      if (seg.edited) head.append(el("span", { class: "edited-tag" }, "נערך ידנית"));
      body.append(head);
    }

    const text = el("div", { class: "text", title: "לחיצה כפולה לעריכה" });
    if (seg.edited || !seg.words.length) {
      text.textContent = seg.text;
    } else {
      for (const w of seg.words) {
        const known = typeof w.p === "number";
        const span = el("span", { class: known && w.p < threshold ? "w low" : "w" }, w.word);
        if (known) span.title = `ביטחון: ${Math.round(w.p * 100)}%`;
        span.addEventListener("click", () => playAt(w.start));
        text.append(span);
        current.words.push({ start: w.start, end: w.end, el: span });
      }
    }

    text.addEventListener("dblclick", () => {
      if (text.isContentEditable) return;
      text.textContent = seg.text;
      text.contentEditable = "true";
      text.focus();
      let cancelled = false;
      text.addEventListener("blur", async () => {
        text.contentEditable = "false";
        if (!cancelled && text.textContent.trim() !== seg.text) {
          await saveEdits({ edits: [{ i, text: text.textContent }] });
          toast("נשמר");
        }
        renderTranscript();
      }, { once: true });
      text.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); text.blur(); }
        if (e.key === "Escape") { cancelled = true; text.blur(); }
      });
    });

    body.append(text);
    frag.append(el("div", { class: "seg" }, side, body));
  });
  box.append(frag);
}

let lastWord = null;
function onTimeUpdate() {
  if (!current) return;
  const t = $("player").currentTime, words = current.words;
  let lo = 0, hi = words.length - 1, found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].end < t) lo = mid + 1;
    else if (words[mid].start > t) hi = mid - 1;
    else { found = words[mid]; break; }
  }
  if (found === lastWord) return;
  if (lastWord) lastWord.el.classList.remove("current");
  lastWord = found;
  if (!found) return;
  found.el.classList.add("current");
  // גוללים רק כשהמילה יוצאת מהאזור הנוח לקריאה — לא בכל מילה (זה גרם ל"רעידות")
  if ($("follow").checked && !$("player").paused) {
    const r = found.el.getBoundingClientRect();
    const top = 260, bottom = window.innerHeight - 80;
    if (r.top < top || r.bottom > bottom) {
      window.scrollBy({ top: r.top - (top + (bottom - top) / 3), behavior: "smooth" });
    }
  }
}

async function openJob(id) {
  const job = await api(`/api/jobs/${id}`);
  const result = await api(`/api/jobs/${id}/result`);
  current = { job, result, words: [] };
  lastWord = null;
  $("v-title").textContent = job.title;
  const meta = [fmtDate(job.created)];
  if (result.duration) meta.push(fmtDuration(result.duration));
  const nSpk = Object.keys(result.speakers || {}).length;
  if (nSpk) meta.push(`${nSpk} דוברים`);
  $("v-meta").textContent = meta.join(" · ");
  $("player").src = `/api/jobs/${id}/audio`;
  for (const fmt of ["docx", "txt", "srt"]) $(`exp-${fmt}`).href = `/api/jobs/${id}/export/${fmt}`;
  renderSpeakers();
  renderTranscript();
  window.scrollTo(0, 0);
}

async function route() {
  const m = location.hash.match(/^#\/job\/(.+)$/);
  $("home").hidden = !!m;
  $("viewer").hidden = !m;
  if (m) {
    clearTimeout(pollTimer);
    try { await openJob(m[1]); }
    catch (err) { toast(err.message, "error"); location.hash = ""; }
  } else {
    current = null;
    $("player").pause();
    $("player").removeAttribute("src");
    refreshJobs();
  }
}

// ---------- אתחול ----------
document.querySelectorAll("[data-icon]").forEach(fillIcon);
$("back").addEventListener("click", () => { location.hash = ""; });
$("show-low").addEventListener("change", (e) => $("transcript").classList.toggle("show-low", e.target.checked));
$("player").addEventListener("timeupdate", onTimeUpdate);
$("search").addEventListener("input", renderJobs);
window.addEventListener("hashchange", route);
document.addEventListener("keydown", (e) => {
  // רווח = נגן/עצור במסך התמלול (כשלא מקלידים)
  if (e.code === "Space" && current && !e.target.closest("input, select, [contenteditable=true], button")) {
    e.preventDefault();
    const p = $("player");
    p.paused ? p.play().catch(() => {}) : p.pause();
  }
});

setupControls();
setupForm();
loadStatus().catch(() => {});
route();
