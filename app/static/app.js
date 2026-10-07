"use strict";

const $ = (id) => document.getElementById(id);
const STATUS_LABELS = {
  new: "בהכנה",
  queued: "ממתין בתור",
  downloading: "מוריד מהקישור",
  loading: "טוען שמע ומודל",
  transcribing: "מתמלל",
  diarizing: "מזהה דוברים",
  done: "הושלם",
  error: "שגיאה",
};
const ACTIVE = new Set(["new", "queued", "downloading", "loading", "transcribing", "diarizing"]);

let serverStatus = { low_confidence: 0.6 };
let pollTimer = null;
let current = null; // { job, result, words: [{start,end,el}] }
const liveText = {}; // jobId -> [segment text], טקסט ביניים שכבר נטען

async function loadLive(jobId) {
  const have = liveText[jobId] || (liveText[jobId] = []);
  try {
    const segs = await api(`/api/jobs/${jobId}/live?since=${have.length}`);
    for (const s of segs) have.push(`[${fmtTime(s.start)}] ${s.text}`);
  } catch (_) {}
  return have;
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
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

// ---------- סטטוס ----------
async function loadStatus() {
  serverStatus = await api("/api/status");
  const s = $("status");
  s.textContent = "";
  const gpu = serverStatus.device === "cuda";
  s.append(`מודל: ${serverStatus.model} · `);
  s.append(el("span", { class: gpu ? "" : "warn" }, gpu ? "מעבד גרפי (GPU)" : "מעבד רגיל (CPU) — התמלול יהיה איטי"));

  const engine = $("engine");
  const cloudOpt = engine.querySelector('option[value="cloud"]');
  if (!serverStatus.cloud_configured) {
    cloudOpt.disabled = true;
    cloudOpt.textContent += " — לא הוגדר (ראו README)";
  }
  try {
    const saved = localStorage.getItem("engine");
    if (saved && !engine.querySelector(`option[value="${saved}"]`).disabled) engine.value = saved;
  } catch (_) {}
  const syncEngine = () => {
    // מצב "מהיר" רלוונטי רק לתמלול במחשב
    $("quality-label").hidden = engine.value === "cloud";
    try { localStorage.setItem("engine", engine.value); } catch (_) {}
  };
  engine.addEventListener("change", syncEngine);
  syncEngine();

  const hint = $("diarize-hint");
  if (!serverStatus.diarization_installed) {
    $("diarize").disabled = true;
    hint.textContent = "(זיהוי דוברים לא מותקן — ראו הוראות ב-README)";
  } else if (!serverStatus.hf_token) {
    hint.textContent = "(אם המודל עוד לא הורד, נדרש HF_TOKEN — ראו README)";
  }
}

// ---------- טופס ----------
function setupForm() {
  const drop = $("drop"), file = $("file");
  const showFile = () => {
    const f = file.files[0];
    $("drop-text").textContent = f ? `נבחר: ${f.name}` : "גררו לכאן קובץ שמע או וידאו, או לחצו לבחירה";
    drop.classList.toggle("has-file", !!f);
  };
  file.addEventListener("change", showFile);
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
    const prog = $("upload-progress");
    prog.className = "hint";
    if (!f && !url) { prog.textContent = "בחרו קובץ או הזינו קישור"; return; }

    const fd = new FormData();
    if (f) fd.append("file", f); else fd.append("url", url);
    fd.append("diarize", $("diarize").checked);
    fd.append("num_speakers", $("num-speakers").value || "0");
    fd.append("quality", $("quality").value);
    fd.append("engine", $("engine").value);

    // XHR כדי להציג התקדמות העלאה של קבצים גדולים
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/jobs");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) prog.textContent = `מעלה... ${Math.round((ev.loaded / ev.total) * 100)}%`;
    };
    xhr.onload = () => {
      $("submit").disabled = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        prog.textContent = "";
        file.value = ""; $("url").value = ""; showFile();
        refreshJobs();
      } else {
        let msg = xhr.statusText;
        try { msg = JSON.parse(xhr.responseText).detail || msg; } catch (_) {}
        prog.className = "error"; prog.textContent = msg;
      }
    };
    xhr.onerror = () => { $("submit").disabled = false; prog.className = "error"; prog.textContent = "שגיאת תקשורת"; };
    $("submit").disabled = true;
    xhr.send(fd);
  });
}

