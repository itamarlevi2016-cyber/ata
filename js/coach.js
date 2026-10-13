// ר' דוד, המאמן: דמות מצוירת ב-SVG עם מצמוץ, נשימה, דיבור, מצבי רוח ותנועות שמדגימות את התרגילים.

const SVG = `<svg class="coach" viewBox="0 0 300 470" role="img" aria-label="ר' דוד, המאמן שלך" data-mouth="closed" data-mood="happy" data-breath="idle" data-talk="0">
  <defs>
    <linearGradient id="jacket" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2d3a"/><stop offset="1" stop-color="#13151c"/></linearGradient>
    <linearGradient id="beard" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d5746"/><stop offset=".5" stop-color="#8b7a68"/><stop offset="1" stop-color="#aaa196"/></linearGradient>
    <linearGradient id="hat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2c37"/><stop offset="1" stop-color="#0f1016"/></linearGradient>
  </defs>

  <g class="sparks" fill="#ffb347">
    <path class="spark s1" d="M36 120 l5 12 12 5 -12 5 -5 12 -5 -12 -12 -5 12 -5z"/>
    <path class="spark s2" d="M264 96 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4z"/>
    <path class="spark s3" d="M256 210 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z"/>
  </g>

  <g class="figure">
    <g class="head-wrap">
      <path d="M124 226 h52 v60 c0 12 -11 20 -26 20 s-26 -8 -26 -20z" fill="#e3a47d"/>
    </g>

    <!-- גוף: מעיל שחור ארוך עם דשים, וחולצה לבנה מכופתרת -->
    <g class="torso">
      <path d="M18 470 L18 346 C18 302 66 274 150 274 C234 274 282 302 282 346 L282 470Z" fill="url(#jacket)"/>
      <path d="M116 276 L150 346 L184 276 L176 470 L124 470Z" fill="#fbf8f1"/>
      <path d="M150 346 L150 470" stroke="#e4ddcf" stroke-width="2"/>
      <g fill="#d6cfbf"><circle cx="150" cy="332" r="3.2"/><circle cx="150" cy="356" r="3.2"/><circle cx="150" cy="380" r="3.2"/><circle cx="150" cy="404" r="3.2"/><circle cx="150" cy="428" r="3.2"/></g>
      <path d="M112 276 C94 296 86 322 92 352 L124 420 L127 352 C119 326 117 300 121 282Z" fill="#212431" stroke="#0b0c11" stroke-opacity=".6" stroke-width="2"/>
      <path d="M188 276 C206 296 214 322 208 352 L176 420 L173 352 C181 326 183 300 179 282Z" fill="#212431" stroke="#0b0c11" stroke-opacity=".6" stroke-width="2"/>
      <path d="M92 352 l16 -10 M208 352 l-16 -10" stroke="#0b0c11" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/>
      <circle cx="118" cy="436" r="4.5" fill="#0a0b0f"/><circle cx="182" cy="436" r="4.5" fill="#0a0b0f"/>
    </g>

    <g class="head">
      <!-- אוזניים -->
      <ellipse cx="77" cy="160" rx="10" ry="15" fill="#ecb48c"/>
      <ellipse cx="223" cy="160" rx="10" ry="15" fill="#ecb48c"/>

      <!-- שיער בצדדים -->
      <path d="M84 108 C74 130 76 148 80 162" stroke="#6d4f38" stroke-width="12" fill="none" stroke-linecap="round"/>
      <path d="M216 108 C226 130 224 148 220 162" stroke="#6d4f38" stroke-width="12" fill="none" stroke-linecap="round"/>

      <!-- פנים עגולות -->
      <path d="M78 152 C78 104 110 82 150 82 C190 82 222 104 222 152 C222 200 192 234 150 234 C108 234 78 200 78 152Z" fill="#f3c29b"/>
      <path d="M94 112 C120 124 180 124 206 112 C202 128 178 138 150 138 C122 138 98 128 94 112Z" fill="#e3a77f" opacity=".5"/>

      <!-- לחיים מלאות -->
      <ellipse cx="100" cy="182" rx="15" ry="9" fill="#ff8f8f" opacity=".32"/>
      <ellipse cx="200" cy="182" rx="15" ry="9" fill="#ff8f8f" opacity=".32"/>

      <!-- עיניים גדולות וחמות -->
      <g class="eyes">
        <g>
          <ellipse cx="121" cy="158" rx="11" ry="12.5" fill="#fff"/>
          <circle cx="121" cy="159" r="7.8" fill="#5a3624"/><circle cx="121" cy="159" r="3.9" fill="#1c110d"/>
          <circle cx="118" cy="155.5" r="2.7" fill="#fff"/><circle cx="125" cy="163" r="1.4" fill="#fff"/>
          <ellipse class="lid" cx="121" cy="158" rx="12.5" ry="13.5" fill="#f3c29b"/>
        </g>
        <g>
          <ellipse cx="179" cy="158" rx="11" ry="12.5" fill="#fff"/>
          <circle cx="179" cy="159" r="7.8" fill="#5a3624"/><circle cx="179" cy="159" r="3.9" fill="#1c110d"/>
          <circle cx="176" cy="155.5" r="2.7" fill="#fff"/><circle cx="183" cy="163" r="1.4" fill="#fff"/>
          <ellipse class="lid" cx="179" cy="158" rx="12.5" ry="13.5" fill="#f3c29b"/>
        </g>
      </g>

      <!-- משקפיים דקים -->
      <g fill="rgba(255,255,255,.10)" stroke="#b9a27a" stroke-width="2.4">
        <circle cx="121" cy="158" r="18"/><circle cx="179" cy="158" r="18"/>
      </g>
      <g fill="none" stroke="#b9a27a" stroke-width="2.4" stroke-linecap="round">
        <path d="M139 156 Q150 151 161 156"/><path d="M103 154 L89 150"/><path d="M197 154 L211 150"/>
      </g>
      <path d="M108 148 q7 -6 15 -5" stroke="#fff" stroke-opacity=".6" stroke-width="2.6" fill="none" stroke-linecap="round"/>

      <!-- גבות עבות -->
      <g class="brows" fill="none" stroke="#2f2119" stroke-width="9" stroke-linecap="round">
        <path d="M99 133 Q119 118 140 129"/>
        <path d="M160 129 Q181 118 201 133"/>
      </g>

      <!-- אף עגלגל -->
      <ellipse cx="150" cy="184" rx="14.5" ry="11.5" fill="#eaa882"/>
      <ellipse cx="146" cy="180" rx="5" ry="3.5" fill="#f6c9a6" opacity=".85"/>

      <!-- זקן גלי ומלא, עם פתח לפה -->
      <path fill="url(#beard)" fill-rule="evenodd" d="M78 164 C72 218 90 282 150 302 C210 282 228 218 222 164 C214 184 200 197 182 199 L118 199 C100 197 86 184 78 164Z M120 210 a30 18 0 1 0 60 0 a30 18 0 1 0 -60 0Z"/>
      <g fill="none" stroke-linecap="round" stroke-width="3">
        <path d="M96 226 q9 9 18 0 t18 0" stroke="#4f3d30" stroke-opacity=".35"/>
        <path d="M168 226 q9 9 18 0 t18 0" stroke="#4f3d30" stroke-opacity=".35"/>
        <path d="M100 250 q9 9 18 0 t18 0 t18 0" stroke="#d8d0c4" stroke-opacity=".5"/>
        <path d="M122 270 q9 9 18 0 t18 0 t14 0" stroke="#d8d0c4" stroke-opacity=".5"/>
        <path d="M112 238 q8 8 16 0 M172 238 q8 8 16 0" stroke="#4f3d30" stroke-opacity=".3"/>
        <path d="M136 288 q7 6 14 0 t14 0" stroke="#e6e0d6" stroke-opacity=".5"/>
      </g>

      <!-- שפם -->
      <path d="M112 200 C114 183 138 179 150 192 C162 179 186 183 188 200 C174 204 160 199 150 195 C140 199 126 204 112 200Z" fill="#7a6551"/>

      <!-- פה -->
      <g class="mouth">
        <path class="m m-closed" d="M132 208 Q150 221 168 208" fill="none" stroke="#c0605a" stroke-width="4.5" stroke-linecap="round"/>
        <g class="m m-grin">
          <path d="M129 205 Q150 230 171 205 Q150 211 129 205Z" fill="#8f2d3a"/>
          <path d="M135 206 Q150 212 165 206 L163 211 Q150 215 137 211Z" fill="#fff"/>
        </g>
        <g class="m m-open1">
          <path d="M133 205 Q150 228 167 205 Q150 210 133 205Z" fill="#8f2d3a"/>
          <ellipse cx="150" cy="218" rx="8" ry="4" fill="#e86a7a"/>
        </g>
        <g class="m m-open2">
          <path d="M130 203 Q150 240 170 203 Q150 212 130 203Z" fill="#8f2d3a"/>
          <path d="M135 205 Q150 211 165 205 L163 210 Q150 214 137 210Z" fill="#fff"/>
          <ellipse cx="150" cy="224" rx="10" ry="5" fill="#e86a7a"/>
        </g>
      </g>

      <!-- כובע פדורה שחור עם סרט רחב -->
      <path d="M102 102 C97 62 108 28 150 28 C192 28 203 62 198 102 Z" fill="url(#hat)"/>
      <path d="M122 32 C138 45 162 45 178 32 C172 53 128 53 122 32Z" fill="#05060a" opacity=".5"/>
      <path d="M100 82 C125 92 175 92 200 82 L200 102 C175 112 125 112 100 102Z" fill="#12131a"/>
      <path d="M100 83 C125 93 175 93 200 83" fill="none" stroke="#3d4050" stroke-width="2"/>
      <g transform="rotate(-2 150 104)">
        <ellipse cx="150" cy="105" rx="102" ry="17" fill="url(#hat)"/>
        <path d="M50 104 C72 120 228 120 250 104" fill="none" stroke="#4b4e5e" stroke-opacity=".6" stroke-width="2.5"/>
      </g>
      <path d="M118 50 C129 41 146 37 160 39" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="5" stroke-linecap="round"/>
    </g>

    <!-- פאות מסולסלות -->
    <g class="head-sides" fill="none" stroke="#7a563a" stroke-width="4.6" stroke-linecap="round">
      <path d="M90 146 C86 156 90 160 88 166" stroke-width="7"/><path d="M210 146 C214 156 210 160 212 166" stroke-width="7"/>
      <circle cx="88" cy="164" r="6.8"/><circle cx="85" cy="178" r="6.8"/><circle cx="88" cy="192" r="6.8"/><circle cx="85" cy="206" r="6.8"/><circle cx="88" cy="220" r="6.8"/><circle cx="85" cy="234" r="6.8"/><circle cx="212" cy="164" r="6.8"/><circle cx="215" cy="178" r="6.8"/><circle cx="212" cy="192" r="6.8"/><circle cx="215" cy="206" r="6.8"/><circle cx="212" cy="220" r="6.8"/><circle cx="215" cy="234" r="6.8"/>
    </g>
    
    <g class="fx fx-straw"><line x1="152" y1="209" x2="204" y2="224" stroke="#ff7a59" stroke-width="7" stroke-linecap="round"/><line x1="152" y1="209" x2="204" y2="224" stroke="#fff" stroke-width="7" stroke-dasharray="5 8" stroke-linecap="butt"/></g>
    <g class="arm arm-l">
      <g class="uarm uarm-l" style="transform-origin:62px 304px">
        <line x1="62" y1="304" x2="62" y2="378" stroke="#0c0e13" stroke-opacity=".5" stroke-width="35" stroke-linecap="round"/>
        <line x1="62" y1="304" x2="62" y2="378" stroke="#262a37" stroke-width="30" stroke-linecap="round"/>
        <g class="farm farm-l" style="transform-origin:62px 378px">
          <line x1="62" y1="378" x2="62" y2="436" stroke="#0c0e13" stroke-opacity=".5" stroke-width="32" stroke-linecap="round"/>
          <line x1="62" y1="378" x2="62" y2="436" stroke="#262a37" stroke-width="27" stroke-linecap="round"/>
          <rect x="49" y="428" width="26" height="11" rx="4" fill="#fbf8f1"/>
          <ellipse cx="73" cy="452" rx="5" ry="9" fill="#e9b189"/>
          <circle cx="62" cy="457" r="14.5" fill="#f2c19a"/>
          <path d="M55 462 q7 5 14 0" stroke="#d9a07c" stroke-width="1.6" fill="none" stroke-linecap="round"/>
          <ellipse class="finger" cx="62" cy="478" rx="4.8" ry="12" fill="#f2c19a"/>
        </g>
      </g>
    </g>
    <g class="arm arm-r">
      <g class="uarm uarm-r" style="transform-origin:238px 304px">
        <line x1="238" y1="304" x2="238" y2="378" stroke="#0c0e13" stroke-opacity=".5" stroke-width="35" stroke-linecap="round"/>
        <line x1="238" y1="304" x2="238" y2="378" stroke="#262a37" stroke-width="30" stroke-linecap="round"/>
        <g class="farm farm-r" style="transform-origin:238px 378px">
          <line x1="238" y1="378" x2="238" y2="436" stroke="#0c0e13" stroke-opacity=".5" stroke-width="32" stroke-linecap="round"/>
          <line x1="238" y1="378" x2="238" y2="436" stroke="#262a37" stroke-width="27" stroke-linecap="round"/>
          <rect x="225" y="428" width="26" height="11" rx="4" fill="#fbf8f1"/>
          <ellipse cx="227" cy="452" rx="5" ry="9" fill="#e9b189"/>
          <circle cx="238" cy="457" r="14.5" fill="#f2c19a"/>
          <path d="M231 462 q7 5 14 0" stroke="#d9a07c" stroke-width="1.6" fill="none" stroke-linecap="round"/>
          <ellipse class="finger" cx="238" cy="478" rx="4.8" ry="12" fill="#f2c19a"/>
        </g>
      </g>
    </g>
  </g>
  <g class="fx fx-string"><path d="M150 22 L150 -24" stroke="#ffb347" stroke-width="3.5" stroke-dasharray="7 7" stroke-linecap="round"/><path d="M141 -10 L150 -24 L159 -10" fill="none" stroke="#ffb347" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></g>
  <g class="fx fx-belly"><ellipse cx="150" cy="404" rx="46" ry="32" fill="#9be7ee" opacity=".30"/><ellipse cx="150" cy="404" rx="46" ry="32" fill="none" stroke="#9be7ee" stroke-width="3.5" stroke-dasharray="6 6"/></g>
  <g class="fx fx-notes" fill="#1f7a83" font-size="28" font-family="sans-serif" font-weight="700"><text class="note n1" x="236" y="96">♪</text><text class="note n2" x="50" y="84">♫</text><text class="note n3" x="246" y="150">♪</text></g>
  <g class="fx fx-waves" fill="none" stroke="#4cc2cc" stroke-width="5" stroke-linecap="round"><path class="w1" d="M236 190 q12 18 0 36"/><path class="w2" d="M250 174 q20 34 0 68"/><path class="w3" d="M264 158 q28 50 0 100"/></g>
  <g class="fx fx-neck" fill="none" stroke="#ffb347" stroke-width="4" stroke-linecap="round"><path d="M44 96 q-20 34 0 70"/><path d="M256 96 q20 34 0 70"/></g>
  <g class="fx fx-jaw" fill="none" stroke="#ffb347" stroke-width="4" stroke-linecap="round"><path d="M98 232 q-14 16 -2 34"/><path d="M202 232 q14 16 2 34"/></g>
</svg>`;

