// ניווט ועמודי האתר.
import { h, $ } from "./ui.js";
import * as store from "./progress.js";
import { LESSONS, getLesson } from "./data.js";
import { createCoach } from "./coach.js";
import { tts, playSequence } from "./audio.js";
import { mountPlayer } from "./player.js";
import { createMeter } from "./meter.js";
import { midiToFreq, noteName } from "./pitch.js";
import { TASK_TYPES } from "./steps.js";

import {pageKnowledge} from "./knowledge.js";
import {mountMusic} from "./music.js";

tts.init();
const backgroundMusic = mountMusic(document.body);
const main = $("#main");
let teardown = null;

// ---------- כותרת: רצף ימים ----------
function updateStreak() {
  const el = $("#streak");
  const n = store.streak(store.get().days);
  el.hidden = n === 0;
  el.textContent = `🔥 ${n} ${n === 1 ? "יום" : "ימים"} ברצף`;
  const pts = store.get().points;
  const chip = $("#points");
  chip.hidden = pts === 0;
  chip.textContent = `⭐ ${pts}`;
}
window.addEventListener("kb:progress", updateStreak);

// ---------- בית ----------
function home() {
  const done = store.get().completed;
  const nextLesson = LESSONS.find((l) => !done[l.id]) || LESSONS[LESSONS.length - 1];
  const resume = store.get().positions?.[store.get().lastLesson] ? getLesson(store.get().lastLesson) : null;
  const started = Object.keys(done).length > 0;
  const hello = h("div", { class: "bubble hello-bubble" }, "שלום וברכה! אני ר' דוד. בואו נחמם את הקול יחד 🎵");
  const heroBtn = h("a", { class: "btn primary big", href: `#/lesson/${resume ? resume.id : started ? nextLesson.id : "intro"}` }, resume ? `המשיכו מהמקום שעצרתם: ${resume.title}` : started ? `המשיכו לשיעור הבא: ${nextLesson.title}` : "מתחילים את השיעור הראשון");
  const hero = h(
    "section",
    { class: "hero" },
    h(
      "div",
      { class: "wrap" },
      h(
        "div",
        null,
        h("h1", null, "קול ברור ובטוח, ", h("span", null, "לכל דובר")),
        h("p", { class: "lead" }, "תרגילי קול קצרים וידידותיים, שלב אחרי שלב, עם ר' דוד שמלווה אתכם. מתאים לכל מי שמדבר מול אנשים."),
        h("div", { class: "hero-cta" }, heroBtn, h("a", { class: "btn big", href: "#/lesson/daily" }, "☀️ תרגול יומי של 5 דקות")),
        h("div", { class: "hero-note" }, h("span", null, "✓ חינם"), h("span", null, "✓ בעברית"), h("span", null, "✓ ישר מהדפדפן, בלי הרשמה"))
      ),
      h("div", null, h("div", { class: "hero-stage" }, hello))
    )
  );
  const hostNode = hero.querySelector(".hero-stage");
  const coachHost = h("div");
  hostNode.append(coachHost);
  const coach = createCoach(coachHost);
  coach.mood("cheer");
  coach.act("rest");
  

  const how = h(
    "section",
    { class: "block" },
    h(
      "div",
      { class: "wrap" },
      h("div", { class: "section-head" }, h("h2", null, "איך זה עובד?"), h("p", null, "מתרגלים כמה דקות בקצב אישי, ללא לחץ.")),
      h(
        "div",
        { class: "steps3" },
        card("👨‍🏫", "ר' דוד מדריך אתכם", "בכל שלב ר' דוד מסביר ומדגים, ואפשר גם להאזין לו בקול."),
        card("🎧", "מתרגלים בקצב שלכם", "נשימה מודרכת, צלילים להדגמה וטיימרים. אפשר לעצור וללכת אחורה בכל רגע."),
        card("📈", "רואים התקדמות", "הצלילים שלכם מוצגים על המסך בזמן אמת, ורצף הימים שומר על המוטיבציה.")
      )
    )
  );

  const daily = h(
    "section",
    { class: "block", style: "padding-top:0" },
    h(
      "div",
      { class: "wrap" },
      h(
        "div",
        { class: "daily-card" },
        h("div", { class: "big-emoji" }, "☀️"),
        h("div", null, h("h2", null, "התרגול היומי"), h("p", null, "חימום של חמש דקות: נשימה, רטט שפתיים, סירנה, סולם ודיקציה. הכי טוב לעשות לפני כל דיבור.")),
        h("a", { class: "btn big", href: "#/lesson/daily" }, "מתחילים")
      )
    )
  );

  const course = h(
    "section",
    { class: "block alt" },
    h("div", { class: "wrap" }, h("div", { class: "section-head" }, h("h2", null, "המסלול המלא"), h("p", null, `${LESSONS.length} שיעורים קצרים, מהיסודות ועד הבמה. מומלץ ללכת לפי הסדר.`)), lessonGrid())
  );

  const faq = h(
    "section",
    { class: "block" },
    h(
      "div",
      { class: "wrap narrow faq" },
      h("div", { class: "section-head" }, h("h2", null, "שאלות נפוצות")),
      qa("האתר באמת חינמי?", "כן, לגמרי. בלי הרשמה ובלי תשלום."),
      qa("האם ההקלטה שלי נשמרת או נשלחת?", "לא. המיקרופון משמש רק להצגת הצליל על המסך, והכול קורה בדפדפן שלכם. שום דבר לא נשמר ולא נשלח."),
      qa("כמה זמן צריך להקדיש?", "חמש עד עשר דקות ביום מספיקות. עקביות חשובה יותר מכמות."),
      qa("אפשר מהטלפון?", "כן, האתר מותאם גם לטלפון ולטאבלט."),
      qa("מה עושים אם כואב בגרון?", "עוצרים ונחים. אם צרידות נמשכת יותר משבועיים, כדאי לפנות לרופא אף אוזן גרון."),
      qa("האם האתר מחליף טיפול מקצועי?", "לא. האתר מיועד לתרגול והדרכה כלליים. אם יש כאב, צרידות ממושכת או קושי מיוחד, כדאי לפנות לאיש מקצוע.")
    )
  );
  main.replaceChildren(hero, how, daily, course, faq);
}

