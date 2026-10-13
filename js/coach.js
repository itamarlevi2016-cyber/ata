// ר' דוד, המאמן: דמות מצוירת ב-SVG עם מצמוץ, נשימה, דיבור, מצבי רוח ותנועות שמדגימות את התרגילים.

const SVG = `<svg class="coach" viewBox="0 0 300 470" role="img" aria-label="ר' דוד, המאמן שלך" data-mouth="closed" data-mood="happy" data-breath="idle" data-talk="0">
  <defs>
    <linearGradient id="jacket" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2f3d"/><stop offset="1" stop-color="#15171f"/></linearGradient>
    <linearGradient id="beard" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9c6a44"/><stop offset=".45" stop-color="#8e7a68"/><stop offset="1" stop-color="#c2bcb4"/></linearGradient>
    <linearGradient id="hat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b2d38"/><stop offset="1" stop-color="#101117"/></linearGradient>
  </defs>

  <g class="sparks" fill="#ffb347">
    <path class="spark s1" d="M36 120 l5 12 12 5 -12 5 -5 12 -5 -12 -12 -5 12 -5z"/>
    <path class="spark s2" d="M264 96 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4z"/>
    <path class="spark s3" d="M256 210 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z"/>
  </g>

  <g class="figure">
    <g class="head-wrap">
      <path d="M126 226 h48 v60 c0 12 -10 20 -24 20 s-24 -8 -24 -20z" fill="#e6a981"/>
    </g>

    <!-- גוף: מעיל שחור וחולצה לבנה -->
    <g class="torso">
      <path d="M18 470 L18 346 C18 302 66 274 150 274 C234 274 282 302 282 346 L282 470Z" fill="url(#jacket)"/>
      <path d="M116 274 L150 340 L184 274 Z" fill="#fbf8f1"/>
      <path d="M116 274 L150 340 L184 274" fill="none" stroke="#e3ddd0" stroke-width="3" stroke-linejoin="round"/>
      <path d="M104 284 L126 420 M196 284 L174 420" stroke="#0e1016" stroke-width="3" opacity=".5" fill="none"/>
      <circle cx="150" cy="318" r="2.6" fill="#cfc8ba"/><circle cx="150" cy="336" r="2.6" fill="#cfc8ba"/><circle cx="150" cy="354" r="2.6" fill="#cfc8ba"/>
      <path d="M104 440 q-3 12 1 24 M112 440 q-1 10 2 20 M196 440 q3 12 -1 24 M188 440 q1 10 -2 20" stroke="#f4efe4" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".9"/>
    </g>

    <g class="head">
      <!-- אוזניים -->
      <ellipse cx="80" cy="160" rx="10" ry="15" fill="#eeb48b"/>
      <ellipse cx="220" cy="160" rx="10" ry="15" fill="#eeb48b"/>
      <ellipse cx="81" cy="161" rx="4.5" ry="8" fill="#e09d74"/>
      <ellipse cx="219" cy="161" rx="4.5" ry="8" fill="#e09d74"/>

      <!-- שיער בצדדים ופאות -->
      <path d="M86 108 C78 128 80 146 84 160" stroke="#8f7050" stroke-width="12" fill="none" stroke-linecap="round"/>
      <path d="M214 108 C222 128 220 146 216 160" stroke="#8f7050" stroke-width="12" fill="none" stroke-linecap="round"/>

      <!-- פנים -->
      <path d="M82 150 C82 104 112 84 150 84 C188 84 218 104 218 150 C218 196 190 232 150 232 C110 232 82 196 82 150Z" fill="#f4c49c"/>
      <path d="M96 112 C120 124 180 124 204 112 C200 128 176 138 150 138 C124 138 100 128 96 112Z" fill="#e3a77f" opacity=".55"/>

      <!-- לחיים -->
      <ellipse cx="103" cy="176" rx="12" ry="7" fill="#ff8f8f" opacity=".32"/>
      <ellipse cx="197" cy="176" rx="12" ry="7" fill="#ff8f8f" opacity=".32"/>

      <!-- עיניים -->
      <g class="eyes">
        <g>
          <ellipse cx="121" cy="158" rx="9.5" ry="11.5" fill="#2b1c18"/>
          <circle cx="118" cy="154" r="3.4" fill="#fff"/><circle cx="124.5" cy="162" r="1.7" fill="#fff"/>
          <ellipse class="lid" cx="121" cy="158" rx="11" ry="12.5" fill="#f4c49c"/>
        </g>
        <g>
          <ellipse cx="179" cy="158" rx="9.5" ry="11.5" fill="#2b1c18"/>
          <circle cx="176" cy="154" r="3.4" fill="#fff"/><circle cx="182.5" cy="162" r="1.7" fill="#fff"/>
          <ellipse class="lid" cx="179" cy="158" rx="11" ry="12.5" fill="#f4c49c"/>
        </g>
      </g>

      <!-- משקפיים דקים -->
      <g fill="rgba(255,255,255,.12)" stroke="#a3acb6" stroke-width="2.4">
        <ellipse cx="121" cy="158" rx="19" ry="15.5"/><ellipse cx="179" cy="158" rx="19" ry="15.5"/>
      </g>
      <g fill="none" stroke="#a3acb6" stroke-width="2.4" stroke-linecap="round">
        <path d="M140 155 Q150 150 160 155"/><path d="M102 153 L89 150"/><path d="M198 153 L211 150"/>
      </g>
      <path d="M108 150 q7 -5 15 -4" stroke="#fff" stroke-opacity=".6" stroke-width="2.6" fill="none" stroke-linecap="round"/>

      <!-- שקיות עיניים וקמטים עדינים -->
      <g fill="none" stroke="#d6987a" stroke-width="2" stroke-linecap="round" opacity=".75">
        <path d="M107 177 q14 7 28 0"/><path d="M165 177 q14 7 28 0"/>
        <path d="M112 121 q38 -7 76 0"/>
      </g>

      <!-- גבות -->
      <g class="brows" fill="none" stroke="#8a5d3b" stroke-width="7.5" stroke-linecap="round">
        <path d="M102 132 Q121 120 140 129"/>
        <path d="M160 129 Q179 120 198 132"/>
      </g>

      <!-- אף עגלגל -->
      <ellipse cx="150" cy="182" rx="15" ry="12" fill="#ebab84"/>
      <ellipse cx="146" cy="178" rx="5" ry="3.5" fill="#f6cba8" opacity=".8"/>

      <!-- זקן מלא, עם פתח לפה -->
      <path fill="url(#beard)" fill-rule="evenodd" d="M80 160 C76 214 92 278 150 308 C208 278 224 214 220 160 C214 182 200 196 182 199 L118 199 C100 196 86 182 80 160Z M120 210 a30 18 0 1 0 60 0 a30 18 0 1 0 -60 0Z"/>
      <path d="M100 236 C108 262 128 284 148 292 M200 236 C192 262 172 284 152 292 M150 266 L150 298 M124 254 C128 270 138 284 146 290 M176 254 C172 270 162 284 154 290" stroke="#e4ded6" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round"/>

      <!-- שפם -->
      <path d="M114 199 C116 184 138 180 150 192 C162 180 184 184 186 199 C172 203 160 199 150 195 C140 199 128 203 114 199Z" fill="#a07048"/>

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

      <!-- כובע שחור רחב שוליים עם סרט -->
      <path d="M100 102 C95 62 106 28 150 28 C194 28 205 62 200 102 Z" fill="url(#hat)"/>
      <path d="M121 32 C138 46 162 46 179 32 C173 54 127 54 121 32Z" fill="#05060a" opacity=".5"/>
      <path d="M99 86 C125 95 175 95 201 86 L201 101 C175 110 125 110 99 101Z" fill="#15161d"/>
      <path d="M99 87 C125 96 175 96 201 87" fill="none" stroke="#3d4050" stroke-width="2"/>
      <g transform="rotate(-2.5 150 104)">
        <ellipse cx="150" cy="105" rx="104" ry="17" fill="url(#hat)"/>
        <path d="M48 104 C70 120 230 120 252 104" fill="none" stroke="#4b4e5e" stroke-opacity=".6" stroke-width="2.5"/>
      </g>
      <path d="M116 50 C128 40 146 36 160 38" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="5" stroke-linecap="round"/>
    </g>

    <!-- פאות מתפתלות מעל הצווארון -->
    <g class="head-sides" fill="none" stroke="#a98563" stroke-width="7" stroke-linecap="round">
      <path d="M90 150 C80 168 99 180 90 200 C83 216 99 226 92 246 C89 258 96 264 93 274"/>
      <path d="M210 150 C220 168 201 180 210 200 C217 216 201 226 208 246 C211 258 204 264 207 274"/>
    </g>
    <g class="fx fx-straw"><line x1="152" y1="209" x2="204" y2="224" stroke="#ff7a59" stroke-width="7" stroke-linecap="round"/><line x1="152" y1="209" x2="204" y2="224" stroke="#fff" stroke-width="7" stroke-dasharray="5 8" stroke-linecap="butt"/></g>
    <g class="arm arm-l">
      <g class="uarm uarm-l" style="transform-origin:62px 304px">
        <line x1="62" y1="304" x2="62" y2="378" stroke="#0c0e13" stroke-opacity=".5" stroke-width="35" stroke-linecap="round"/>
        <line x1="62" y1="304" x2="62" y2="378" stroke="#2a2e3c" stroke-width="30" stroke-linecap="round"/>
        <g class="farm farm-l" style="transform-origin:62px 378px">
          <line x1="62" y1="378" x2="62" y2="436" stroke="#0c0e13" stroke-opacity=".5" stroke-width="32" stroke-linecap="round"/>
          <line x1="62" y1="378" x2="62" y2="436" stroke="#2a2e3c" stroke-width="27" stroke-linecap="round"/>
          <rect x="49" y="428" width="26" height="11" rx="4" fill="#fbf8f1"/>
          <ellipse cx="73" cy="452" rx="5" ry="9" fill="#eeb48b"/>
          <circle cx="62" cy="457" r="14" fill="#f4c49c"/>
          <ellipse class="finger" cx="62" cy="478" rx="4.6" ry="12" fill="#f4c49c"/>
        </g>
      </g>
    </g>
    <g class="arm arm-r">
      <g class="uarm uarm-r" style="transform-origin:238px 304px">
        <line x1="238" y1="304" x2="238" y2="378" stroke="#0c0e13" stroke-opacity=".5" stroke-width="35" stroke-linecap="round"/>
        <line x1="238" y1="304" x2="238" y2="378" stroke="#2a2e3c" stroke-width="30" stroke-linecap="round"/>
        <g class="farm farm-r" style="transform-origin:238px 378px">
          <line x1="238" y1="378" x2="238" y2="436" stroke="#0c0e13" stroke-opacity=".5" stroke-width="32" stroke-linecap="round"/>
          <line x1="238" y1="378" x2="238" y2="436" stroke="#2a2e3c" stroke-width="27" stroke-linecap="round"/>
          <rect x="225" y="428" width="26" height="11" rx="4" fill="#fbf8f1"/>
          <ellipse cx="227" cy="452" rx="5" ry="9" fill="#eeb48b"/>
          <circle cx="238" cy="457" r="14" fill="#f4c49c"/>
          <ellipse class="finger" cx="238" cy="478" rx="4.6" ry="12" fill="#f4c49c"/>
        </g>
      </g>
    </g>
  </g>
  <g class="fx fx-string"><path d="M150 24 L150 -22" stroke="#ffb347" stroke-width="3.5" stroke-dasharray="7 7" stroke-linecap="round"/><path d="M141 -8 L150 -22 L159 -8" fill="none" stroke="#ffb347" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></g>
  <g class="fx fx-belly"><ellipse cx="150" cy="404" rx="46" ry="32" fill="#9be7ee" opacity=".30"/><ellipse cx="150" cy="404" rx="46" ry="32" fill="none" stroke="#9be7ee" stroke-width="3.5" stroke-dasharray="6 6"/></g>
  <g class="fx fx-notes" fill="#1f7a83" font-size="28" font-family="sans-serif" font-weight="700"><text class="note n1" x="228" y="96">♪</text><text class="note n2" x="58" y="84">♫</text><text class="note n3" x="240" y="150">♪</text></g>
  <g class="fx fx-waves" fill="none" stroke="#4cc2cc" stroke-width="5" stroke-linecap="round"><path class="w1" d="M236 190 q12 18 0 36"/><path class="w2" d="M250 174 q20 34 0 68"/><path class="w3" d="M264 158 q28 50 0 100"/></g>
  <g class="fx fx-neck" fill="none" stroke="#ffb347" stroke-width="4" stroke-linecap="round"><path d="M52 92 q-22 34 0 70"/><path d="M248 92 q22 34 0 70"/></g>
  <g class="fx fx-jaw" fill="none" stroke="#ffb347" stroke-width="4" stroke-linecap="round"><path d="M102 232 q-14 16 -2 34"/><path d="M198 232 q14 16 2 34"/></g>
</svg>`;

// תנוחות הידיים: [זרוע ימנית, אמה ימנית, זרוע שמאלית, אמה שמאלית] במעלות.
// (הימנית והשמאלית לפי המסך.) חושב בעזרת חישוב זוויות המפרקים של שתי הזרועות.
const POSES = {"rest": [-4, 3, 4, -3], "belly": [-6, 77, 6, -77], "present": [-12, -156, 12, 156], "project": [7, -145, -7, 145], "wave": [-40, -138, 4, -3], "point": [-36, -140, 4, -3], "jaw": [-140, -97, 140, 97], "straw": [-158, -105, 158, 105], "throat": [-167, -142, 167, 142], "cheer": [-150, -15, 150, 15], "low": [-86, 124, 86, -124], "mid": [-20, -147, 20, 147], "high": [-123, -80, 123, 80]};

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
