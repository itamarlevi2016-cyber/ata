// צלילי הדגמה, מיקרופון והקראה (קריינות של המכשיר).
import * as store from "./progress.js";
import { midiToFreq } from "./pitch.js";

let ctx = null;
let master = null;

export function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = store.get().demoVolume ?? .8;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function warmWave(c) {
  // צליל רך: יסוד ועוד שני הרמוניות עדינות
  return c.createPeriodicWave(new Float32Array([0, 0, 0, 0]), new Float32Array([0, 1, 0.4, 0.15]));
}

function voice(c, freq, t0, dur, gain) {
  const osc = c.createOscillator();
  osc.setPeriodicWave(warmWave(c));
  osc.frequency.setValueAtTime(freq, t0);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.05);
  g.gain.setValueAtTime(gain, t0 + Math.max(0.05, dur - 0.12));
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  return { osc, g };
}

// השמעת רצף צלילים. onNote(i) נקרא בתחילת כל צליל.
export function playSequence(midis, { noteDur = 0.7, gap = 0.06, gain = 0.22, onNote, onEnd } = {}) {
  const c = getCtx();
  const t0 = c.currentTime + 0.05;
  const voices = [];
  const timers = [];
  midis.forEach((m, i) => {
    const t = t0 + i * (noteDur + gap);
    voices.push(voice(c, midiToFreq(m), t, noteDur, gain));
    timers.push(setTimeout(() => onNote && onNote(i), (t - c.currentTime) * 1000));
  });
  const total = midis.length * (noteDur + gap);
  timers.push(setTimeout(() => onEnd && onEnd(), total * 1000 + 50));
  return {
    stop() {
      timers.forEach(clearTimeout);
      voices.forEach(({ osc }) => {
        try { osc.stop(); } catch (_) {}
      });
      onEnd && onEnd();
    },
  };
}

// החלקה (סירנה) למעלה ובחזרה
export function playGlide(from, to, { dur = 4, back = true, gain = 0.22, onProgress, onEnd } = {}) {
  const c = getCtx();
  const t0 = c.currentTime + 0.05;
  const osc = c.createOscillator();
  osc.setPeriodicWave(warmWave(c));
  const f1 = midiToFreq(from), f2 = midiToFreq(to);
  osc.frequency.setValueAtTime(f1, t0);
  osc.frequency.exponentialRampToValueAtTime(f2, t0 + (back ? dur / 2 : dur));
  if (back) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.1);
  g.gain.setValueAtTime(gain, t0 + dur - 0.15);
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);

  const startedAt = performance.now() + 50;
  let raf = 0;
  let stopped = false;
  const tick = () => {
    const p = Math.min(1, Math.max(0, (performance.now() - startedAt) / (dur * 1000)));
    onProgress && onProgress(p);
    if (p < 1 && !stopped) raf = requestAnimationFrame(tick);
    else if (!stopped) onEnd && onEnd();
  };
  raf = requestAnimationFrame(tick);
  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      try { osc.stop(); } catch (_) {}
      onEnd && onEnd();
    },
  };
}

export function chime() {
  const c = getCtx();
  const t = c.currentTime + 0.02;
  voice(c, 784, t, 0.35, 0.16);
  voice(c, 1047, t + 0.18, 0.55, 0.16);
}

// ---------- מיקרופון ----------
export async function startMic() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const e = new Error("no-media");
    e.name = "NoMedia";
    throw e;
  }
  const c = getCtx();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const source = c.createMediaStreamSource(stream);
  const analyser = c.createAnalyser();
  analyser.fftSize = 4096;
  source.connect(analyser);
  return {
    analyser,
    sampleRate: c.sampleRate,
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      source.disconnect();
    },
  };
}

export function micErrorText(err) {
  if (err && (err.name === "NotAllowedError" || err.name === "SecurityError"))
    return "לא ניתן אישור למיקרופון. אפשר לאשר אותו דרך סמל המנעול בשורת הכתובת, ולנסות שוב.";
  if (err && err.name === "NotFoundError") return "לא נמצא מיקרופון במכשיר.";
  if (err && err.name === "NoMedia") return "הדפדפן הזה לא תומך במיקרופון. אפשר להמשיך בלי השלב הזה.";
  return "לא הצלחנו להפעיל את המיקרופון. אפשר להמשיך בלי השלב הזה.";
}

// ---------- הקראה ----------
export const tts = {
  supported: typeof window !== "undefined" && "speechSynthesis" in window,
  voice: null,
  init() {
    if (!this.supported) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices().filter((v) => /^he/i.test(v.lang) || /hebrew|עברית/i.test(v.name));
      this.voice = voices.find((v) => /asaf|male|google/i.test(v.name)) || voices[0] || null;
    };
    pick();
    speechSynthesis.addEventListener && speechSynthesis.addEventListener("voiceschanged", pick);
  },
  get available() {
    return this.supported && !!this.voice;
  },
  speak(text, { onstart, onend } = {}) {
    if (!this.available) return false;
    this.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = this.voice;
    u.lang = this.voice.lang || "he-IL";
    u.rate = 0.95;
    u.pitch = 1.05;
    u.onstart = () => onstart && onstart();
    u.onend = u.onerror = () => onend && onend();
    speechSynthesis.speak(u);
    return true;
  },
  // הקראה בקטעים קצרים (משפט-משפט): הדפדפנים נוטים לקטוע הקראה ארוכה באמצע
  speakAll(text, { rate = 0.95, onstart, onend } = {}) {
    if (!this.available) return false;
    this.cancel();
    const chunks = text.split(/(?<=[.!?:])\s+/).filter(Boolean);
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk);
      u.voice = this.voice;
      u.lang = this.voice.lang || "he-IL";
      u.rate = rate;
      u.pitch = 1.0;
      u.volume = store.get().speechVolume ?? 1;
      if (i === 0) u.onstart = () => onstart && onstart();
      if (i === chunks.length - 1) u.onend = u.onerror = () => onend && onend();
      speechSynthesis.speak(u);
    });
    return true;
  },
  cancel() {
    if (this.supported) speechSynthesis.cancel();
  },
};

export function setDemoVolume(value) { if (master) master.gain.value = Math.max(0, Math.min(1, value)); }