// ---------- רשימת עבודות ----------
async function refreshJobs() {
  const list = await api("/api/jobs");
  const ul = $("jobs");
  ul.textContent = "";
  if (!list.length) ul.append(el("li", { class: "hint" }, "עדיין אין תמלולים"));
  for (const job of list) {
    const info = el("div", { class: "info" });
    const title = job.status === "done"
      ? el("a", { href: `#/job/${job.id}` }, job.title)
      : document.createTextNode(job.title);
    info.append(el("div", { class: "title" }, title));

    let statusText = STATUS_LABELS[job.status] || job.status;
    if (job.options && job.options.engine === "cloud" && job.status !== "done") statusText += " (בענן)";
    if (job.status === "transcribing" && job.paused) {
      statusText = `מושהה · ${Math.round(job.progress * 100)}%`;
    } else if (job.status === "transcribing") {
      statusText += ` ${Math.round(job.progress * 100)}%`;
      // הערכת זמן לפי הקצב עד כה (שרת ודפדפן על אותו מחשב — אותו שעון)
      const elapsed = Date.now() / 1000 - (job.stage_started || 0);
      if (job.stage_started && job.progress > 0.03 && elapsed > 20) {
        const left = elapsed * (1 - job.progress) / job.progress;
        statusText += ` · נותרו כ-${fmtTime(left)}`;
      }
    }
    if (job.status === "diarizing") statusText += " (יכול לקחת כמה דקות)";
    if (job.status === "done" && job.duration) statusText += ` · ${fmtTime(job.duration)}`;
    const st = el("div", { class: job.status === "error" ? "hint error" : "hint" }, statusText);
    if (job.error) st.append(` — ${job.error}`);
    info.append(st);
    if (ACTIVE.has(job.status)) {
      const pct = job.status === "transcribing" ? job.progress * 100 : (job.status === "diarizing" ? 100 : 2);
      info.append(el("div", { class: "bar" }, el("div", { style: `width:${pct}%` })));
    }

    const isLocal = !(job.options && job.options.engine === "cloud");
    const buttons = el("div", { class: "actions" });
    if (job.status === "transcribing" && isLocal) {
      const action = job.paused ? "resume" : "pause";
      buttons.append(el("button", { class: "small-btn", onclick: async (e) => {
        e.target.disabled = true;
        try { await api(`/api/jobs/${job.id}/${action}`, { method: "POST" }); }
        catch (err) { alert(err.message); }
        refreshJobs();
      } }, job.paused ? "▶ המשך" : "⏸ השהה"));

      // טקסט ביניים: מה שתומלל עד עכשיו
      const lines = await loadLive(job.id);
      if (lines.length) {
        const box = el("div", { class: "live", dir: "rtl" });
        for (const line of lines) box.append(el("div", {}, line));
        info.append(box);
        requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
      } else {
        info.append(el("div", { class: "hint" }, "הטקסט יופיע כאן כשהקטע הראשון יתומלל..."));
      }
    } else if (job.status === "done") {
      delete liveText[job.id];
    }

    const del = el("button", { class: "danger", title: "מחיקה", onclick: async () => {
      if (!confirm(`למחוק את "${job.title}"?`)) return;
      try { await api(`/api/jobs/${job.id}`, { method: "DELETE" }); refreshJobs(); }
      catch (err) { alert(err.message); }
    } }, "מחיקה");
    if (ACTIVE.has(job.status) && job.status !== "queued") del.disabled = true;

    buttons.append(del);
    ul.append(el("li", {}, info, buttons));
  }

  clearTimeout(pollTimer);
  if (list.some((j) => ACTIVE.has(j.status))) pollTimer = setTimeout(refreshJobs, 2000);
}