const card = (emoji, title, text) => h("div", { class: "card" }, h("span", { class: "emoji" }, emoji), h("h3", null, title), h("p", null, text));
const qa = (q, a) => h("details", null, h("summary", null, q), h("p", null, a));

function lessonGrid() {
  const done = store.get().completed;
  return h(
    "div",
    { class: "lessons" },
    LESSONS.map((l, i) =>
      h(
        "a",
        { class: `lesson-card${done[l.id] ? " done" : ""}`, href: `#/lesson/${l.id}` },
        h("span", { class: "num" }, String(i + 1)),
        h("span", { class: "icon" }, l.icon),
        h("h3", null, l.title),
        h("p", null, l.subtitle),
        h("div", { class: "meta" }, `⏱ ${l.minutes} דקות`, done[l.id] && h("span", { class: "badge-done" }, "✓ הושלם"))
      )
    )
  );
}

// ---------- קורס ----------
function course() {
  const done = store.get().completed;
  const count = LESSONS.filter((l) => done[l.id]).length;
  main.replaceChildren(
    h(
      "div",
      { class: "wrap page" },
      h("h1", { class: "page-title" }, "הקורס"),
      h("p", { class: "page-sub" }, `${LESSONS.length} שיעורים קצרים. כל אחד לוקח כמה דקות.`),
      h("div", { class: "progress-summary" }, h("span", { class: "pill" }, `✓ ${count} מתוך ${LESSONS.length} שיעורים`), h("a", { class: "btn small", href: "#/lesson/daily" }, "☀️ תרגול יומי")),
      lessonGrid()
    )
  );
}