// תנוחות הידיים: [זרוע ימנית, אמה ימנית, זרוע שמאלית, אמה שמאלית] במעלות.
// (הימנית והשמאלית לפי המסך.) חושב בעזרת חישוב זוויות המפרקים של שתי הזרועות.
const POSES = {"rest": [9, 57, -9, -57], "belly": [-6, 77, 6, -77], "present": [-12, -156, 12, 156], "project": [7, -145, -7, 145], "wave": [-40, -138, 4, -3], "point": [-36, -140, 4, -3], "jaw": [-140, -97, 140, 97], "straw": [-158, -105, 158, 105], "throat": [-167, -142, 167, 142], "cheer": [-150, -15, 150, 15], "low": [-86, 124, 86, -124], "mid": [-20, -147, 20, 147], "high": [-123, -80, 123, 80]};

// כל "תנועה" מורכבת מתנוחת ידיים, אפקטים בציור, ומצב פה
const ACTS = {
  rest: { pose: "rest" },
  wave: { pose: "wave", rightOnly: true },
  present: { pose: "present" },
  point: { pose: "point", rightOnly: true },
  palm: { pose: "mid", rightOnly: true },
  belly: { pose: "belly" },
  posture: { pose: "rest" },
  shoulders: { pose: "rest" },
  neck: { pose: "rest" },
  jaw: { pose: "jaw", mouth: [["closed", "open2"], 1000] },
  hum: { pose: "throat" },
  trill: { pose: "jaw" },
  straw: { pose: "straw", rightOnly: true },
  siren: { pose: "low", rightOnly: true },
  scale: { pose: "low", rightOnly: true },
  project: { pose: "project" },
  sigh: { pose: "rest", mouth: [["open1"], 0] },
  vowels: { pose: "present", mouth: [["open2", "open1", "closed", "open1"], 750] },
  cheer: { pose: "cheer" },
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

export function createCoach(host) {
  host.innerHTML = SVG;
  const root = host.querySelector("svg");
  // מזהים ייחודיים לשיפועי הצבע, כי יכולות להיות כמה דמויות בעמוד
  const uid = Math.random().toString(36).slice(2, 7);
  root.innerHTML = root.innerHTML.replace(/id="(jacket|beard|hat)"/g, `id="$1-${uid}"`).replace(/url\(#(jacket|beard|hat)\)/g, `url(#$1-${uid})`);

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
  // מדגים תנועה: ידיים, אפקטים ופה
  function act(name, { dur = 4 } = {}) {
    if (!ACTS[name]) name = "rest";
    actName = name;
    clearInterval(actTimer);
    actTimer = null;
    clearInterval(talkTimer);
    const a = ACTS[name];
    const p = POSES[a.pose] || POSES.rest;
    root.style.setProperty("--ur", `${p[0]}deg`);
    root.style.setProperty("--fr", `${p[1]}deg`);
    const left = a.rightOnly ? POSES.rest : p; // היד השמאלית נשארת רפויה
    root.style.setProperty("--ul", `${left[2]}deg`);
    root.style.setProperty("--fl", `${left[3]}deg`);
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
