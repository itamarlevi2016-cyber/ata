// נגן השיעורים: דמות, בועת דיבור, תרגיל, והתקדמות שלב אחרי שלב.
import { h } from "./ui.js";
import { createCoach, ACT_LABELS } from "./coach.js";
import { tts } from "./audio.js";
import { RENDERERS, TASK_TYPES } from "./steps.js";
import { RANGES } from "./pitch.js";
import { spokenText, audioKey } from "./narration.js";
import * as voice from "./voice.js";
import * as store from "./progress.js";
import { LESSONS } from "./data.js";

export function mountPlayer(lesson, main, { onExit }) {
  let idx = 0;
  let cleanups = [];
  let alive = true;
  const doneTasks = new Set(); // אינדקסי שלבים שהושלמו בהרצה הזו
  let earned = 0;
  const totalTasks = lesson.steps.filter((s) => TASK_TYPES.has(s.t)).length;

  const dots = h("div", { class: "dots", role: "progressbar", "aria-valuemin": "1", "aria-valuemax": String(lesson.steps.length) }, lesson.steps.map(() => h("i")));
  const bubbleText = h("span", { "aria-live": "polite" });
  const replay = h("button", { class: "replay", title: "שמעו שוב", "aria-label": "השמעה חוזרת", hidden: true }, "🔊");
  const bubble = h("div", { class: "bubble" }, bubbleText, replay);
  const exercise = h("div", { class: "exercise" });
  const prev = h("button", { class: "btn ghost" }, "▶ הקודם");
  const next = h("button", { class: "btn primary big" }, "לשלב הבא ◀");
  const coachHost = h("div", { class: "coach-bg" });
  const caption = h("div", { class: "coach-caption" });
  const mission = h("span", { class: "mission", title: "כל משימה שמסיימים מזכה ב-10 נקודות" }, `⭐ 0/${totalTasks} משימות`);

  const voiceBox = h("div", { class: "voice-box", hidden: true });
  const voiceToggle = h("input", { type: "checkbox" });
  voiceToggle.checked = store.get().tts;
  const speedSel = h("select", { "aria-label": "מהירות הקראה" }, [["0.85", "איטי"], ["1", "רגיל"], ["1.15", "מהיר"]].map(([v, t]) => h("option", { value: v }, t)));
  speedSel.value = String(store.get().speed || 1);
  voiceBox.append(h("label", { class: "toggle" }, voiceToggle, "קריינות"), speedSel);
  voiceToggle.addEventListener("change", () => {
    store.save({ tts: voiceToggle.checked });
    if (!voiceToggle.checked) voice.stop();
    else speak();
  });
  speedSel.addEventListener("change", () => store.save({ speed: Number(speedSel.value) }));
  voice.loadManifest().then(() => {
    if (alive) voiceBox.hidden = !voice.available();
  });

  const root = h(
    "div",
    { class: "wrap player" },
    h("div", { class: "player-top" }, h("button", { class: "back-link", onclick: () => confirmExit() }, "→ יציאה"), h("div", { class: "title" }, `${lesson.icon} ${lesson.title}`), totalTasks > 0 && mission, voiceBox),
    dots,
    h("div", { class: "stage" }, h("div", { class: "coach-wrap" }, coachHost, caption, h("div", { class: "coach-name" }, "ר' דוד, המאמן שלך")), h("div", { class: "main-col" }, bubble, exercise, h("div", { class: "nav-row" }, prev, next)))
  );
  main.replaceChildren(root);
  const coach = createCoach(coachHost);

  function confirmExit() {
    cleanup();
    onExit();
  }
  function cleanup() {
    cleanups.forEach((f) => {
      try { f(); } catch (_) {}
    });
    cleanups = [];
    voice.stop();
  }

  const api = {
    coach,
    rootMidi: () => RANGES[store.get().range].root,
    onCleanup: (fn) => cleanups.push(fn),
    rep: (n = 1) => store.addReps(n),
    task() {
      const stepIdx = idx;
      if (doneTasks.has(stepIdx)) return;
      doneTasks.add(stepIdx);
      const pts = store.awardTask(`${lesson.id}:${stepIdx}`);
      earned += pts;
      mission.textContent = `⭐ ${doneTasks.size}/${totalTasks} משימות`;
      mission.classList.add("pop");
      setTimeout(() => mission.classList.remove("pop"), 900);
      exercise.prepend(
        h("div", { class: `task-badge${pts ? "" : " muted"}` }, pts ? `✓ משימה הושלמה · +${pts} נקודות ⭐` : "✓ משימה הושלמה · כבר קיבלתם נקודות על משימה זו היום")
      );
    },
  };

  let step = lesson.steps[0];
  function speak() {
    const text = spokenText(step);
    coach.talkFor(Math.max(1800, text.length * 62));
    voice.speak(audioKey(lesson.id, idx), text, { onstart: () => coach.startTalk(), onend: () => coach.stopTalk() });
  }

  function show(i) {
    cleanup();
    idx = i;
    step = lesson.steps[i];
    [...dots.children].forEach((d, j) => {
      d.className = j < i ? "on" : j === i ? "now" : "";
    });
    dots.setAttribute("aria-valuenow", String(i + 1));
    exercise.replaceChildren();
    coach.breathe("idle");
    coach.mood(step.mood || "happy");
    const act = step.mood === "cheer" ? "cheer" : step.act || "rest";
    coach.act(act, { dur: step.t === "glide" ? step.secs : 4 });
    caption.textContent = ACT_LABELS[act] ? `מדגים: ${ACT_LABELS[act]}` : "";
    bubbleText.textContent = step.say;
    replay.hidden = !voice.available() && !tts.available;
    replay.onclick = () => speak();
    (RENDERERS[step.t] || RENDERERS.say)(step, exercise, api);
    prev.disabled = i === 0;
    next.textContent = i === lesson.steps.length - 1 ? "סיום השיעור 🎉" : "לשלב הבא ◀";
    speak();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function finish() {
    cleanup();
    store.markComplete(lesson.id);
    const streak = store.streak(store.get().days);
    const nextLesson = LESSONS[LESSONS.findIndex((l) => l.id === lesson.id) + 1];
    [...dots.children].forEach((d) => (d.className = "on"));
    coach.mood("cheer");
    coach.act("cheer");
    caption.textContent = "";
    coach.talkFor(1800);
    bubbleText.textContent = "כל הכבוד! סיימתם עוד שיעור. הקול שלכם אסיר תודה.";
    replay.hidden = true;
    const s = store.stats();
    exercise.replaceChildren(
      h(
        "div",
        { class: "complete" },
        h("div", { class: "big-emoji" }, "🎉"),
        h("h2", null, `סיימתם: ${lesson.title}`),
        h(
          "div",
          { class: "summary" },
          h("div", { class: "sum-tile" }, h("b", null, `${doneTasks.size}/${totalTasks}`), "משימות"),
          h("div", { class: "sum-tile" }, h("b", null, `+${earned}`), "נקודות בשיעור"),
          h("div", { class: "sum-tile" }, h("b", null, String(s.points)), "נקודות בסך הכול")
        ),
        h("p", { class: "muted" }, streak > 1 ? `🔥 ${streak} ימים רצופים של תרגול. ממשיכים ככה!` : "יום ראשון של תרגול. התחלה מצוינת!"),
        totalTasks > doneTasks.size && h("p", { class: "muted" }, "לא כל המשימות הושלמו. אפשר לחזור לשיעור ולהשלים אותן כדי לצבור עוד נקודות."),
        h(
          "div",
          { class: "controls" },
          nextLesson && lesson.id !== "daily" && h("a", { class: "btn primary big", href: `#/lesson/${nextLesson.id}` }, `לשיעור הבא: ${nextLesson.title}`),
          h("a", { class: "btn", href: "#/stats" }, "ההתקדמות שלי"),
          h("button", { class: "btn ghost", onclick: () => (doneTasks.clear(), (earned = 0), (mission.textContent = `⭐ 0/${totalTasks} משימות`), prev.hidden = next.hidden = false, show(0)) }, "לחזור על השיעור")
        )
      )
    );
    prev.hidden = next.hidden = true;
  }

  next.addEventListener("click", () => (idx >= lesson.steps.length - 1 ? finish() : show(idx + 1)));
  prev.addEventListener("click", () => idx > 0 && show(idx - 1));
  const onKey = (e) => {
    if (!alive || e.target.closest("input, textarea, select")) return;
    if (e.key === "ArrowLeft") next.click();
    if (e.key === "ArrowRight") prev.click();
  };
  document.addEventListener("keydown", onKey);

  show(0);
  return () => {
    alive = false;
    document.removeEventListener("keydown", onKey);
    cleanup();
  };
}