// ---------- ההתקדמות שלי ----------
function stats() {
  const s = store.stats();
  const done = LESSONS.filter((l) => s.completed[l.id]).length;
  const lv = s.level;
  const days = store.lastDays(14);
  const maxPts = Math.max(30, ...days.map((d) => d.points));
  const weekday = (d) => d.toLocaleDateString("he-IL", { weekday: "narrow" });

  const tile = (emoji, value, label, sub) => h("div", { class: "stat-tile" }, h("span", { class: "emoji" }, emoji), h("b", null, String(value)), h("span", { class: "lbl" }, label), sub && h("span", { class: "sub" }, sub));

  const chart = h(
    "div",
    { class: "chart", role: "img", "aria-label": "נקודות בארבעה עשר הימים האחרונים" },
    days.map((d) => h("div", { class: "bar-col", title: `${d.date.toLocaleDateString("he-IL")}: ${d.points} נקודות, ${d.reps} חזרות` }, h("div", { class: "bar-val" }, d.points ? String(d.points) : ""), h("div", { class: "bar", style: `height:${Math.round((d.points / maxPts) * 100)}%` }), h("div", { class: "bar-lbl" }, weekday(d.date))))
  );

  const rows = LESSONS.map((l, i) => {
    const total = l.steps.filter((x) => TASK_TYPES.has(x.t)).length;
    const got = Math.min(total, store.tasksDoneIn(l.id));
    const runs = s.runs[l.id] || 0;
    return h(
      "a",
      { class: "lesson-row", href: `#/lesson/${l.id}` },
      h("span", { class: "icon" }, l.icon),
      h("div", { class: "grow" }, h("div", { class: "t" }, `${i + 1}. ${l.title}`), h("div", { class: "bar-h" }, h("i", { style: `width:${total ? Math.round((got / total) * 100) : 0}%` })), h("div", { class: "muted small-t" }, `משימות: ${got}/${total}${runs ? ` · הושלם ${runs} ${runs === 1 ? "פעם" : "פעמים"}` : " · עוד לא הושלם"}`)),
      s.completed[l.id] ? h("span", { class: "badge-done" }, "✓") : h("span", { class: "muted" }, "›")
    );
  });

  const resetBtn = h("button", { class: "btn ghost small" }, "איפוס כל הנתונים");
  resetBtn.addEventListener("click", () => {
    if (confirm("למחוק את כל ההתקדמות, הנקודות והסטטיסטיקה? אי אפשר לבטל.")) {
      store.reset();
      stats();
    }
  });

  main.replaceChildren(
    h(
      "div",
      { class: "wrap page" },
      h("h1", { class: "page-title" }, "ההתקדמות שלי"),
      h("p", { class: "page-sub" }, "הנקודות משקפות השתתפות והתמדה, ולא מדידה של איכות הקול. אישור תרגול מזכה ב-10 נקודות, פעם אחת ביום לכל משימה."),
      h(
        "div",
        { class: "level-card" },
        h("div", { class: "level-emoji" }, lv.emoji),
        h(
          "div",
          { class: "grow" },
          h("div", { class: "level-name" }, lv.name),
          h("div", { class: "bar-h big" }, h("i", { style: `width:${Math.round(lv.progress * 100)}%` })),
          h("div", { class: "muted" }, lv.next ? `עוד ${lv.toNext} נקודות לרמה "${lv.next.name}"` : "הגעתם לרמה הגבוהה ביותר!")
        ),
        h("div", { class: "level-points" }, h("b", null, String(s.points)), "נקודות")
      ),
      h(
        "div",
        { class: "stat-grid" },
        tile("📚", `${done}/${LESSONS.length}`, "שיעורים שהגעתם לסופם", s.totalRuns ? `${s.totalRuns} השלמות בסך הכול` : ""),
        tile("🔁", s.reps, "חזרות על תרגילים"),
        tile("✅", s.tasks, "משימות שהושלמו", `${s.tasks * 10} נקודות`),
        tile("🔥", s.streak, "ימים ברצף", s.bestStreak ? `שיא: ${s.bestStreak}` : ""),
        tile("📅", s.days, "ימי תרגול"),
        tile("🌬️", s.bestExhale ? s.bestExhale.toFixed(1) : "—", "משך נשיפה מרבי שתועד")
      ),
      h("div", { class: "card", style: "margin-top:18px" }, h("h3", null, "נקודות ב-14 הימים האחרונים"), chart),
      h("div", { class: "card", style: "margin-top:18px" }, h("h3", null, "השיעורים"), h("div", { class: "lesson-rows" }, rows)),
      h("div", { class: "controls", style: "margin-top:18px" }, resetBtn)
    )
  );
}

