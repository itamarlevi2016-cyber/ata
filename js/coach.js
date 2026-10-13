// ר' דוד, המאמן: האיור של הדמות חתוך לשכבות (ראש, גוף, רקע) ומונפש: הטיית ראש, נשימה, כתפיים, פה שמדבר ומצמוץ,
// בתוספת אפקטים שמסבירים כל תרגיל. התמונות נמצאות בתיקייה assets/char.

const SVG = `<svg class="coach puppet" viewBox="0 0 540 880" role="img" aria-label="ר' דוד, המאמן שלך" data-mouth="closed" data-mood="happy" data-breath="idle" data-talk="0" data-act="rest">
  <defs>
    <linearGradient id="fadeg" x1="0" y1="0" x2="0" y2="1"><stop offset=".86" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
    <mask id="fademask" maskUnits="userSpaceOnUse" x="0" y="0" width="540" height="880"><rect width="540" height="880" fill="url(#fadeg)"/></mask>
  </defs>
  <image class="bgimg" href="assets/char/bg.webp" width="540" height="880" preserveAspectRatio="none"/>
  <image class="pose-img" x="-150" y="-30" width="832" height="1248" preserveAspectRatio="none" opacity="0" mask="url(#fademask)"/>
  <g class="figure" mask="url(#fademask)">
    <g class="torso"><image href="assets/char/body.webp" width="540" height="880"/></g>
    <g class="head">
      <image href="assets/char/head.webp" width="540" height="880"/>
      <!-- עפעפיים למצמוץ -->
      <g class="lids" fill="#e8996a">
        <ellipse class="lid" cx="242" cy="262" rx="19" ry="17"/>
        <ellipse class="lid" cx="320" cy="268" rx="20" ry="18"/>
      </g>
      <!-- פה (הצורה הסגורה היא האיור המקורי) -->
      <g class="mouth">
        <g class="m m-open1"><path d="M236 335 Q268 346 302 335 Q292 362 268 364 Q244 362 236 335Z" fill="#5a1a1d"/><ellipse cx="268" cy="355" rx="11" ry="5" fill="#d9606a"/></g>
        <g class="m m-open2"><path d="M233 334 Q268 347 305 334 Q296 378 268 382 Q242 378 233 334Z" fill="#5a1a1d"/><path d="M240 337 Q268 346 298 337 L296 346 Q268 353 242 346Z" fill="#fbf1de"/><ellipse cx="268" cy="368" rx="14" ry="6.5" fill="#d9606a"/></g>
        <g class="m m-grin"><path d="M233 334 Q268 354 305 334 Q268 342 233 334Z" fill="#5a1a1d"/><path d="M241 337 Q268 349 297 337 L294 342 Q268 351 244 342Z" fill="#fbf1de"/></g>
        <g class="m m-round"><ellipse cx="268" cy="346" rx="12" ry="14" fill="#5a1a1d"/><ellipse cx="268" cy="346" rx="12" ry="14" fill="none" stroke="#b9694f" stroke-width="3.5"/></g>
      </g>
    </g>
  </g>
  <g class="pose-face">
    <g class="mouth">
        <g class="m m-open1"><path d="M236 335 Q268 346 302 335 Q292 362 268 364 Q244 362 236 335Z" fill="#5a1a1d"/><ellipse cx="268" cy="355" rx="11" ry="5" fill="#d9606a"/></g>
        <g class="m m-open2"><path d="M233 334 Q268 347 305 334 Q296 378 268 382 Q242 378 233 334Z" fill="#5a1a1d"/><path d="M240 337 Q268 346 298 337 L296 346 Q268 353 242 346Z" fill="#fbf1de"/><ellipse cx="268" cy="368" rx="14" ry="6.5" fill="#d9606a"/></g>
        <g class="m m-grin"><path d="M233 334 Q268 354 305 334 Q268 342 233 334Z" fill="#5a1a1d"/><path d="M241 337 Q268 349 297 337 L294 342 Q268 351 244 342Z" fill="#fbf1de"/></g>
        <g class="m m-round"><ellipse cx="268" cy="346" rx="12" ry="14" fill="#5a1a1d"/><ellipse cx="268" cy="346" rx="12" ry="14" fill="none" stroke="#b9694f" stroke-width="3.5"/></g>
      </g>
  </g>
  <g class="fx fx-belly"><ellipse cx="268" cy="738" rx="82" ry="54" fill="#ffe2a8" opacity=".30"/><ellipse cx="268" cy="738" rx="82" ry="54" fill="none" stroke="#ffd27a" stroke-width="6" stroke-dasharray="10 10"/></g>
  <g class="fx fx-string" fill="none" stroke="#ff9d4d" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M62 190 L62 70 M40 96 L62 66 L84 96" stroke-dasharray="14 14"/><path d="M478 190 L478 70 M456 96 L478 66 L500 96" stroke-dasharray="14 14"/>
  </g>
  <g class="fx fx-notes" fill="#1f7a83" font-size="54" font-family="sans-serif" font-weight="700">
    <text class="note n1" x="44" y="170">♪</text><text class="note n2" x="452" y="150">♫</text><text class="note n3" x="470" y="250">♪</text>
  </g>
  <g class="fx fx-waves" fill="none" stroke="#ff9d4d" stroke-width="9" stroke-linecap="round">
    <path class="w1" d="M360 318 q26 28 0 56"/><path class="w2" d="M384 296 q42 52 0 104"/><path class="w3" d="M408 274 q58 76 0 152"/>
  </g>
  <g class="fx fx-neck" fill="none" stroke="#ff9d4d" stroke-width="8" stroke-linecap="round">
    <path d="M52 170 q-30 52 0 104"/><path d="M488 170 q30 52 0 104"/>
  </g>
  <g class="fx fx-jaw" fill="none" stroke="#ff9d4d" stroke-width="8" stroke-linecap="round">
    <path d="M196 300 q-22 30 -4 58"/><path d="M342 300 q22 30 4 58"/>
  </g>
  <g class="fx fx-straw"><line x1="272" y1="342" x2="372" y2="388" stroke="#ff5a4d" stroke-width="13" stroke-linecap="round"/><line x1="272" y1="342" x2="372" y2="388" stroke="#fff" stroke-width="13" stroke-dasharray="9 15"/></g>
  <g class="fx fx-wave"><text x="452" y="470" font-size="84" class="emoji-fx">👋</text></g>
  <g class="fx fx-point"><text x="452" y="470" font-size="84" class="emoji-fx">☝️</text></g>
  <g class="sparks" fill="#ffb347">
    <path class="spark s1" d="M58 330 l9 22 22 9 -22 9 -9 22 -9 -22 -22 -9 22 -9z"/>
    <path class="spark s2" d="M474 260 l7 17 17 7 -17 7 -7 17 -7 -17 -17 -7 17 -7z"/>
    <path class="spark s3" d="M440 520 l6 14 14 6 -14 6 -6 14 -6 -14 -14 -6 14 -6z"/>
  </g>
</svg>`;

