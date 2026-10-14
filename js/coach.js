// ר' דוד, המאמן: האיור של הדמות חתוך לשכבות (ראש, גוף, רקע) ומונפש: הטיית ראש, נשימה, כתפיים, פה שמדבר ומצמוץ,
// בתוספת אפקטים שמסבירים כל תרגיל. התמונות נמצאות בתיקייה assets/char.

const SVG = `<svg class="coach puppet" viewBox="0 0 540 880" role="img" aria-label="ר' דוד, המאמן שלך" data-mouth="closed" data-mood="happy" data-breath="idle" data-talk="0" data-act="rest">
  <defs>
    <linearGradient id="fadeg" x1="0" y1="0" x2="0" y2="1"><stop offset=".86" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
    <mask id="fademask" maskUnits="userSpaceOnUse" x="0" y="0" width="540" height="880"><rect width="540" height="880" fill="url(#fadeg)"/></mask>
  </defs>
  <image class="bgimg" href="assets/char/bg.webp" width="540" height="880" preserveAspectRatio="none"/>
  <image class="pose-img" x="0" y="0" width="540" height="880" preserveAspectRatio="xMidYMid slice" opacity="0" mask="url(#fademask)"/>
  <g class="figure" mask="url(#fademask)">
    <g class="torso"><image href="assets/char/body.webp" width="540" height="880"/></g>
    <g class="head">
      <image href="assets/char/head.webp" width="540" height="880"/>
      <!-- פה (הצורה הסגורה היא האיור המקורי) -->
      <g class="mouth" aria-hidden="true">
        <path class="m m-open1" d="M239 335 Q270 347 302 335 Q289 351 271 352 Q252 349 239 335Z" fill="#592d24"/>
        <g class="m m-open2"><path d="M239 335 Q270 347 302 335 Q289 356 271 357 Q251 351 239 335Z" fill="#4b2520"/><path d="M254 349 Q270 355 285 350 Q272 351 254 349Z" fill="#b56d61"/></g>
        <ellipse class="m m-round" cx="271" cy="345" rx="8" ry="7" fill="#592d24"/>
      </g>
    </g>
  </g>
  <g class="fx fx-pitch-guide" aria-hidden="true" fill="none" stroke="#287f89" stroke-width="5" stroke-linecap="round">
    <path d="M62 426 V290 M52 305 L62 290 L72 305"/>
    <circle class="pitch-guide-dot" cx="62" cy="426" r="9" fill="#287f89" stroke="white" stroke-width="3"/>
  </g>
  <g class="fx fx-shoulder-guide" aria-hidden="true" fill="none" stroke="#287f89" stroke-width="5" stroke-linecap="round">
    <path d="M64 456 Q40 430 64 404 M52 405 L64 404 L63 418"/>
    <path d="M476 456 Q500 430 476 404 M488 405 L476 404 L477 418"/>
  </g>
  <g class="fx fx-belly"><ellipse cx="268" cy="738" rx="82" ry="54" fill="#ffe2a8" opacity=".30"/><ellipse cx="268" cy="738" rx="82" ry="54" fill="none" stroke="#ffd27a" stroke-width="6" stroke-dasharray="10 10"/></g>
  <g class="fx fx-breath-guides" fill="none" stroke="#77c8d4" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <path class="breath-in left" d="M170 758 q-58 -18 -66 -78"/>
    <path class="breath-in right" d="M366 758 q58 -18 66 -78"/>
    <path class="breath-out" d="M268 696 q0 -58 0 -118"/>
    <path class="breath-arrow left-a" d="M88 694 l18 -16 6 25"/>
    <path class="breath-arrow right-a" d="M448 694 l-18 -16 -6 25"/>
    <path class="breath-arrow out-a" d="M268 560 l-18 20 36 0z"/>
  </g>
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
  <g class="fx fx-hum-resonance" aria-hidden="true">
    <circle class="ring r1" cx="268" cy="320" r="26"/>
    <circle class="ring r2" cx="268" cy="320" r="44"/>
    <circle class="ring r3" cx="268" cy="320" r="62"/>
  </g>
  <g class="fx fx-trill-lines" fill="none" stroke="#ff9d4d" stroke-width="6" stroke-linecap="round" aria-hidden="true">
    <path class="tl l1" d="M210 342 q-18 6 -24 22"/>
    <path class="tl l2" d="M218 360 q-20 8 -26 26"/>
    <path class="tl r1" d="M326 342 q18 6 24 22"/>
    <path class="tl r2" d="M318 360 q20 8 26 26"/>
  </g>
  <g class="fx fx-straw"><line x1="272" y1="342" x2="372" y2="388" stroke="#ff5a4d" stroke-width="13" stroke-linecap="round"/><line x1="272" y1="342" x2="372" y2="388" stroke="#fff" stroke-width="13" stroke-dasharray="9 15"/></g>
  <g class="fx fx-straw-cup" aria-hidden="true">
    <path class="cup" d="M364 390 h78 l-10 90 h-58 z"/>
    <path class="water" d="M372 426 q14 -8 28 0 t28 0 t28 0 v38 h-84z"/>
  </g>
  <g class="fx fx-straw-bubbles" aria-hidden="true">
    <circle class="bubble b1" cx="390" cy="438" r="9"/><circle class="bubble b2" cx="408" cy="452" r="6"/>
    <circle class="bubble b3" cx="426" cy="432" r="5"/><path class="air-flow" d="M374 390 Q399 385 424 373"/>
  </g>
  <g class="fx fx-airflow" fill="none" stroke="#75bfd1" stroke-width="6" stroke-linecap="round" aria-hidden="true">
    <path class="af a1" d="M306 340 q26 -8 52 6 q26 14 48 8"/>
    <path class="af a2" d="M306 352 q28 4 54 18 q22 12 44 8"/>
    <path class="af a3" d="M302 364 q30 12 54 28 q18 12 38 12"/>
  </g>
  <g class="fx fx-speech-bits" aria-hidden="true">
    <g class="sb b1"><rect x="364" y="292" rx="14" ry="14" width="66" height="30"/><text x="397" y="313">ממ</text></g>
    <g class="sb b2"><rect x="388" y="336" rx="14" ry="14" width="72" height="30"/><text x="424" y="357">מה</text></g>
    <g class="sb b3"><rect x="408" y="382" rx="14" ry="14" width="92" height="30"/><text x="454" y="403">שלום</text></g>
  </g>
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
  flow: { mouth: [["closed", "round", "closed"], 900] },
  softvoice: { mouth: [["closed", "open1", "closed", "open1"], 820] },
  transfer: { mouth: [["round", "open1", "open2", "closed"], 720] },
  speech: { mouth: [["open1", "open2", "closed", "round"], 620] },
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
  flow: "זרימת אוויר רגועה",
  softvoice: "קול רך ועדין",
  transfer: "מעבר מצליל למילה",
  speech: "דיבור טבעי ונינוח",
  siren: "סירנה",
  scale: "סולם צלילים",
  project: "הקרנת הקול",
  sigh: "אנחת רווחה",
  vowels: "תנועות בפה פתוח",
};

const MOUTHS = ["open1", "closed", "open1", "open2", "open1", "closed"];

// תמונות תנוחה אופציונליות: אם קיימת התמונה assets/poses/<שם-התנועה>.webp (או png/jpg) והיא רשומה
// ב-assets/poses/manifest.json, היא מוצגת במקום הדמות המונפשת. ראו assets/poses/README.md
// בתנוחות עם הבעה רגועה אפשר להוסיף פה מדבר; בשאר (פה פתוח, קשית, עיניים עצומות) התמונה נשארת כמו שהיא
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

  let talkTimer = null, stopTimer = null;
  let actName = "rest", poseName = "rest";

  function startTalk() {
    act("rest");
    clearInterval(talkTimer);
    root.dataset.talk = "1";
    let i = 0;
    talkTimer = setInterval(() => (root.dataset.mouth = MOUTHS[i++ % MOUTHS.length]), 150);
  }
  // פה מסונכרן לעוצמת ההקלטה (לא זיהוי פונמות מדויק).
  let lastShape = "closed", speechLevel = 0;
  function setSpeechLevel(level) {
    if (root.dataset.talk !== "1") return;
    speechLevel = speechLevel * .65 + Math.max(0, Math.min(1, level)) * .35;
    const shape = speechLevel < 0.07 ? "closed" : speechLevel < 0.42 ? "open1" : "open2";
    if (shape !== lastShape) root.dataset.mouth = lastShape = shape;
  }
  function startAudioTalk() {
    act("rest");
    clearInterval(talkTimer);
    talkTimer = null;
    root.dataset.talk = "1";
    root.dataset.mouth = "closed";
    lastShape = "closed";
    speechLevel = 0;
  }
  function stopTalk() {
    clearInterval(talkTimer);
    clearTimeout(stopTimer);
    root.dataset.talk = "0";
    root.dataset.mouth = "closed";
  }
  function talkFor(ms) {
    startTalk();
    clearTimeout(stopTimer);
    stopTimer = setTimeout(stopTalk, ms);
  }
  function mood(m) {
    root.dataset.mood = m;
    if (root.dataset.talk !== "1") root.dataset.mouth = "closed";
  }
  // phase: in | hold | out | idle
  function breathe(phase, secs = 1) {
    root.style.setProperty("--breath-dur", `${secs}s`);
    root.dataset.breath = phase;
  }
  // מדגים תנועה: אפקטים, פה וגוף
  function applyPose() {
    const file = poseManifest && poseManifest[poseName];
    const img = root.querySelector(".pose-img");
    if (file) {
      img.setAttribute("href", `assets/poses/${file}`);
      root.dataset.pose = "0";
      root.dataset.poseTalk = "0";
    } else {
      root.dataset.pose = "0";
    }
  }
  poseReady.then(applyPose);

  function act(name, { dur = 4 } = {}) {
    if (!ACTS[name]) name = "rest";
    clearInterval(talkTimer);
    clearTimeout(stopTimer);
    actName = name;
    poseName = ({ flow: "palm", softvoice: "hum", transfer: "hum", speech: "present", scale: "siren" })[name] || name;
    if (poseManifest) applyPose();
    root.style.setProperty("--act-dur", `${Math.max(1, dur)}s`);
    root.dataset.act = name;
    root.dataset.talk = "0";
    root.dataset.mouth = ["trill", "straw"].includes(name) ? "round" : "closed";
  }
  act("rest");
  const observer = new MutationObserver(() => {
    if (root.isConnected) return;
    clearInterval(talkTimer);
    clearTimeout(stopTimer);
    observer.disconnect();
  });
  observer.observe(document.body, {childList: true, subtree: true});
  return { root, startTalk, startAudioTalk, setSpeechLevel, stopTalk, talkFor, mood, breathe, act };
}
