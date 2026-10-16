// שמירת התקדמות בדפדפן (localStorage). שום מידע לא נשלח החוצה.

const KEY = "kol-bothe:v1";
const defaults = () => ({
  positions: {},
  reflections: {},
  lastLesson: null,
  completed: {}, // שיעור -> זמן השלמה אחרון
  runs: {}, // שיעור -> כמה פעמים הושלם
  days: [],
  range: "mid",
  tts: true,
  speed: 1,
  speechVolume: 1,
  demoVolume: .8,
  musicEnabled: true,
  musicVolume: .12,
  bestExhale: 0,
  points: 0,
  reps: 0, // חזרות שבוצעו
  tasks: 0, // משימות שהושלמו (מזכות בנקודות)
  taskDays: {}, // משימה -> היום האחרון שבו קיבלתם עליה נקודות
  log: {}, // יום -> {reps, points, tasks}
});

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
  const s = load();
  save({ completed: { ...s.completed, [id]: now.getTime() }, runs: { ...s.runs, [id]: (s.runs[id] || 0) + 1 } });
  recordPractice(now);
}

export const POINTS_PER_TASK = 10;

function bump(now, field, n) {
  const s = load();
  const key = dayKey(now);
  const day = { reps: 0, points: 0, tasks: 0, ...(s.log[key] || {}) };
  day[field] += n;
  return { ...s.log, [key]: day };
}

// חזרה על תרגיל (סבב נשימה, משפט, צליל וכו')
export function addReps(n = 1, now = new Date()) {
  save({ reps: load().reps + n, log: bump(now, "reps", n) });
  recordPractice(now);
}

// השלמת משימה: 10 נקודות, פעם אחת ביום לכל משימה. מחזיר את מספר הנקודות שנוספו.
export function awardTask(taskKey, now = new Date()) {
  const s = load();
  const today = dayKey(now);
  if (s.taskDays[taskKey] === today) return 0;
  save({
    taskDays: { ...s.taskDays, [taskKey]: today },
    points: s.points + POINTS_PER_TASK,
    tasks: s.tasks + 1,
    log: bump(now, "points", POINTS_PER_TASK),
  });
  const log = { ...load().log };
  log[today] = { ...log[today], tasks: (log[today].tasks || 0) + 1 };
  save({ log });
  recordPractice(now);
  return POINTS_PER_TASK;
}

export const LEVELS = [
  { min: 0, name: "מתחיל", emoji: "🌱" },
  { min: 50, name: "מתחמם", emoji: "🔥" },
  { min: 150, name: "מתרגל", emoji: "🎯" },
  { min: 300, name: "מתמיד", emoji: "🎤" },
  { min: 600, name: "מתרגל מסור", emoji: "🌟" },
  { min: 1000, name: "התמדה מצוינת", emoji: "👑" },
];

export function levelFor(points) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].min) i++;
  const cur = LEVELS[i], next = LEVELS[i + 1] || null;
  const progress = next ? (points - cur.min) / (next.min - cur.min) : 1;
  return { ...cur, next, progress, toNext: next ? next.min - points : 0 };
}

// נתונים ל-N הימים האחרונים (הישן ראשון)
export function lastDays(n = 14, now = new Date()) {
  const log = load().log;
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dayKey(d);
    out.push({ key, date: d, ...{ reps: 0, points: 0, tasks: 0 }, ...(log[key] || {}) });
  }
  return out;
}

export function bestStreak(days) {
  const sorted = [...new Set(days)].sort();
  let best = 0, run = 0, prev = null;
  for (const k of sorted) {
    const d = new Date(k + "T12:00:00");
    run = prev && Math.round((d - prev) / 86400000) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function stats(now = new Date()) {
  const s = load();
  return {
    points: s.points,
    reps: s.reps,
    tasks: s.tasks,
    days: s.days.length,
    streak: streak(s.days, now),
    bestStreak: bestStreak(s.days),
    bestExhale: s.bestExhale,
    completed: s.completed,
    runs: s.runs,
    totalRuns: Object.values(s.runs).reduce((a, b) => a + b, 0),
    level: levelFor(s.points),
  };
}

export function tasksDoneIn(lessonId) {
  return Object.keys(load().taskDays).filter((k) => k.startsWith(`${lessonId}:`)).length;
}

export function reset() {
  state = defaults();
  try {
    storage && storage.setItem(KEY, JSON.stringify(state));
  } catch (_) {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event("kb:progress"));
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

export function savePosition(lessonId, index, tasks = []) {
  save({ lastLesson: lessonId, positions: { ...load().positions, [lessonId]: { index, tasks } } });
}
export function clearPosition(lessonId) {
  const positions = { ...load().positions }; delete positions[lessonId];
  save({ positions, lastLesson: load().lastLesson === lessonId ? null : load().lastLesson });
}