// ---------- כלים ----------
function tools() {
  const holder = h("div");
  const meter = createMeter(holder, { show: "both", rootMidi: 52 });
  let base = 48;
  const keys = h("div", { class: "keys" });
  const octBtns = [["נמוך", 36], ["בינוני", 48], ["גבוה", 60]].map(([label, m]) => {
    const b = h("button", { class: `btn small${m === base ? "" : " ghost"}`, type: "button" }, label);
    b.addEventListener("click", () => {
      base = m;
      octBtns.forEach((x, i) => x.classList.toggle("ghost", [36, 48, 60][i] !== m));
      drawKeys();
    });
    return b;
  });
  function drawKeys() {
    keys.replaceChildren(
      ...Array.from({ length: 13 }, (_, i) => {
        const m = base + i;
        const k = h("button", { class: `key${noteName(m).includes("♯") ? " sharp" : ""}`, type: "button" }, noteName(m), h("small", null, `${Math.round(midiToFreq(m))} הרץ`));
        k.addEventListener("click", () => playSequence([m], { noteDur: 1.2 }));
        return k;
      })
    );
  }
  drawKeys();
  main.replaceChildren(
    h(
      "div",
      { class: "wrap page" },
      h("h1", { class: "page-title" }, "כלים"),
      h("p", { class: "page-sub" }, "כלים חופשיים לתרגול. הכול עובד בדפדפן, בלי להקליט."),
      h(
        "div",
        { class: "tool-grid" },
        h("div", { class: "card" }, h("h3", null, "🎙️ מד קול"), h("p", { class: "muted" }, "מציג את הצליל שלכם בזמן אמת: איזה צליל זה, כמה הוא יציב, וכמה הוא חזק. עדיף עם אוזניות."), holder),
        h("div", { class: "card" }, h("h3", null, "🎹 צלילי ייחוס"), h("p", { class: "muted" }, "לחצו על צליל כדי לשמוע אותו, ונסו להמהם יחד איתו."), h("div", { class: "controls", style: "margin:0 0 14px" }, octBtns), keys)
      )
    )
  );
  return () => meter.destroy();
}

