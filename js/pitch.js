// זיהוי גובה צליל וכלי עזר מוזיקליים. בלי תלות בדפדפן, כדי שאפשר יהיה לבדוק ב-Node.

export const NOTE_NAMES = ["דו", "דו♯", "רה", "רה♯", "מי", "פה", "פה♯", "סול", "סול♯", "לה", "לה♯", "סי"];

// נקודת מוצא נוחה לכל טווח קול (מספר MIDI): לה2, מי3, לה3
export const RANGES = {
  low: { label: "קול נמוך", desc: "עמוק וחם", root: 45 },
  mid: { label: "קול בינוני", desc: "הכי נפוץ", root: 52 },
  high: { label: "קול גבוה", desc: "בהיר וקליל", root: 57 },
};

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const noteName = (midi) => NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12];
export const isNatural = (midi) => !noteName(midi).includes("♯");

export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

// רמת עוצמה יחסית, 0 עד 1 (dBFS מ-60- עד 10-), עם הסטה אופציונלית ברגישות
export function level(rmsValue, gainDb = 0) {
  const db = 20 * Math.log10(rmsValue + 1e-9) + gainDb;
  return Math.max(0, Math.min(1, (db + 60) / 50));
}

// קורלציה עצמית מנורמלת. מחזיר {freq, clarity} או null אם אין צליל ברור.
export function detectPitch(buf, sampleRate, opts = {}) {
  const { minHz = 70, maxHz = 700, minClarity = 0.8, minRms = 0.008 } = opts;
  const n = buf.length;
  if (rms(buf) < minRms) return null;

  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(Math.ceil(sampleRate / minHz), Math.floor(n / 2) - 2);
  const W = n - maxLag - 2;
  if (W < 256) return null;

  let e0 = 0;
  for (let i = 0; i < W; i++) e0 += buf[i] * buf[i];
  const start = minLag - 1;
  let eLag = 0;
  for (let i = 0; i < W; i++) eLag += buf[i + start] * buf[i + start];

  const corr = new Float32Array(maxLag + 2);
  for (let lag = start; lag <= maxLag + 1; lag++) {
    let r = 0;
    for (let i = 0; i < W; i++) r += buf[i] * buf[i + lag];
    corr[lag] = r / Math.sqrt(e0 * eLag + 1e-12);
    // מעבר ל-lag הבא: מעדכנים את אנרגיית החלון המוזז
    eLag += buf[lag + W] * buf[lag + W] - buf[lag] * buf[lag];
  }

  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) if (corr[lag] > best) best = corr[lag];
  if (best < minClarity) return null;

  // הפסגה הראשונה (הקצרה ביותר) שקרובה לטובה ביותר, כדי להימנע מקפיצות אוקטבה
  let pick = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (corr[lag] >= 0.93 * best && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) {
      pick = lag;
      break;
    }
  }
  if (pick < 0) return null;

  const a = corr[pick - 1], b = corr[pick], c = corr[pick + 1];
  const d = a - 2 * b + c;
  const shift = d !== 0 ? (0.5 * (a - c)) / d : 0;
  return { freq: sampleRate / (pick + shift), clarity: best };
}
