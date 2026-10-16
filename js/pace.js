// חישובי קצב דיבור: פירוק טקסט למילים והפסקות, מילים לדקה, אזורי קצב,
// וניתוח הקלטה לדיבור ושקט. אין כאן גישה למיקרופון; הכול פונקציות טהורות.

// טווחי קצב (מילים לדקה בעברית). להסבר לתלמידים צעירים מכוונים לאזור "שיעור".
export const PACE_ZONES = [
  { max: 90, key: "slow", label: "איטי מאוד", note: "מתאים להקראת מקור או למשפט מפתח, לא לשיעור שלם." },
  { max: 130, key: "teach", label: "קצב שיעור", note: "התלמידים מספיקים להבין ולרשום. זה היעד." },
  { max: 160, key: "talk", label: "קצב שיחה", note: "טוב לשיחה בין חברים, מהיר מדי להסבר של רעיון חדש." },
  { max: Infinity, key: "fast", label: "מהיר", note: "המילים רודפות זו את זו. חלק מהתלמידים מאבדים את החוט." },
];

export function paceZone(wpm) {
  return PACE_ZONES.find((z) => wpm < z.max) || PACE_ZONES[PACE_ZONES.length - 1];
}

// מפרק טקסט לפריטים: {w: "מילה"} או {pause: 1|2} עבור "/" ו-"//".
export function tokenize(text) {
  const out = [];
  for (const raw of text.split(/\s+/)) {
    if (!raw) continue;
    if (raw === "//") out.push({ pause: 2 });
    else if (raw === "/") out.push({ pause: 1 });
    else out.push({ w: raw.replace(/\*/g, "") });
  }
  return out;
}

export const wordCount = (text) => tokenize(text).filter((t) => t.w).length;

// מילים לדקה מתוך מספר מילים וזמן בשניות.
export function wpmFor(words, seconds) {
  if (!seconds || seconds <= 0) return 0;
  return Math.round(words / (seconds / 60));
}

// משך ההצגה של פריט בסמן הקריאה, במילישניות, לפי קצב היעד.
// הפסקה קצרה שווה לשתי מילים, הפסקה ארוכה לארבע.
export function itemMs(item, wpm) {
  const word = 60000 / Math.max(40, wpm);
  if (item.pause) return word * (item.pause === 2 ? 4 : 2);
  // מילים ארוכות מקבלות מעט יותר זמן, כדי שהסמן ירגיש טבעי.
  return word * (item.w.length > 7 ? 1.3 : item.w.length < 3 ? 0.8 : 1);
}

// ניתוח רצף של עוצמות (RMS) שנדגמו במרווח קבוע.
// מחזיר קטעי דיבור ושקט, מספר ההפסקות (שקט של minPause שניות ומעלה בין דיבור לדיבור),
// ההפסקה הארוכה ביותר וחלק הזמן שבו דיברו.
export function analyzeSpeech(frames, { intervalMs = 50, threshold = 0.02, minPause = 0.6, minSpeech = 0.15 } = {}) {
  const total = frames.length * intervalMs / 1000;
  const segs = [];
  let cur = null;
  frames.forEach((v, i) => {
    const on = v > threshold;
    const t = i * intervalMs / 1000;
    if (!cur || cur.on !== on) {
      cur = { on, start: t, end: t + intervalMs / 1000 };
      segs.push(cur);
    } else cur.end = t + intervalMs / 1000;
  });
  // רעשים קצרים מאוד נחשבים שקט, ושקט קצר מאוד נחשב דיבור.
  // מאחדים כמה פעמים, כי היפוך של קטע קצר יכול ליצור שכנים קצרים חדשים.
  let merged = segs;
  for (let pass = 0; pass < 4; pass++) {
    const next = [];
    for (const s of merged) {
      const len = s.end - s.start;
      const flip = (s.on && len < minSpeech) || (!s.on && len < minPause);
      const on = flip ? !s.on : s.on;
      const last = next[next.length - 1];
      if (last && last.on === on) last.end = s.end;
      else next.push({ on, start: s.start, end: s.end });
    }
    const stable = next.length === merged.length;
    merged = next;
    if (stable) break;
  }
  const speech = merged.filter((s) => s.on);
  const speaking = speech.reduce((a, s) => a + (s.end - s.start), 0);
  // הפסקה נספרת רק בין שני קטעי דיבור, לא בתחילת ההקלטה ולא בסופה.
  const inner = merged.filter((s, i) => !s.on && i > 0 && i < merged.length - 1);
  const pauses = inner.length;
  const longest = inner.reduce((m, s) => Math.max(m, s.end - s.start), 0);
  return { total, segments: merged, speaking, pauses, longestPause: longest, ratio: total ? speaking / total : 0 };
}