// ---------- צפייה ועריכה ----------
async function saveEdits(body) {
  current.result = await api(`/api/jobs/${current.job.id}/result`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
    box.append(el("label", {}, input));
  }
}

function renderTranscript() {
  const box = $("transcript");
  box.textContent = "";
  current.words = [];
  const { segments, speakers = {} } = current.result;
  const threshold = serverStatus.low_confidence;
  const player = $("player");

  segments.forEach((seg, i) => {
    const meta = el("div", { class: "meta" });
    meta.append(el("span", { class: "ts", onclick: () => { player.currentTime = seg.start; player.play(); } },
      fmtTime(seg.start)));

    if (Object.keys(speakers).length) {
      const sel = el("select", { title: "שיוך לדובר" });
      for (const [id, name] of Object.entries(speakers)) {
        const opt = el("option", { value: id }, name);
        if (id === seg.speaker) opt.selected = true;
        sel.append(opt);
      }
      sel.addEventListener("change", () => saveEdits({ edits: [{ i, speaker: sel.value }] }));
      meta.append(sel);
    }
    if (seg.edited) meta.append(el("span", { class: "edited-tag" }, "(נערך ידנית)"));

    const text = el("div", { class: "text", title: "לחיצה כפולה לעריכה" });
    if (seg.edited || !seg.words.length) {
      text.textContent = seg.text;
    } else {
      for (const w of seg.words) {
        const known = typeof w.p === "number";
        const span = el("span", { class: known && w.p < threshold ? "w low" : "w" }, w.word);
        if (known) span.title = `ביטחון: ${Math.round(w.p * 100)}%`;
        span.addEventListener("click", () => { player.currentTime = w.start; player.play(); });
        text.append(span);
        current.words.push({ start: w.start, end: w.end, el: span });
      }
    }

    text.addEventListener("dblclick", () => {
      if (text.isContentEditable) return;
      text.textContent = seg.text;
      text.contentEditable = "true";
      text.focus();
      const finish = async (save) => {
        text.contentEditable = "false";
        if (save && text.textContent.trim() !== seg.text) {
          await saveEdits({ edits: [{ i, text: text.textContent }] });
        }
        renderTranscript();
      };
      text.addEventListener("blur", () => finish(true), { once: true });
      text.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); text.blur(); }
        if (e.key === "Escape") { text.textContent = seg.text; text.blur(); }
      });
    });

    box.append(el("div", { class: "seg" }, meta, text));
  });
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
  if (found) {
    found.el.classList.add("current");
    if ($("follow").checked && !$("player").paused) {
      found.el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
}

async function openJob(id) {
  const job = await api(`/api/jobs/${id}`);
  const result = await api(`/api/jobs/${id}/result`);
  current = { job, result, words: [] };
  lastWord = null;
  $("v-title").textContent = job.title;
  $("player").src = `/api/jobs/${id}/audio`;
  for (const fmt of ["docx", "txt", "srt"]) $(`exp-${fmt}`).href = `/api/jobs/${id}/export/${fmt}`;
  renderSpeakers();
  renderTranscript();
}

async function route() {
  const m = location.hash.match(/^#\/job\/(.+)$/);
  $("home").hidden = !!m;
  $("viewer").hidden = !m;
  if (m) {
    try { await openJob(m[1]); }
    catch (err) { alert(err.message); location.hash = ""; }
  } else {
    current = null;
    $("player").pause();
    refreshJobs();
  }
}

$("back").addEventListener("click", () => { location.hash = ""; });
$("show-low").addEventListener("change", (e) => $("transcript").classList.toggle("show-low", e.target.checked));
$("transcript").classList.add("show-low");
$("player").addEventListener("timeupdate", onTimeUpdate);
window.addEventListener("hashchange", route);

setupForm();
loadStatus().catch(() => {});
route();
