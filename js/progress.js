// שמירת התקדמות בדפדפן (localStorage). שום מידע לא נשלח החוצה.

const KEY = "kol-bothe:v1";
const defaults = () => ({ completed: {}, days: [], range: "mid", tts: true, bestExhale: 0 });

let storage = null;
try {
  storage = typeof window !== "undefined" ? window.localStorage : null;
} catch (_) {
  storage = null;
}
let state = null;

export function setStorage(s) {
  storage = s;
  state = null;
}

function load() {
  if (state) return state;
  state = defaults();
  try {
    const raw = storage && storage.getItem(KEY);
    if (raw) state = { ...defaults(), ...JSON.parse(raw) };
  } catch (_) {
    state = defaults();
  }
  return state;
}

export const get = () => load();

export function save(patch) {
  Object.assign(load(), patch);
  try {
    storage && storage.setItem(KEY, JSON.stringify(state));
  } catch (_) {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event("kb:progress"));
}

export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function recordPractice(now = new Date()) {
  const key = dayKey(now);
  const days = load().days;
  if (!days.includes(key)) save({ days: [...days, key].sort() });
}

export function markComplete(id, now = new Date()) {
  save({ completed: { ...load().completed, [id]: now.getTime() } });
  recordPractice(now);
}

// ימים רצופים של תרגול. נספר גם אם עוד לא תרגלתם היום, כל עוד תרגלתם אתמול.
export function streak(days, now = new Date()) {
  const set = new Set(days);
  let d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!set.has(dayKey(d))) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  let n = 0;
  while (set.has(dayKey(d))) {
    n++;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  }
  return n;
}
