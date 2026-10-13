import test from "node:test";
import assert from "node:assert/strict";
import { detectPitch, midiToFreq, freqToMidi, noteName, level } from "../js/pitch.js";
import * as store from "../js/progress.js";

const SR = 44100;
const make = (fn, n = 4096) => Float32Array.from({ length: n }, (_, i) => fn(i / SR));

test("זיהוי גובה של סינוס נקי", () => {
  for (const f of [110, 146.8, 220, 330, 440]) {
    const r = detectPitch(make((t) => 0.3 * Math.sin(2 * Math.PI * f * t)), SR);
    assert.ok(r, `לא זוהה ${f}`);
    assert.ok(Math.abs(r.freq - f) < 0.6, `${f} זוהה כ-${r.freq}`);
  }
});

test("צליל עשיר בהרמוניות לא קופץ אוקטבה", () => {
  const f = 130;
  const r = detectPitch(make((t) => 0.2 * Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * 2 * f * t) + 0.25 * Math.sin(2 * Math.PI * 3 * f * t)), SR);
  assert.ok(r && Math.abs(r.freq - f) < 1, `זוהה ${r && r.freq}`);
});

test("שקט ורעש לא מזוהים כצליל", () => {
  assert.equal(detectPitch(new Float32Array(4096), SR), null);
  let seed = 7;
  const noise = make(() => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 0.4);
  assert.equal(detectPitch(noise, SR), null);
});

test("שמות צלילים וגבהים", () => {
  assert.equal(noteName(69), "לה");
  assert.equal(noteName(60), "דו");
  assert.equal(noteName(61), "דו♯");
  assert.ok(Math.abs(midiToFreq(69) - 440) < 1e-9);
  assert.ok(Math.abs(freqToMidi(220) - 57) < 1e-9);
});

test("רמת עוצמה בטווח 0 עד 1", () => {
  assert.equal(level(0), 0);
  assert.equal(level(1), 1);
  assert.ok(level(0.05) > 0.4 && level(0.05) < 1);
});

test("רצף ימים", () => {
  const d = (s) => new Date(s + "T12:00:00");
  assert.equal(store.streak([], d("2026-10-10")), 0);
  assert.equal(store.streak(["2026-10-10"], d("2026-10-10")), 1);
  assert.equal(store.streak(["2026-10-08", "2026-10-09", "2026-10-10"], d("2026-10-10")), 3);
  assert.equal(store.streak(["2026-10-08", "2026-10-09"], d("2026-10-10")), 2, "אתמול עדיין נחשב");
  assert.equal(store.streak(["2026-10-07"], d("2026-10-10")), 0, "הרצף נשבר");
  assert.equal(store.streak(["2026-09-30", "2026-10-01"], d("2026-10-01")), 2, "מעבר חודש");
});

test("שמירת התקדמות", () => {
  const mem = new Map();
  store.setStorage({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) });
  store.markComplete("intro", new Date("2026-10-10T10:00:00"));
  store.markComplete("breath", new Date("2026-10-11T10:00:00"));
  const s = store.get();
  assert.ok(s.completed.intro && s.completed.breath);
  assert.deepEqual(s.days, ["2026-10-10", "2026-10-11"]);
  store.setStorage({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) });
  assert.ok(store.get().completed.intro, "נטען מחדש מהאחסון");
});

import { narrationFor, spokenText, hashText } from "../js/narration.js";
import { ALL } from "../js/data.js";
import { TASK_TYPES } from "../js/steps.js";

function freshStore() {
  const mem = new Map();
  store.setStorage({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) });
}

test("מטלה מזכה ב-10 נקודות פעם אחת ביום", () => {
  freshStore();
  const d1 = new Date("2026-10-10T10:00:00"), d2 = new Date("2026-10-11T10:00:00");
  assert.equal(store.awardTask("breath:2", d1), 10);
  assert.equal(store.awardTask("breath:2", d1), 0, "אותה מטלה באותו יום");
  assert.equal(store.awardTask("breath:3", d1), 10);
  assert.equal(store.awardTask("breath:2", d2), 10, "ביום אחר מקבלים שוב");
  const s = store.stats(d2);
  assert.equal(s.points, 30);
  assert.equal(s.tasks, 3);
  assert.equal(s.days, 2);
  assert.equal(s.streak, 2);
});

test("חזרות נספרות ביומן היומי", () => {
  freshStore();
  const d = new Date("2026-10-10T10:00:00");
  store.addReps(3, d);
  store.addReps(2, d);
  assert.equal(store.stats(d).reps, 5);
  const last = store.lastDays(3, d);
  assert.equal(last[2].reps, 5);
  assert.equal(last[0].reps, 0);
});

test("רמות ונקודות", () => {
  assert.equal(store.levelFor(0).name, "מתחיל");
  assert.equal(store.levelFor(50).name, "מתחמם");
  assert.equal(store.levelFor(299).name, "מתרגל");
  assert.equal(store.levelFor(5000).name, "אמן הקול");
  assert.equal(store.levelFor(5000).next, null);
  const l = store.levelFor(100);
  assert.ok(l.progress > 0.49 && l.progress < 0.51 && l.toNext === 50);
});

test("שיעורים שהושלמו נספרים פעם אחת לכל שיעור וגם בהרצות חוזרות", () => {
  freshStore();
  store.markComplete("intro", new Date("2026-10-10T10:00:00"));
  store.markComplete("intro", new Date("2026-10-11T10:00:00"));
  const s = store.stats(new Date("2026-10-11T12:00:00"));
  assert.equal(Object.keys(s.completed).length, 1);
  assert.equal(s.runs.intro, 2);
  assert.equal(s.totalRuns, 2);
  assert.equal(store.bestStreak(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-07"]), 3);
});

test("ההקראה כוללת כותרת, הסבר וכל הנקודות, בלי סמלים", () => {
  const step = { title: "כללי זהב", say: "כמה כללים קצרים.", points: ["💧 שותים מים.", "🚫 לא צועקים"] };
  const t = narrationFor(step);
  assert.match(t, /כללי זהב\./);
  assert.match(t, /כמה כללים קצרים\./);
  assert.match(t, /שותים מים\./);
  assert.match(t, /לא צועקים\./);
  assert.doesNotMatch(t, /[\u{1F300}-\u{1FAFF}]/u);
  assert.equal(spokenText({ say: "שלום, אני ר' דוד" }), "שלום, אני רבי דוד.");
  assert.equal(hashText("abc"), hashText("abc"));
  assert.notEqual(hashText("abc"), hashText("abd"));
});

test("כל שלב בקורס מקבל תנועה ויש טקסט להקראה", () => {
  const acts = new Set(["rest","wave","present","point","palm","belly","posture","shoulders","neck","jaw","hum","trill","straw","siren","scale","project","sigh","vowels","cheer"]);
  for (const l of ALL) {
    l.steps.forEach((s, i) => {
      assert.ok(acts.has(s.act), `${l.id}:${i} תנועה לא מוכרת: ${s.act}`);
      assert.ok(spokenText(s).length > 10, `${l.id}:${i} בלי טקסט להקראה`);
    });
    assert.ok(l.steps.some((s) => TASK_TYPES.has(s.t)), `${l.id} בלי משימות`);
  }
});
