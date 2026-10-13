// מד קול: גובה צליל, עוצמה וגרף של הצליל לאורך זמן. הכול נעשה בדפדפן, השמע לא יוצא מהמכשיר.
import { h } from "./ui.js";
import { startMic, micErrorText } from "./audio.js";
import { detectPitch, rms, level, freqToMidi, noteName, isNatural } from "./pitch.js";

const HISTORY_SEC = 8;
const SPAN = 26; // כמה חצאי טונים מוצגים בגרף

export function createMeter(host, { show = "both", rootMidi = 52, onVoiced } = {}) {
  const showPitch = show !== "volume";
  const noteEl = h("div", { class: "name" }, "—");
  const subEl = h("div", { class: "sub" }, "הפעילו את המיקרופון והתחילו לדבר או להמהם");
  const tuneDot = h("i");
  const canvas = h("canvas", { class: "trace", "aria-label": "גרף גובה הצליל" });
  const volFill = h("div", { class: "vol-fill" });
  const gainInput = h("input", { type: "range", min: "-20", max: "30", value: "10", "aria-label": "רגישות" });
  const msg = h("div", { class: "mic-msg", hidden: true });
  const startBtn = h("button", { class: "btn primary" }, "🎙️ הפעילו מיקרופון");
  const stopBtn = h("button", { class: "btn ghost small", hidden: true }, "עצרו");

  const box = h(
    "div",
    { class: "meter-box" },
    msg,
    showPitch && h("div", { class: "note-big" }, noteEl, subEl),
    showPitch && h("div", { class: "tune", "aria-hidden": "true" }, tuneDot),
    showPitch && canvas,
    h(
      "div",
      { class: "vol" },
      h("div", { class: "vol-bar" }, h("div", { class: "vol-zone", style: "inset-inline-start:50%;width:30%" }), volFill),
      h("div", { class: "vol-row" }, "רגישות", gainInput)
    ),
    h("div", { class: "controls" }, startBtn, stopBtn)
  );
  host.append(box);

  let mic = null;
  let raf = 0;
  let frame = 0;
  let history = []; // {t, midi|null}
  let center = rootMidi + 6;
  let lastMidi = null;
  let lastSeen = 0;
  const buf = new Float32Array(4096);
  const recent = [];
  let voicedMs = 0;
  let voicedDone = false;

  const ctx2d = canvas.getContext && canvas.getContext("2d");

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600;
    const hh = canvas.clientHeight || 170;
    canvas.width = w * dpr;
    canvas.height = hh * dpr;
    ctx2d && ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function colors() {
    const cs = getComputedStyle(document.documentElement);
    return { line: cs.getPropertyValue("--line").trim(), brand: cs.getPropertyValue("--brand").trim(), accent: cs.getPropertyValue("--accent").trim(), muted: cs.getPropertyValue("--muted").trim() };
  }

  function drawTrace(now) {
    if (!ctx2d || !showPitch) return;
    const w = canvas.clientWidth, hh = canvas.clientHeight;
    const c = colors();
    ctx2d.clearRect(0, 0, w, hh);
    const span = SPAN;
    const lo = center - span / 2;
    const y = (m) => hh - ((m - lo) / span) * hh;
    ctx2d.font = "11px sans-serif";
    ctx2d.textAlign = "right";
    for (let m = Math.ceil(lo); m <= lo + span; m++) {
      if (!isNatural(m)) continue;
      const name = noteName(m);
      const labeled = name === "דו" || name === "מי" || name === "סול";
      ctx2d.strokeStyle = c.line;
      ctx2d.lineWidth = name === "דו" ? 1.5 : 0.6;
      ctx2d.beginPath();
      ctx2d.moveTo(0, y(m));
      ctx2d.lineTo(w - 34, y(m));
      ctx2d.stroke();
      if (labeled) {
        ctx2d.fillStyle = c.muted;
        ctx2d.fillText(name, w - 4, y(m) + 4);
      }
    }
    ctx2d.strokeStyle = c.accent;
    ctx2d.lineWidth = 3;
    ctx2d.lineJoin = "round";
    ctx2d.lineCap = "round";
    const x = (t) => w - 34 - ((now - t) / (HISTORY_SEC * 1000)) * (w - 40);
    let open = false;
    ctx2d.beginPath();
    for (const p of history) {
      if (p.midi == null) {
        open = false;
        continue;
      }
      if (!open) {
        ctx2d.moveTo(x(p.t), y(p.midi));
        open = true;
      } else ctx2d.lineTo(x(p.t), y(p.midi));
    }
    ctx2d.stroke();
  }

  function onFrame() {
    raf = requestAnimationFrame(onFrame);
    if (!mic) return;
    frame++;
    if (frame % 2) return;
    const now = performance.now();
    mic.analyser.getFloatTimeDomainData(buf);
    const r = rms(buf);
    if (onVoiced && !voicedDone) {
      if (r > 0.02) voicedMs += 33;
      if (voicedMs >= 3000) {
        voicedDone = true;
        onVoiced();
      }
    }
    volFill.style.width = `${Math.round(level(r, Number(gainInput.value) - 10) * 100)}%`;

    if (showPitch) {
      const res = detectPitch(buf, mic.sampleRate);
      let midi = null;
      if (res) {
        recent.push(freqToMidi(res.freq));
        if (recent.length > 3) recent.shift();
        midi = [...recent].sort((a, b) => a - b)[Math.floor(recent.length / 2)];
        lastMidi = midi;
        lastSeen = now;
        const rounded = Math.round(midi);
        const cents = Math.round((midi - rounded) * 100);
        noteEl.textContent = noteName(rounded);
        subEl.textContent = `${Math.round(res.freq)} הרץ · ${cents > 0 ? "+" : ""}${cents} סנט`;
        tuneDot.style.left = `${50 + Math.max(-50, Math.min(50, cents)) * 0.9}%`;
        if (Math.abs(midi - center) > SPAN * 0.4) center += (midi - center) * 0.2;
      } else {
        recent.length = 0;
        if (now - lastSeen > 400) {
          noteEl.textContent = "—";
          subEl.textContent = "אין צליל ברור. נסו להמהם או לדבר בקול";
        }
      }
      history.push({ t: now, midi });
      while (history.length && now - history[0].t > HISTORY_SEC * 1000) history.shift();
      drawTrace(now);
    }
  }

  async function start() {
    msg.hidden = true;
    startBtn.disabled = true;
    try {
      mic = await startMic();
    } catch (err) {
      msg.textContent = micErrorText(err);
      msg.hidden = false;
      startBtn.disabled = false;
      return;
    }
    resizeCanvas();
    startBtn.hidden = true;
    stopBtn.hidden = false;
    subEl.textContent = "מקשיבים… התחילו להמהם או לדבר";
    history = [];
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(onFrame);
  }

  function stop() {
    if (mic) mic.stop();
    mic = null;
    cancelAnimationFrame(raf);
    startBtn.hidden = false;
    startBtn.disabled = false;
    stopBtn.hidden = true;
  }

  startBtn.addEventListener("click", start);
  stopBtn.addEventListener("click", stop);
  window.addEventListener("resize", resizeCanvas);
  setTimeout(resizeCanvas, 0);

  return {
    destroy() {
      stop();
      window.removeEventListener("resize", resizeCanvas);
      box.remove();
    },
  };
}
