// הקראה: הקלטה אנושית אם קיימת לשלב (תיקיית audio), ואחרת הקראה של הדפדפן בקטעים קצרים.
import { tts } from "./audio.js";
import { hashText } from "./narration.js";
import * as store from "./progress.js";

let manifest = null;
let loading = null;
let current = null;

export function loadManifest() {
  if (!loading) {
    loading = fetch("audio/manifest.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((m) => (manifest = m && m.items ? m : { items: {} }));
  }
  return loading;
}

export const hasRecordings = () => !!manifest && Object.keys(manifest.items).length > 0;
export const available = () => hasRecordings() || tts.available;

export function stop() {
  if (current && current.audio) {
    current.audio.onended = current.audio.onerror = current.audio.onplaying = null;
    current.audio.pause();
  }
  current = null;
  tts.cancel();
}

// מחזיר "audio" / "tts" / null לפי מה שנוגן
export async function speak(key, text, { onstart, onend } = {}) {
  stop();
  if (!store.get().tts) return null;
  await loadManifest();
  const my = {};
  current = my;
  const speed = store.get().speed || 1;

  const item = manifest.items[key];
  if (item && item.hash === hashText(text)) {
    const audio = new Audio(`audio/${key}.mp3?v=${item.hash}`);
    audio.playbackRate = speed;
    my.audio = audio;
    let failed = false;
    audio.onplaying = () => onstart && onstart();
    audio.onended = () => onend && onend();
    audio.onerror = () => {
      failed = true;
      onend && onend();
    };
    try {
      await audio.play();
      if (!failed) return "audio";
    } catch (_) {
      onend && onend();
      if (current !== my) return null;
    }
  }
  if (current !== my) return null;
  if (tts.available) {
    tts.speakAll(text, { rate: 0.95 * speed, onstart, onend });
    return "tts";
  }
  return null;
}