// ---------- בריאות הקול ----------
function health() {
  const sec = (emoji, title, items) => h("div", { class: "card" }, h("span", { class: "emoji" }, emoji), h("h3", null, title), h("ul", null, items.map((i) => h("li", null, i))));
  main.replaceChildren(
    h(
      "div",
      { class: "wrap page" },
      h("h1", { class: "page-title" }, "שמירה על הקול"),
      h("p", { class: "page-sub" }, "הקול נוצר מרטט של מיתרי הקול, ונשען גם על נשימה, תהודה והרגלי שימוש בריאים."),
      h(
        "div",
        { class: "health-grid" },
        sec("💧", "מה כדאי", ["לשתות מים לאורך היום", "לחמם את הקול לפני דיבור ממושך", "לנוח ולישון מספיק", "לדבר בקול טבעי, לא בלחש ולא בצעקה"]),
        sec("🚫", "ממה כדאי להימנע", ["כחכוח תכוף של הגרון", "דיבור ממושך ברעש חזק", "עישון ואוויר יבש מאוד", "תרגול כשכואב או כשהקול צרוד"]),
        sec("🛑", "מתי עוצרים", ["כאב, צריבה או לחץ בגרון", "צרידות פתאומית", "תחושת מאמץ גדול בזמן התרגיל", "סחרחורת בתרגילי נשימה"])
      ),
      h(
        "div",
        { class: "card", style: "margin-top:20px" },
        h("h3", null, "📚 על מה התרגילים מבוססים"),
        h("p", { class: "muted" }, "התרגילים באתר הם שיטות מקובלות שמופיעות שוב ושוב אצל מאמני קול וקלינאי תקשורת: נשימה בטנית, רטט שפתיים וגלגול לשון, המהום, סירנות, צליל דרך קשית, הגזמה בהגייה ותרגול עוצמה בטווחים שונים. את הניסוחים כתבנו בעצמנו."),
        h("p", { class: "muted" }, "חשוב לדעת: גישות כגון תרגילי קול עם מעבר אוויר מצומצם, זרימת אוויר ותהודה מתוארות בספרות המקצועית. אין פירוש הדבר שכל תרגיל מתאים לכל אדם; התרגול כאן חינוכי בלבד ואינו טיפול אישי."),
        h(
          "ul",
          { class: "sources" },
          src("https://www.asha.org/practice-portal/clinical-topics/voice-disorders/", "ASHA — סקירה מקצועית של תרגילי קול, קשית, זרימת אוויר ותהודה"),
          src("https://www.nidcd.nih.gov/health/taking-care-your-voice", "NIDCD — כללי שמירה על הקול ומתי לפנות לייעוץ רפואי"),
          src("https://www.torontospeechtherapy.com/blog/2024/the-power-of-straw-phonation-exploring-sovt-exercises/", "פונציה דרך קשית כחימום וכקירור לדוברים (מרפאת קלינאות תקשורת)"),
          src("https://royalberkshire.nhs.uk/media/5ehceiw2/voice-warm-up-and-warm-down_apr24.pdf", "חוברת חימום וקירור קול (שירות הבריאות הבריטי, בית חולים Royal Berkshire)"),
          src("https://in.bgu.ac.il/academicdev/Documents/סדנת%20קול-%20הצעה%20לתרגול%20עצמי.pdf", "סדנת קול, הצעה לתרגול עצמי (אוניברסיטת בן-גוריון)")
        )
      ),
      h("div", { class: "notice", style: "margin-top:20px" }, "אם יש כאב, שינוי קול שנמשך או קושי בדיבור, מומלץ לפנות לרופא אף אוזן גרון או לקלינאי תקשורת. האתר מיועד לתרגול כללי ולא לאבחון או לטיפול רפואי.")
    )
  );
}

const src = (href, text) => h("li", null, h("a", { href, target: "_blank", rel: "noopener noreferrer" }, text));

function notFound() {
  main.replaceChildren(h("div", { class: "wrap page" }, h("h1", null, "העמוד לא נמצא"), h("a", { class: "btn primary", href: "#/" }, "חזרה לדף הבית")));
}

// ---------- נתב ----------
function route() {
  if (teardown) teardown();
  teardown = null;
  tts.cancel();
  const hash = location.hash.replace(/^#\/?/, "");
  const [page, arg] = hash.split("/");
  let titleText = "קול בטוח | פיתוח קול לדוברים, שלב אחרי שלב";
  let nav = "";
  backgroundMusic.setPage(page || "home");

  if (!page) home();
  else if (page === "course") (course(), (nav = "course"), (titleText = "הקורס | קול בטוח"));
  else if (page === "stats") (stats(), (nav = "stats"), (titleText = "ההתקדמות שלי | קול בטוח"));
  else if (page === "tools") ((teardown = tools()), (nav = "tools"), (titleText = "כלים | קול בטוח"));
  else if (page === "health") (health(), (nav = "health"), (titleText = "שמירה על הקול | קול בטוח"));
  else if (page === "lesson" && getLesson(arg)) {
    const l = getLesson(arg);
    nav = arg === "daily" ? "daily" : "course";
    titleText = `${l.title} | קול בטוח`;
    teardown = mountPlayer(l, main, { onExit: () => (location.hash = l.id === "daily" ? "#/" : "#/course") });
  } else notFound();

  document.body.dataset.view = page === "lesson" && getLesson(arg) ? "lesson" : page || "home";
  if (document.body.dataset.view !== "lesson") main.prepend(pageKnowledge());
  document.title = titleText;
  document.querySelectorAll("#nav a").forEach((a) => (a.dataset.route === nav ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  if (page !== "lesson") window.scrollTo(0, 0);
}

document.querySelector(".skip").addEventListener("click", e => { e.preventDefault(); main.focus(); main.scrollIntoView({block:"start"}); });
window.addEventListener("hashchange", route);
updateStreak();
route();