// כל תנועה: אפקט, ופה (אם הפה זז בעצמו במקום לדבר)
const ACTS = {
  rest: {},
  wave: {},
  present: {},
  point: {},
  palm: {},
  belly: {},
  posture: {},
  shoulders: {},
  neck: {},
  jaw: { mouth: [["closed", "open2"], 1000] },
  hum: {},
  trill: { mouth: [["round"], 0] },
  straw: { mouth: [["round"], 0] },
  siren: {},
  scale: {},
  project: {},
  sigh: { mouth: [["open1"], 0] },
  vowels: { mouth: [["open2", "round", "closed", "open1"], 800] },
  cheer: {},
};

export const ACT_LABELS = {
  posture: "עמידה יציבה",
  shoulders: "גלגול כתפיים",
  neck: "הטיית צוואר",
  jaw: "שחרור הלסת",
  belly: "נשימה אל הבטן",
  hum: "המהום",
  trill: "רטט",
  straw: "צליל דרך קשית",
  siren: "סירנה",
  scale: "סולם צלילים",
  project: "הקרנת הקול",
  sigh: "אנחת רווחה",
  vowels: "תנועות בפה פתוח",
};

const MOUTHS = ["open1", "open2", "open1", "closed", "open2"];

// תמונות תנוחה אופציונליות: אם קיימת התמונה assets/poses/<שם-התנועה>.webp (או png/jpg) והיא רשומה
// ב-assets/poses/manifest.json, היא מוצגת במקום הדמות המונפשת. ראו assets/poses/README.md
// בתנוחות עם הבעה רגועה אפשר להוסיף פה מדבר; בשאר (פה פתוח, קשית, עיניים עצומות) התמונה נשארת כמו שהיא
const POSE_TALK = new Set(["wave", "point", "present", "palm", "project", "siren"]);
let poseManifest = null;
const poseReady = fetch("assets/poses/manifest.json")
  .then((r) => (r.ok ? r.json() : {}))
  .catch(() => ({}))
  .then((m) => (poseManifest = m && typeof m === "object" ? m : {}));

