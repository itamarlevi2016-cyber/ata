// רכיבי התרגילים. כל פונקציה מקבלת (step, host, api) ובונה את התרגיל בתוך host.
// api: { coach, rootMidi(), onCleanup(fn), rep(n), task() }
// סוגי תרגילים שנחשבים "משימה": השלמה שלהם מזכה ב-10 נקודות
import { h, fmtTime, richText } from "./ui.js";
import * as store from "./progress.js";
import { RANGES, midiToFreq, noteName } from "./pitch.js";
import { playSequence, playGlide, chime, getCtx } from "./audio.js";
import { createMeter } from "./meter.js";
import { startMic, micErrorText } from "./audio.js";
import { rms } from "./pitch.js";
import { tokenize, wpmFor, paceZone, PACE_ZONES, itemMs, analyzeSpeech } from "./pace.js";

export const TASK_TYPES = new Set(["breath", "timer", "stopwatch", "scale", "glide", "repeat", "read", "meter", "paced", "record"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function points(list) {
  return h("ul", { class: "points" }, list.map((p) => h("li", null, p)));
}

// ---------- הסבר / טיפ ----------
function say(step, host) {
  if (step.title) host.append(h("div", { class: "exercise-title" }, step.title));
  if (step.points) host.append(points(step.points));
}

// ---------- בחירת טווח קול ----------
function range(step, host, api) {
  const cur = store.get().range;
  const emoji = { low: "🐻", mid: "🙂", high: "🐦" };
  const cards = Object.entries(RANGES).map(([key, r]) => {
    const b = h("button", { class: "choice", role: "radio", "aria-checked": String(key === cur), type: "button" }, h("span", { class: "e" }, emoji[key]), r.label, h("small", null, r.desc));
    b.addEventListener("click", () => {
      store.save({ range: key });
      cards.forEach((c) => c.setAttribute("aria-checked", String(c === b)));
      playSequence([r.root], { noteDur: 0.9 });
    });
    return b;
  });
  host.append(h("div", { class: "choices", role: "radiogroup" }, cards), h("div", { class: "hint" }, "לחצו על כל אפשרות כדי לשמוע צליל לדוגמה"));
}

// ---------- נשימה מודרכת ----------
function breath(step, host, api) {
  const ring = h("div", { class: "breath-ring" });
  const label = h("div", { class: "label" }, "מוכנים?");
  const count = h("div", { class: "count" });
  const status = h("div", { class: "breath-status" }, `${step.cycles} סבבים`);
  const btn = h("button", { class: "btn primary" }, "התחילו");
  host.append(h("div", { class: "breath-wrap" }, ring, h("div", { class: "breath-text" }, count, label)), status, h("div", { class: "controls" }, btn));

  let token = 0;
  const reset = () => {
    ring.removeAttribute("data-phase");
    ring.style.setProperty("--dur", "0.6s");
    api.coach.breathe("idle");
    label.textContent = "מוכנים?";
    count.textContent = "";
  };
  async function run() {
    const my = ++token;
    btn.textContent = "עצרו";
    for (let c = 1; c <= step.cycles; c++) {
      status.textContent = `סבב ${c} מתוך ${step.cycles}`;
      for (const [text, secs, phase] of step.pattern) {
        if (my !== token) return;
        label.textContent = text;
        ring.style.setProperty("--dur", `${secs}s`);
        ring.dataset.phase = phase;
        api.coach.breathe(phase, secs);
        for (let s = secs; s > 0; s--) {
          while (api.isPaused?.() && my === token) await sleep(100);
          if (my !== token) return;
          count.textContent = s;
          await sleep(1000);
          while (api.isPaused?.() && my === token) await sleep(100);
          if (my !== token) return;
        }
      }
      api.rep(1);
    }
    token++;
    reset();
    api.task();
    status.textContent = "כל הכבוד! סיימתם 🎉";
    btn.textContent = "שוב";
    chime();
  }
  btn.addEventListener("click", () => {
    if (btn.textContent === "עצרו") {
      token++;
      reset();
      status.textContent = `${step.cycles} סבבים`;
      btn.textContent = "התחילו";
    } else run();
  });
  api.onCleanup(() => {
    token++;
    api.coach.breathe("idle");
  });
}

// ---------- טיימר ----------
function timer(step, host, api) {
  const R = 54, C = 2 * Math.PI * R;
  const fg = h("circle", { class: "ring-fg", cx: 60, cy: 60, r: R, fill: "none", "stroke-width": 10, "stroke-dasharray": C, "stroke-dashoffset": 0 });
  const time = h("div", { class: "ring-time" }, fmtTime(step.secs));
  const wrap = h("div", { class: "ring-wrap" }, h("svg", { viewBox: "0 0 120 120" }, h("circle", { class: "ring-bg", cx: 60, cy: 60, r: R, fill: "none", "stroke-width": 10 }), fg), time);
  const btn = h("button", { class: "btn primary" }, "▶ התחילו");
  const rst = h("button", { class: "btn ghost small", hidden: true }, "מההתחלה");
  host.append(h("div", { class: "exercise-title" }, step.label), wrap, h("div", { class: "controls" }, btn, rst));

  let left = step.secs, iv = null;
  const draw = () => {
    time.textContent = fmtTime(left);
    fg.setAttribute("stroke-dashoffset", String(C * (1 - left / step.secs)));
  };
  const stop = () => {
    clearInterval(iv);
    iv = null;
  };
  const run = () => {
    btn.textContent = "⏸ השהו";
    rst.hidden = false;
    iv = setInterval(() => {
      left--;
      draw();
      if (left <= 0) {
        stop();
        wrap.classList.add("done");
        time.textContent = "✓";
        btn.textContent = "▶ שוב";
        left = step.secs;
        chime();
        api.rep(1);
        api.task();
      }
    }, 1000);
  };
  btn.addEventListener("click", () => {
    if (iv) {
      stop();
      btn.textContent = "▶ המשיכו";
    } else {
      wrap.classList.remove("done");
      if (left <= 0) left = step.secs;
      draw();
      run();
    }
  });
  rst.addEventListener("click", () => {
    stop();
    left = step.secs;
    wrap.classList.remove("done");
    draw();
    btn.textContent = "▶ התחילו";
    rst.hidden = true;
  });
  api.onPause?.(() => { if (iv) { stop(); btn.textContent = "▶ המשיכו"; } });
  api.onCleanup(stop);
  draw();
}

// ---------- שעון עצר לנשיפה ----------
function stopwatch(step, host, api) {
  const best = store.get().bestExhale || 0;
  const time = h("div", { class: "ring-time", style: "position:static;font-size:3.4rem;text-align:center" }, "0.0");
  const info = h("div", { class: "hint" }, best ? `משך קודם שנרשם: ${best.toFixed(1)} שניות. הנוחות חשובה מהזמן.` : "נושפים בנוחות ועוצרים לפני מאמץ. אין צורך להגיע לשיא.");
  const btn = h("button", { class: "btn primary" }, "▶ התחילו");
  host.append(h("div", { class: "exercise-title" }, "נשיפה נינוחה על ״ססס״"), time, info, h("div", { class: "controls" }, btn));
  let t0 = 0, iv = null, elapsed = 0;
  btn.addEventListener("click", () => {
    if (!iv) {
      t0 = performance.now() - elapsed;
      btn.textContent = "⏹ סיימתי";
      iv = setInterval(() => (time.textContent = ((performance.now() - t0) / 1000).toFixed(1)), 100);
    } else {
      clearInterval(iv);
      iv = null;
      const secs = (performance.now() - t0) / 1000;
      time.textContent = secs.toFixed(1);
      if (secs >= 3) {
        api.rep(1);
        api.task();
      }
      const prev = store.get().bestExhale || 0;
      if (secs > prev) {
        store.save({ bestExhale: secs });
        info.textContent = `נרשמו ${secs.toFixed(1)} שניות. חשוב שהנשיפה תישאר נוחה.`;
      } else info.textContent = `${secs.toFixed(1)} שניות. זה רישום של התרגול, לא ציון לאיכות הקול.`;
      elapsed = 0;
      btn.textContent = "▶ שוב";
    }
  });
  api.onPause?.(() => { if (iv) { elapsed = performance.now() - t0; clearInterval(iv); iv = null; btn.textContent = "▶ המשיכו"; } });
  api.onCleanup(() => clearInterval(iv));
}

// ---------- מכנים משותפים לסולם ולהחלקה ----------
function shiftControl(api, state, onChange) {
  const label = h("span", null);
  const upd = () => {
    const m = api.rootMidi() + state.shift;
    label.textContent = `מתחילים מ-${noteName(m)} (${Math.round(midiToFreq(m))} הרץ)`;
    onChange && onChange();
  };
  const down = h("button", { type: "button", "aria-label": "נמוך יותר" }, "−");
  const up = h("button", { type: "button", "aria-label": "גבוה יותר" }, "+");
  down.addEventListener("click", () => ((state.shift = Math.max(-7, state.shift - 1)), upd()));
  up.addEventListener("click", () => ((state.shift = Math.min(7, state.shift + 1)), upd()));
  upd();
  return h("div", { class: "shift" }, "גובה:", down, label, up);
}

function micToggle(host, api, state) {
  const holder = h("div", { style: "margin-top:16px" });
  let meter = null;
  const btn = h("button", { class: "btn ghost small" }, "🎙️ נסו עם המיקרופון");
  btn.addEventListener("click", () => {
    if (meter) {
      meter.destroy();
      meter = null;
      btn.textContent = "🎙️ נסו עם המיקרופון";
    } else {
      meter = createMeter(holder, { show: "pitch", rootMidi: api.rootMidi() + state.shift });
      btn.textContent = "הסתירו את המיקרופון";
    }
  });
  api.onPause?.(() => meter?.stop());
  api.onCleanup(() => meter && meter.destroy());
  host.append(h("div", { class: "controls" }, btn), holder, h("div", { class: "hint" }, "עדיף להשתמש באוזניות כשמפעילים גם צליל וגם מיקרופון"));
}

// ---------- סולם ----------
function scale(step, host, api) {
  const n = step.notes.length;
  const W = 600, H = 150;
  const minR = Math.min(...step.notes), maxR = Math.max(...step.notes);
  const xs = (i) => 36 + (i * (W - 72)) / Math.max(1, n - 1);
  const ys = (r) => H - 28 - ((r - minR) * (H - 56)) / Math.max(1, maxR - minR);
  const dots = [], labels = [];
  const path = step.notes.map((r, i) => `${i ? "L" : "M"}${xs(i)} ${ys(r)}`).join(" ");
  const svg = h("svg", { class: "ladder", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "תרשים הצלילים" }, h("path", { class: "line", d: path }));
  step.notes.forEach((r, i) => {
    const dot = h("circle", { class: "dot", cx: xs(i), cy: ys(r), r: 17 });
    const txt = h("text", { x: xs(i), y: ys(r) }, step.syll[i] || "");
    dots.push(dot);
    svg.append(dot, txt);
  });
  const state = { shift: 0 };
  const play = h("button", { class: "btn primary" }, "▶ השמיעו");
  const slow = h("button", { class: "btn" }, "🐢 לאט");
  const stopBtn = h("button", { class: "btn ghost small", hidden: true }, "⏹");
  host.append(svg, h("div", { class: "controls" }, play, slow, stopBtn));
  host.append(shiftControl(api, state));

  let cur = null;
  let reachedEnd = false;
  const finish = () => {
    dots.forEach((d) => d.classList.remove("active"));
    stopBtn.hidden = true;
    cur = null;
    if (reachedEnd) {
      reachedEnd = false;
      confirmPractice.hidden = false;
    }
  };
  const confirmPractice = h("button",{class:"btn primary",type:"button",hidden:true},"תרגלתי בקול בנוחות ✓");
  confirmPractice.addEventListener("click",()=>{confirmPractice.hidden=true;api.rep(1);api.task();});
  host.append(h("div",{class:"controls"},confirmPractice));
  const go = (noteDur) => {
    if (cur) cur.stop();
    reachedEnd = false;
    stopBtn.hidden = false;
    cur = playSequence(step.notes.map((r) => api.rootMidi() + state.shift + r), {
      noteDur,
      onNote: (i) => {
        dots.forEach((d, j) => d.classList.toggle("active", j === i));
        if (i === n - 1) reachedEnd = true;
      },
      onEnd: finish,
    });
  };
  play.addEventListener("click", () => go(0.65));
  slow.addEventListener("click", () => go(1.0));
  stopBtn.addEventListener("click", () => cur && cur.stop());
  api.onPause?.(() => cur && cur.stop());
  api.onCleanup(() => cur && cur.stop());
  if (step.mic) micToggle(host, api, state);
}

// ---------- החלקה (סירנה) ----------
function glide(step, host, api) {
  const W = 600, H = 150;
  const pathD = `M30 ${H - 24} C ${W * 0.28} ${H - 24}, ${W * 0.3} 24, ${W / 2} 24 C ${W * 0.7} 24, ${W * 0.72} ${H - 24}, ${W - 30} ${H - 24}`;
  const arc = h("path", { class: "arc", d: pathD, id: "g-arc" });
  const dot = h("circle", { class: "glide-dot", r: 14, cx: 30, cy: H - 24 });
  const svg = h("svg", { class: "ladder glide-svg", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "מסלול הסירנה" }, arc, dot);
  const state = { shift: 0 };
  const play = h("button", { class: "btn primary" }, "▶ השמיעו סירנה");
  const stopBtn = h("button", { class: "btn ghost small", hidden: true }, "⏹");
  host.append(svg, h("div", { class: "controls" }, play, stopBtn), shiftControl(api, state));
  const total = arc.getTotalLength ? arc.getTotalLength() : 0;
  const place = (p) => {
    if (!total) return;
    const pt = arc.getPointAtLength(p * total);
    dot.setAttribute("cx", pt.x);
    dot.setAttribute("cy", pt.y);
  };
  let cur = null;
  let reachedEnd = false;
  const confirmPractice = h("button",{class:"btn primary",type:"button",hidden:true},"תרגלתי בקול בנוחות ✓");
  confirmPractice.addEventListener("click",()=>{confirmPractice.hidden=true;api.rep(1);api.task();});
  host.append(h("div",{class:"controls"},confirmPractice));
  const finish = () => {
    place(0);
    stopBtn.hidden = true;
    cur = null;
    if (reachedEnd) {
      reachedEnd = false;
      confirmPractice.hidden = false;
    }
  };
  play.addEventListener("click", () => {
    if (cur) cur.stop();
    reachedEnd = false;
    stopBtn.hidden = false;
    const base = api.rootMidi() + state.shift;
    api.coach.act("siren", { dur: step.secs });
    cur = playGlide(base + step.from, base + step.to, {
      dur: step.secs,
      onProgress: (p) => {
        place(p);
        if (p >= 0.98) reachedEnd = true;
      },
      onEnd: finish,
    });
  });
  stopBtn.addEventListener("click", () => cur && cur.stop());
  api.onPause?.(() => cur && cur.stop());
  api.onCleanup(() => cur && cur.stop());
  if (step.mic) micToggle(host, api, state);
}

// ---------- חזרות בסבבים ----------
function repeat(step, host, api) {
  let pass = 0, idx = 0;
  const phrase = h("div", { class: "phrase" });
  const label = h("div", { class: "pass-label" });
  const dots = h("div", { class: "pass-dots" }, step.passes.map(() => h("i")));
  const next = h("button", { class: "btn primary" }, "קראתי, הלאה ✓");
  const again = h("button", { class: "btn ghost small", hidden: true }, "מההתחלה");
  host.append(label, dots, phrase, h("div", { class: "controls" }, next, again));

  const draw = () => {
    phrase.textContent = "";
    phrase.append(richText(step.items[idx]));
    label.textContent = `סבב ${pass + 1} מתוך ${step.passes.length}: ${step.passes[pass]}`;
    [...dots.children].forEach((d, i) => d.classList.toggle("on", i <= pass));
  };
  next.addEventListener("click", () => {
    api.rep(1);
    if (idx < step.items.length - 1) idx++;
    else if (pass < step.passes.length - 1) {
      pass++;
      idx = 0;
    } else {
      phrase.textContent = "🎉 כל הכבוד, סיימתם!";
      label.textContent = "";
      next.hidden = true;
      again.hidden = false;
      chime();
      api.task();
      return;
    }
    draw();
  });
  again.addEventListener("click", () => {
    pass = 0;
    idx = 0;
    next.hidden = false;
    again.hidden = true;
    draw();
  });
  draw();
}

// ---------- קריאה ----------
function read(step, host, api) {
  const frag = document.createDocumentFragment();
  step.text.split(/(\s*\/\/\s*|\s*\/\s*)/).forEach((part) => {
    const p = part.trim();
    if (p === "//") frag.append(h("span", { class: "pause-mark long" }, "⏸ הפסקה ארוכה"), " ");
    else if (p === "/") frag.append(h("span", { class: "pause-mark" }, "⏸"), " ");
    else if (part) frag.append(richText(part));
  });
  const done = h("button", { class: "btn primary" }, "קראתי בקול ✓");
  done.addEventListener("click", () => {
    done.disabled = true;
    done.textContent = "כל הכבוד!";
    api.rep(1);
    api.task();
  });
  host.append(h("div", { class: "read" }, frag), h("div", { class: "hint" }, "⏸ = נשימה קצרה · ⏸ הפסקה ארוכה = רגע של שקט · המילים המסומנות מודגשות"), h("div", { class: "controls" }, done));
}

// ---------- מד קול ----------
function meterStep(step, host, api) {
  const m = createMeter(host, {
    show: step.mode === "volume" ? "volume" : "both",
    rootMidi: api.rootMidi(),
    onVoiced: () => {
      api.rep(1);
      api.task();
    },
  });
  api.onPause?.(() => m.stop());
  api.onCleanup(() => m.destroy());
  if (step.hint) host.append(h("div", { class: "hint" }, step.hint));
}

// ---------- קצב קריאה: מדידה או קריאה עם סמן ----------
// mode "measure": קוראים בקצב שלכם ומודדים מילים לדקה.
// mode "follow": סמן עובר על המילים בקצב היעד (step.wpm), וקוראים יחד איתו.
function paceGauge(wpm) {
  const zone = paceZone(wpm);
  const pos = Math.max(0, Math.min(100, (wpm / 200) * 100));
  return h(
    "div",
    { class: "pace-gauge" },
    h("div", { class: "pace-bar" }, PACE_ZONES.map((z, i) => h("span", { class: `pace-zone z-${z.key}` }, z.label)), h("i", { class: "pace-mark", style: `inset-inline-start:${pos}%` })),
    h("div", { class: "pace-result" }, h("b", null, `${wpm} מילים לדקה`), ` · ${zone.label}. ${zone.note}`)
  );
}

function paced(step, host, api) {
  const items = tokenize(step.text);
  const words = items.filter((t) => t.w).length;
  const mode = step.mode || "follow";
  const spans = items.map((t) => (t.pause ? h("span", { class: `pace-pause${t.pause === 2 ? " long" : ""}` }, "⏸") : h("span", { class: "pace-word" }, t.w)));
  const text = h("div", { class: "read paced" }, spans.flatMap((s) => [s, " "]));
  const result = h("div", { class: "pace-out" });
  host.append(h("div", { class: "exercise-title" }, step.label || (mode === "measure" ? "מדדו את הקצב שלכם" : `קראו יחד עם הסמן · ${step.wpm} מילים לדקה`)), text, result);

  if (mode === "measure") {
    const btn = h("button", { class: "btn primary" }, "▶ התחלתי לקרוא");
    const clock = h("span", { class: "pace-clock" }, "0");
    host.append(h("div", { class: "hint" }, `${words} מילים. קראו בקול בקצב שבו הייתם מסבירים לתלמידים, ולחצו "סיימתי" בסוף.`), h("div", { class: "controls" }, btn, clock));
    let t0 = 0, iv = null;
    btn.addEventListener("click", () => {
      if (!iv) {
        t0 = performance.now();
        btn.textContent = "⏹ סיימתי";
        iv = setInterval(() => (clock.textContent = String(Math.round((performance.now() - t0) / 1000))), 250);
        return;
      }
      clearInterval(iv); iv = null;
      const secs = (performance.now() - t0) / 1000;
      const wpm = wpmFor(words, secs);
      btn.textContent = "▶ שוב";
      clock.textContent = "";
      result.replaceChildren(paceGauge(wpm));
      if (secs >= 3 && wpm > 0) {
        const log = [...(store.get().paceLog || []), { d: new Date().toISOString().slice(0, 10), wpm }].slice(-30);
        store.save({ paceLog: log });
        api.rep(1);
        api.task();
      }
    });
    api.onPause?.(() => { if (iv) { clearInterval(iv); iv = null; btn.textContent = "▶ התחלתי לקרוא"; clock.textContent = ""; } });
    api.onCleanup(() => clearInterval(iv));
    return;
  }

  let wpm = step.wpm || 110, i = 0, token = 0, running = false, finished = false;
  const wpmLabel = h("span", { class: "pace-wpm" }, `${wpm} מילים לדקה`);
  const slower = h("button", { class: "btn ghost small", type: "button", "aria-label": "לאט יותר" }, "− לאט יותר");
  const faster = h("button", { class: "btn ghost small", type: "button", "aria-label": "מהר יותר" }, "מהר יותר +");
  const btn = h("button", { class: "btn primary" }, "▶ התחילו");
  const confirm = h("button", { class: "btn primary", type: "button", hidden: true }, "קראתי יחד עם הסמן ✓");
  host.append(h("div", { class: "controls pace-controls" }, slower, wpmLabel, faster), h("div", { class: "controls" }, btn, confirm), h("div", { class: "hint" }, "קראו בקול את המילה שמודגשת. בסימן ⏸ עוצרים ושותקים עד שהסמן ממשיך."));
  const base = items.map((t) => (t.pause ? `pace-pause${t.pause === 2 ? " long" : ""}` : "pace-word"));
  const mark = (idx) => spans.forEach((s, k) => s.setAttribute("class", `${base[k]}${k === idx ? " on" : k < idx ? " done" : ""}`));
  const setWpm = (v) => { wpm = Math.max(60, Math.min(200, v)); wpmLabel.textContent = `${wpm} מילים לדקה`; };
  slower.addEventListener("click", () => setWpm(wpm - 10));
  faster.addEventListener("click", () => setWpm(wpm + 10));
  async function run() {
    const my = ++token;
    running = true;
    btn.textContent = "⏸ עצרו";
    while (i < items.length) {
      if (my !== token) return;
      mark(i);
      spans[i].scrollIntoView?.({ block: "nearest" });
      await sleep(itemMs(items[i], wpm));
      if (my !== token) return;
      i++;
    }
    running = false;
    finished = true;
    mark(-1);
    btn.textContent = "▶ מההתחלה";
    i = 0;
    confirm.hidden = false;
    chime();
  }
  btn.addEventListener("click", () => {
    if (running) { token++; running = false; btn.textContent = "▶ המשיכו"; return; }
    if (finished) finished = false;
    run();
  });
  confirm.addEventListener("click", () => { confirm.hidden = true; api.rep(1); api.task(); });
  api.onPause?.(() => { if (running) { token++; running = false; btn.textContent = "▶ המשיכו"; } });
  api.onCleanup(() => token++);
}

// ---------- הקלטה עצמית: דיבור, שקט והפסקות ----------
// ההקלטה נשארת בזיכרון של הדף בלבד ונמחקת במעבר שלב.
function record(step, host, api) {
  const max = step.secs || 30;
  const btn = h("button", { class: "btn primary" }, "🎙️ הקליטו");
  const clock = h("span", { class: "pace-clock" }, "");
  const msg = h("div", { class: "mic-msg", hidden: true });
  const out = h("div", { class: "pace-out" });
  host.append(h("div", { class: "exercise-title" }, step.label || "הקליטו את עצמכם"), h("div", { class: "hint" }, step.prompt || `דברו עד ${max} שניות. בסוף נראה איפה היו הפסקות ואיפה המילים רדפו זו את זו.`), msg, h("div", { class: "controls" }, btn, clock), out);
  let mic = null, rec = null, iv = null, frames = [], chunks = [], t0 = 0, url = null;
  const buf = new Float32Array(2048);
  function show(blob) {
    const a = analyzeSpeech(frames);
    const timeline = h("div", { class: "pace-timeline", "aria-label": "דיבור ושקט לאורך ההקלטה" }, a.segments.map((s) => h("i", { class: s.on ? "on" : "off", style: `width:${Math.max(0.5, ((s.end - s.start) / a.total) * 100)}%` })));
    const per10 = a.total ? (a.pauses / a.total) * 10 : 0;
    const verdict = a.total < 5 ? "הקלטה קצרה מדי כדי להסיק משהו. נסו שוב עם כמה משפטים." : a.pauses === 0 ? "לא הייתה אף הפסקה של יותר מחצי שנייה. המאזינים לא קיבלו רגע לעכל." : per10 < 1 ? "יש הפסקות, אבל מעטות. נסו לעצור בסוף כל משפט." : a.longestPause < 1 ? "יש הפסקות קצרות. אחרי רעיון חשוב כדאי הפסקה של שנייה ויותר." : "קצב טוב: יש הפסקות, וחלקן ארוכות מספיק כדי שהתלמידים יספיקו לחשוב.";
    out.replaceChildren(
      timeline,
      h("div", { class: "pace-legend" }, h("span", { class: "on" }, "דיבור"), h("span", { class: "off" }, "שקט")),
      h("div", { class: "summary" },
        h("div", { class: "sum-tile" }, h("b", null, String(a.pauses)), "הפסקות"),
        h("div", { class: "sum-tile" }, h("b", null, `${a.longestPause.toFixed(1)}״`), "ההפסקה הארוכה"),
        h("div", { class: "sum-tile" }, h("b", null, `${Math.round(a.ratio * 100)}%`), "מהזמן דיברתם")),
      h("p", { class: "pace-result" }, verdict),
      blob && h("audio", { controls: true, src: (url = URL.createObjectURL(blob)) }),
      blob && h("div", { class: "hint" }, "הקשיבו פעם אחת רק להפסקות. ההקלטה לא נשמרת ונמחקת במעבר לשלב הבא.")
    );
    if (a.total >= 5) { api.rep(1); api.task(); }
  }
  function stop() {
    clearInterval(iv); iv = null;
    const recorder = rec; rec = null;
    btn.textContent = "🎙️ הקליטו שוב";
    clock.textContent = "";
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => { show(chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : null); mic?.stop(); mic = null; };
      recorder.stop();
    } else { show(null); mic?.stop(); mic = null; }
  }
  btn.addEventListener("click", async () => {
    if (iv) { stop(); return; }
    msg.hidden = true; btn.disabled = true;
    if (url) { URL.revokeObjectURL(url); url = null; }
    try { mic = await startMic(); } catch (err) { msg.textContent = micErrorText(err); msg.hidden = false; btn.disabled = false; return; }
    btn.disabled = false;
    frames = []; chunks = []; out.replaceChildren();
    if (typeof MediaRecorder !== "undefined" && mic.stream) {
      try { rec = new MediaRecorder(mic.stream); rec.ondataavailable = (e) => e.data.size && chunks.push(e.data); rec.start(250); } catch (_) { rec = null; }
    }
    t0 = performance.now();
    btn.textContent = "⏹ סיימתי";
    iv = setInterval(() => {
      mic.analyser.getFloatTimeDomainData(buf);
      frames.push(rms(buf));
      const secs = (performance.now() - t0) / 1000;
      clock.textContent = `${Math.round(secs)} / ${max}`;
      if (secs >= max) stop();
    }, 50);
  });
  api.onPause?.(() => { if (iv) stop(); });
  api.onCleanup(() => { if (iv) { clearInterval(iv); iv = null; } rec?.state !== "inactive" && rec?.stop(); mic?.stop(); if (url) URL.revokeObjectURL(url); });
}

export const RENDERERS = { say, range, breath, timer, stopwatch, scale, glide, repeat, read, meter: meterStep, paced, record };
