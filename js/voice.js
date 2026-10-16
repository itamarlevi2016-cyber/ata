// הקראה: הקלטה אנושית אם קיימת לשלב (תיקיית audio), ואחרת הקראה של הדפדפן בקטעים קצרים.
import { tts } from "./audio.js";
import { hashText } from "./narration.js";
import * as store from "./progress.js";

let manifest = null;
let loading = null;
let current = null;
let generation = 0;
let cedar = null;
let cedarLoading = null;
export function loadCedar() {
  if (!cedarLoading) cedarLoading = fetch("audio/cedar-map.json", { cache: "no-cache" })
    .then(r => r.ok ? r.json() : {})
    .catch(() => ({})).then(m => { cedar = m; return m; });
  return cedarLoading;
}
function monitorLevel(audio, onlevel) {
  if (!onlevel) return () => {};
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return () => {};
  let ctx, src, analyser, raf = 0, ended = false;
  try {
    ctx = new AC(); src = ctx.createMediaElementSource(audio); analyser = ctx.createAnalyser();
    analyser.fftSize = 1024; analyser.smoothingTimeConstant = .68;
    src.connect(analyser); analyser.connect(ctx.destination);
    const values = new Uint8Array(analyser.fftSize);
    const tick = () => {
      if (ended) return;
      analyser.getByteTimeDomainData(values);
      let sum = 0;
      for (let i=0; i<values.length; i+=2) { const v=(values[i]-128)/128; sum+=v*v; }
      onlevel(Math.min(1, Math.sqrt(sum/(values.length/2))*7));
      raf = requestAnimationFrame(tick);
    };
    ctx.resume().catch(()=>{}); tick();
  } catch (_) { /* audio remains available */ }
  return () => {
    ended = true; cancelAnimationFrame(raf); onlevel(0);
    try { src?.disconnect(); analyser?.disconnect(); ctx?.close(); } catch (_) {}
  };
}

export function loadManifest() {
  if (!loading) {
    loading = fetch("audio/manifest.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((m) => (manifest = m && m.items ? m : { items: {} }));
  }
  return loading;
}

export async function transcriptFor(key, text) {
  const records = await loadCedar();
  if (text != null && records?.[key]?.contentHash !== hashText(text)) return null;
  return typeof records?.[key]?.script === "string" ? records[key].script : null;
}

export const hasRecordings = () => Object.keys(cedar || {}).length > 0 || (!!manifest && Object.keys(manifest.items || {}).length > 0);
export const available = () => hasRecordings() || tts.available;

export function stop() {
  generation++;
  current?.monitor?.();
  if (current && current.audio) {
    current.audio.onended = current.audio.onerror = current.audio.onplaying = null;
    current.audio.pause();
  }
  current = null;
  tts.cancel();
}

// מחזיר "audio" / "tts" / null לפי מה שנוגן
export async function speak(key, text, { onstart, onend, onlevel } = {}) {
  stop();
  const request = generation;
  if (!store.get().tts) return null;
  await Promise.all([loadManifest(), loadCedar()]);
  if (request !== generation) return null;
  const my = {};
  current = my;
  const speed = store.get().speed || 1;

  const item = manifest.items[key];
  const candidate = cedar?.[key];
  const generated = candidate?.contentHash === hashText(text) ? candidate : null;
  const source = generated ? `audio/${generated.file}${generated.audioHash ? "?v=" + generated.audioHash.slice(0,16) : ""}` : (item && item.hash === hashText(text) ? `audio/${key}.mp3?v=${item.hash}` : null);
  if (source) {
    const audio = new Audio(source);
    audio.playbackRate = speed;
    audio.volume = store.get().speechVolume ?? 1;
    my.audio = audio;
    let failed = false;
    const done = () => {
      if (current !== my) return;
      my.monitor?.(); my.monitor = null;
      current = null;
      onend?.();
    };
    audio.onplaying = () => {
      if (current !== my) return;
      onstart?.("audio");
      if (!my.monitor) my.monitor = monitorLevel(audio, onlevel);
    };
    audio.onended = done;
    audio.onerror = () => { failed = true; done(); };
    try {
      await audio.play();
      if (!failed) return "audio";
    } catch (_) {
      // Autoplay may be blocked: do not silently swap to another voice.
      if (current === my) {
        my.monitor?.();
        current = null;
        onend?.();
      }
      return null;
    }
  }
  if (current !== my) return null;
  if (tts.available) {
    tts.speakAll(text, { rate: 0.95 * speed, onstart: () => onstart?.("tts"), onend: () => { if (current === my) { current = null; onend?.(); } } });
    return "tts";
  }
  if (current === my) { current = null; onend?.(); }
  return null;
}

export function pause() {
  if (!current) return false;
  if (current.audio) current.audio.pause();
  else if (tts.supported) window.speechSynthesis.pause();
  current.paused = true;
  return true;
}
export async function resume() {
  if (!current?.paused) return false;
  if (current.audio) { try { await current.audio.play(); } catch (_) { return false; } }
  else if (tts.supported) window.speechSynthesis.resume();
  current.paused = false;
  return true;
}

export function setVolume(value) { if (current?.audio) current.audio.volume = Math.max(0, Math.min(1, value)); }
