// נגן השיעורים: דמות, בועת דיבור, תרגיל, והתקדמות שלב אחרי שלב.
import { h } from "./ui.js";
import { createCoach } from "./coach.js";
import { tts } from "./audio.js";
import { RENDERERS } from "./steps.js";
import { RANGES } from "./pitch.js";
import * as store from "./progress.js";
import { LESSONS } from "./data.js";

export function mountPlayer(lesson, main, { onExit }) {
  let idx = 0;
  let cleanups = [];
  let coach = null;
  let alive = true;

  const dots = h("div", { class: "dots", role: "progressbar", "aria-valuemin": "1", "aria-valuemax": String(lesson.steps.length) }, lesson.steps.map(() => h("i")));
  const bubbleText = h("span", { "aria-live": "polite" });
  const replay = h("button", { class: "replay", title: "שמעו שוב", "aria-label": "השמעה חוזרת", hidden: true }, "🔊");
  const bubble = h("div", { class: "bubble" }, bubbleText, replay);
  const exercise = h("div", { class: "exercise" });
  const prev = h("button", { class: "btn ghost" }, "▶ הקודם");
  const next = h("button", { class: "btn primary big" }, "לשלב הבא ◀");
  const coachHost = h("div", { class: "coach-bg" });
  const voice = h("label", { class: "toggle", hidden: !tts.available }, h("input", { type: "checkbox", checked: store.get().tts }), "קריינות");
  voice.querySelector("input").addEventListener("change", (e) => {
    store.save({ tts: e.target.checked });
    if (!e.target.checked) tts.cancel();
  });

  const root = h(
    "div",
    { class: "wrap player" },
    h("div", { class: "player-top" }, h("button", { class: "back-link", onclick: () => confirmExit() }, "→ יציאה"), h("div", { class: "title" }, `${lesson.icon} ${lesson.title}`), voice),
    dots,
    h("div", { class: "stage" }, h("div", { class: "coach-wrap" }, coachHost, h("div", { class: "coach-name" }, "ר' דוד, המאמן שלך")), h("div", { class: "main-col" }, bubble, exercise, h("div", { class: "nav-row" }, prev, next)))
  );
  main.replaceChildren(root);
  coach = createCoach(coachHost);

  function confirmExit() {
    cleanup();
    onExit();
  }
  function cleanup() {
    cleanups.forEach((f) => {
      try { f(); } catch (_) {}
    });
    cleanups = [];
    tts.cancel();
  }

  const api = {
    coach: null,
    rootMidi: () => RANGES[store.get().range].root,
    onCleanup: (fn) => cleanups.push(fn),
  };

  function speak(text) {
    const est = Math.max(1500, text.length * 62);
    coach.talkFor(est);
    if (store.get().tts && tts.available) {
      tts.speak(text, { onstart: () => coach.startTalk(), onend: () => coach.stopTalk() });
    }
  }

  function show(i) {
    cleanup();
    idx = i;
    const step = lesson.steps[i];
    [...dots.children].forEach((d, j) => {
      d.className = j < i ? "on" : j === i ? "now" : "";
    });
    dots.setAttribute("aria-valuenow", String(i + 1));
    exercise.replaceChildren();
    api.coach = coach;
    coach.breathe("idle");
    coach.mood(step.mood || "happy");
    bubbleText.textContent = step.say;
    replay.hidden = !tts.available;
    replay.onclick = () => speak(step.say);
    (RENDERERS[step.t] || RENDERERS.say)(step, exercise, api);
    prev.disabled = i === 0;
    next.textContent = i === lesson.steps.length - 1 ? "סיום השיעור 🎉" : "לשלב הבא ◀";
    speak(step.say);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function finish() {
    cleanup();
    store.markComplete(lesson.id);
    const streak = store.streak(store.get().days);
    const nextLesson = LESSONS[LESSONS.findIndex((l) => l.id === lesson.id) + 1];
    [...dots.children].forEach((d) => (d.className = "on"));
    coach.mood("cheer");
    coach.talkFor(1800);
    bubbleText.textContent = "כל הכבוד! סיימתם עוד שיעור. הקול שלכם אסיר תודה.";
    replay.hidden = true;
    exercise.replaceChildren(
      h(
        "div",
        { class: "complete" },
        h("div", { class: "big-emoji" }, "🎉"),
        h("h2", null, `סיימתם: ${lesson.title}`),
        h("p", { class: "muted" }, streak > 1 ? `🔥 ${streak} ימים רצופים של תרגול. ממשיכים ככה!` : "יום ראשון של תרגול. התחלה מצוינת!"),
        h(
          "div",
          { class: "controls" },
          nextLesson && lesson.id !== "daily" && h("a", { class: "btn primary big", href: `#/lesson/${nextLesson.id}` }, `לשיעור הבא: ${nextLesson.title}`),
          h("a", { class: "btn", href: "#/course" }, "לכל השיעורים"),
          h("button", { class: "btn ghost", onclick: () => show(0) }, "לחזור על השיעור")
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
