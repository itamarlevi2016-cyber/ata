import * as store from "./progress.js";
// משפטים מוקלטים של ר' דוד — השמעה לפי בחירת המשתמש, ללא שירות חיצוני.
const AUDIO_VERSION = "936371c5723e0fdd";
export const LINES = [
  { id: 'greeting', title: 'שלום וברוכים הבאים', file: 'greeting.mp3' },
  { id: 'foundations', title: 'ראשית, נתחיל מהיסודות', file: 'foundations.mp3' },
  { id: 'principle', title: 'יסוד גדול בעבודת השם', file: 'principle.mp3' },
  { id: 'reflection', title: 'אז מה אנחנו לומדים מכאן?', file: 'reflection.mp3' },
  { id: 'morning', title: 'בוקר טוב לכולם', file: 'morning.mp3' },
  { id: 'attention', title: 'שימו לב, אנחנו מתחילים עכשיו', file: 'attention.mp3' },
  { id: 'progress', title: 'יפה מאוד, התקדמנו שלב נוסף', file: 'progress.mp3' },
  { id: 'review', title: 'עכשיו נחזור על הנקודה החשובה', file: 'review.mp3' },
  { id: 'reassure', title: 'אל תדאגו, נעבור על זה שוב', file: 'reassure.mp3' },
  { id: 'together', title: 'בעזרת השם, נצליח להתקדם יחד', file: 'together.mp3' },
];
let active = null;
let activeMonitor = null;
// ניתוח מקומי של עוצמת הדיבור: אין העלאת שמע לשרת.
function monitorAudio(audio, onlevel) {
  if (!onlevel) return () => {};
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return () => {};
  let ctx, source, analyser, raf = 0, ended = false;
  try {
    ctx = new AC();
    source = ctx.createMediaElementSource(audio);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.66;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    const data = new Uint8Array(analyser.fftSize);
    let smooth = 0;
    const tick = () => {
      if (ended) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 2) {
        const x = (data[i] - 128) / 128;
        sum += x * x;
      }
      const rms = Math.sqrt(sum / (data.length / 2));
      smooth = 0.5 * smooth + 0.5 * Math.min(1, rms * 7);
      onlevel(smooth);
      raf = requestAnimationFrame(tick);
    };
    ctx.resume().catch(() => {});
    tick();
  } catch (_) {
    // אם ניתוח שמע אינו זמין, משאירים את הנגן פעיל ללא ניתוח.
  }
  return () => {
    ended = true;
    cancelAnimationFrame(raf);
    onlevel(0);
    try { source?.disconnect(); analyser?.disconnect(); } catch (_) {}
    try { ctx?.close(); } catch (_) {}
  };
}
export function stopLine() {
  if (activeMonitor) { activeMonitor(); activeMonitor = null; }
  if (active) { active.pause(); active.onended = active.onerror = active.onplaying = null; active = null; }
}
export function playLine(id, { speed = 1, onstart, onend, onlevel } = {}) {
  const line = LINES.find((x) => x.id === id);
  if (!line) return Promise.resolve(false);
  stopLine();
  const audio = new Audio(`audio/recordings/${line.file}?v=${AUDIO_VERSION}`);
  active = audio;
  audio.playbackRate = speed;
  audio.volume = store.get().speechVolume ?? 1;
  audio.onplaying = () => { if (active === audio) { onstart?.(); if (!activeMonitor) activeMonitor = monitorAudio(audio, onlevel); } };
  const finish = () => { if (active === audio) { if (activeMonitor) { activeMonitor(); activeMonitor = null; } active = null; onend?.(); } };
  audio.onended = finish;
  audio.onerror = finish;
  return audio.play().then(() => true).catch(() => { finish(); return false; });
}

export function pauseLine() { if (!active) return false; active.pause(); return true; }
export async function resumeLine() { if (!active) return false; try { await active.play(); return true; } catch (_) { return false; } }

export function setLineVolume(value) { if (active) active.volume = Math.max(0, Math.min(1, value)); }