export function createCoach(host) {
  host.innerHTML = SVG;
  const root = host.querySelector("svg");
  // מזהים ייחודיים למסכה, כי יכולות להיות כמה דמויות בעמוד
  const uid = Math.random().toString(36).slice(2, 7);
  root.innerHTML = root.innerHTML.replace(/id="(fadeg|fademask)"/g, `id="$1-${uid}"`).replace(/url\(#(fadeg|fademask)\)/g, `url(#$1-${uid})`);
  root.querySelector(".figure").setAttribute("mask", `url(#fademask-${uid})`);

  let talkTimer = null, stopTimer = null, actTimer = null;
  let actName = "rest";

  const baseMouth = () => {
    const m = ACTS[actName] && ACTS[actName].mouth;
    if (m && m[1] === 0) return m[0][0];
    return root.dataset.mood === "cheer" ? "grin" : "closed";
  };

  function startTalk() {
    if (actTimer) return; // בתנועה עם פה משלה (למשל פיהוק) לא מתערבים
    clearInterval(talkTimer);
    root.dataset.talk = "1";
    let i = 0;
    talkTimer = setInterval(() => (root.dataset.mouth = MOUTHS[i++ % MOUTHS.length]), 150);
  }
  function stopTalk() {
    clearInterval(talkTimer);
    clearTimeout(stopTimer);
    root.dataset.talk = "0";
    if (!actTimer) root.dataset.mouth = baseMouth();
  }
  function talkFor(ms) {
    startTalk();
    clearTimeout(stopTimer);
    stopTimer = setTimeout(stopTalk, ms);
  }
  function mood(m) {
    root.dataset.mood = m;
    if (root.dataset.talk !== "1" && !actTimer) root.dataset.mouth = baseMouth();
  }
  // phase: in | hold | out | idle
  function breathe(phase, secs = 1) {
    root.style.setProperty("--breath-dur", `${secs}s`);
    root.dataset.breath = phase;
  }
  // מדגים תנועה: אפקטים, פה וגוף
  function applyPose() {
    const file = poseManifest && poseManifest[actName];
    const img = root.querySelector(".pose-img");
    if (file) {
      img.setAttribute("href", `assets/poses/${file}`);
      root.dataset.pose = "1";
      root.dataset.poseTalk = POSE_TALK.has(actName) ? "1" : "0";
    } else {
      root.dataset.pose = "0";
    }
  }
  poseReady.then(applyPose);

  function act(name, { dur = 4 } = {}) {
    if (!ACTS[name]) name = "rest";
    actName = name;
    if (poseManifest) applyPose();
    clearInterval(actTimer);
    actTimer = null;
    clearInterval(talkTimer);
    const a = ACTS[name];
    root.style.setProperty("--act-dur", `${dur}s`);
    root.dataset.act = name;
    if (a.mouth && a.mouth[1] > 0) {
      let i = 0;
      root.dataset.mouth = a.mouth[0][0];
      actTimer = setInterval(() => (root.dataset.mouth = a.mouth[0][++i % a.mouth[0].length]), a.mouth[1]);
    } else {
      root.dataset.mouth = baseMouth();
    }
    root.dataset.talk = "0";
  }
  act("rest");
  return { root, startTalk, stopTalk, talkFor, mood, breathe, act };
}
