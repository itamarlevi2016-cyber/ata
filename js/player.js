// נגן השיעורים: דמות, בועת דיבור, תרגיל, והתקדמות שלב אחרי שלב.
import { renderKnowledge } from "./knowledge.js";
import { h } from "./ui.js";
import { createCoach, ACT_LABELS } from "./coach.js";
import { tts, setDemoVolume } from "./audio.js";
import { RENDERERS, TASK_TYPES } from "./steps.js";
import { RANGES } from "./pitch.js";
import { spokenText, audioKey, narrationFor } from "./narration.js";
import * as voice from "./voice.js";
import { playLine, stopLine, pauseLine, resumeLine, setLineVolume } from "./recorded-lines.js";
import * as store from "./progress.js";
import { LESSONS } from "./data.js";

export function mountPlayer(lesson, main, { onExit }) {
  const saved = store.get().positions?.[lesson.id];
  const startIndex = Number.isInteger(saved?.index) ? Math.max(0, Math.min(saved.index, lesson.steps.length - 1)) : 0;
  let idx = startIndex;
  let cleanups = [];
  let pauseHandlers = [], practicePaused = true, renderedStep = -1, practiceStopped = false;
  let alive = true;
  const doneTasks = new Set((saved?.tasks || []).filter(i => Number.isInteger(i) && i >= 0 && i < lesson.steps.length)); // אינדקסי שלבים שהושלמו בהרצה הזו
  let earned = 0;
  const totalTasks = lesson.steps.filter((s) => TASK_TYPES.has(s.t)).length;

  const dots = h("div", { class: "dots", role: "progressbar", "aria-valuemin": "1", "aria-valuemax": String(lesson.steps.length) }, lesson.steps.map(() => h("i")));
  const bubbleText = h("span", { "aria-live": "polite" });
  const replay = h("button", { class: "replay", title: "שמעו שוב", "aria-label": "השמעה חוזרת", hidden: true }, "🔊");
  const stopSpeech = h("button", { class: "btn ghost small stop-speech", type: "button", "aria-label": "עצירת הקריינות" }, "⏹ עצור דיבור");
  const listenAgain = h("button", { class: "btn ghost small", type: "button" }, "▶ השמע שוב");
  const pauseSpeech = h("button", { class: "btn ghost small", type: "button", disabled: true }, "⏸ השהיה");
  const speechStatus = h("span", { class: "speech-status", role: "status" }, "מוכנים להקשיב");
  let paused = false, speechMode = null;
  const speechTools = h("div", { class: "speech-tools" }, pauseSpeech, stopSpeech, listenAgain, speechStatus);
  const bubble = h("div", { class: "bubble" }, bubbleText, replay);
  const exercise = h("div", { class: "exercise" });
  const demo = h("div", { class: "coach-demo", hidden: true });
  const guideTab = h("button", {class:"screen-tab",type:"button",role:"tab",id:"guide-tab","aria-controls":"guide-panel","aria-selected":"true"}, "הדרכה ותרגול");
  const knowledgeTab = h("button", {class:"screen-tab",type:"button",role:"tab",id:"knowledge-tab","aria-controls":"knowledge-panel","aria-selected":"false"}, "הרחבת ידע");
  const screenTabs = h("div", {class:"screen-tabs",role:"tablist","aria-label":"תוכן השלב"}, guideTab, knowledgeTab);
  const knowledgePanel = h("section", {id:"knowledge-panel",class:"knowledge-panel",role:"tabpanel","aria-labelledby":"knowledge-tab",hidden:true});
  let lessonPhase = "explain", currentAct = "rest", currentDur = 4, hasDemo = false;
  const positionLabel = h("div", { class: "step-position" });
  const explainBtn = h("button", { class: "btn ghost small", type: "button" }, "1 · הסבר");
  const demoBtn = h("button", { class: "btn ghost small", type: "button" }, "2 · הדגמה");
  const practiceBtn = h("button", { class: "btn ghost small", type: "button" }, "3 · תרגול");
  const flow = h("div", { class: "lesson-flow", "aria-label": "רצף ההדרכה" }, explainBtn, demoBtn, practiceBtn);
  const beginPractice = h("button", { class: "btn primary practice-start", type: "button" }, "הבנתי, לתרגול");
  const restart = h("button", { class: "btn ghost small", type: "button" }, "התחילו את השיעור מחדש");
  const resumeBanner = h("div", { class: "resume-banner", hidden: !saved }, "ממשיכים מהמקום שבו עצרתם", restart);
  restart.addEventListener("click", () => { doneTasks.clear(); earned = 0; store.clearPosition(lesson.id); resumeBanner.hidden = true; show(0); });
  // The browser may require an explicit tap before permitting audio playback.
  const enableAudio = h("button", { class: "btn ghost", type: "button", hidden: true }, "🔊 הפעילו שמע");
  enableAudio.addEventListener("click", () => { enableAudio.hidden = true; speak(); });
  const prev = h("button", { class: "btn ghost" }, "▶ הקודם");
  const next = h("button", { class: "btn primary big" }, "לשלב הבא ◀");
  const coachHost = h("div", { class: "coach-bg" });
  const caption = h("div", { class: "coach-caption" });
  const mission = h("span", { class: "mission", title: "כל משימה שמסיימים מזכה ב-10 נקודות" }, `⭐ 0/${totalTasks} משימות`);

  const voiceBox = h("div", { class: "voice-box", hidden: true });
  const voiceToggle = h("input", { type: "checkbox" });
  voiceToggle.checked = store.get().tts;
  const speedSel = h("select", { "aria-label": "מהירות הקראה" }, [["0.9", "איטי"], ["0.97", "רגוע"], ["1", "טבעי (מומלץ)"], ["1.08", "מהיר" ]].map(([v, t]) => h("option", { value: v }, t)));
  speedSel.value = [...speedSel.options].some(x => x.value === String(store.get().speed)) ? String(store.get().speed) : "1";
  voiceBox.append(h("label", { class: "toggle" }, voiceToggle, "קריינות"), speedSel);
  const volumeBox = h("details", { class: "volume-settings" }, h("summary", null, "עוצמת השמע"));
  for (const [key, label] of [["speechVolume", "קריינות"], ["demoVolume", "צלילי הדגמה"]]) {
    const input = h("input", { type: "range", min: "0", max: "1", step: ".05", value: String(store.get()[key] ?? 1), "aria-label": `עוצמת ${label}` });
    input.addEventListener("input", () => { const value = Number(input.value); store.save({ [key]: value }); if (key === "demoVolume") setDemoVolume(value); else { voice.setVolume(value); setLineVolume(value); } });
    volumeBox.append(h("label", null, label, input));
  }
  voiceBox.append(volumeBox);
  voiceToggle.addEventListener("change", () => {
    store.save({ tts: voiceToggle.checked });
    if (!voiceToggle.checked) { stopNarration(); speechStatus.textContent = "הקריינות כבויה"; }
    else { setPhase("explain"); speak(); }
  });
  speedSel.addEventListener("change", () => { store.save({ speed: Number(speedSel.value) }); setPhase("explain"); speak(); });
  voice.loadManifest().then(() => { if (alive) voiceBox.hidden = false; });

  const guidePanel = h("section", {id:"guide-panel",role:"tabpanel","aria-labelledby":"guide-tab"},flow,bubble,speechTools,enableAudio,demo,beginPractice,exercise);
  const root = h(
    "div",
    { class: "wrap player" },
    h("div", { class: "player-top" }, h("button", { class: "back-link", onclick: () => confirmExit() }, "→ יציאה"), h("div", { class: "title" }, `${lesson.icon} ${lesson.title}`), totalTasks > 0 && mission, voiceBox),
    dots, positionLabel, resumeBanner,
    h("div", { class: "stage" }, h("div", { class: "coach-wrap" }, coachHost, caption, h("div", { class: "coach-name" }, "ר' דוד, המאמן שלך")), h("div", { class: "main-col" }, screenTabs, guidePanel, knowledgePanel, h("div", { class: "nav-row" }, prev, next)))
  );
  main.replaceChildren(root);
  const coach = createCoach(coachHost);

  function selectTab(knowledge) {
    if (knowledge) { stopNarration(); suspendPractice(); coach.act("rest"); caption.textContent = "לומדים על הקול"; }
    else if (lessonPhase === "practice" && !practiceStopped) { practicePaused = false; coach.act(currentAct,{dur:currentDur}); caption.textContent = "חוזרים לתרגול"; }
    guidePanel.hidden = knowledge; knowledgePanel.hidden = !knowledge;
    guideTab.setAttribute("aria-selected", String(!knowledge)); knowledgeTab.setAttribute("aria-selected", String(knowledge));
    guideTab.setAttribute("tabindex", knowledge ? "-1" : "0"); knowledgeTab.setAttribute("tabindex", knowledge ? "0" : "-1");
  }
  guideTab.addEventListener("click", () => selectTab(false));
  knowledgeTab.addEventListener("click", () => selectTab(true));
  for (const tab of [guideTab, knowledgeTab]) tab.addEventListener("keydown", e => { if (["ArrowLeft","ArrowRight","Home","End"].includes(e.key)) { e.preventDefault(); const target=e.key==="Home"?guideTab:e.key==="End"?knowledgeTab:tab===guideTab?knowledgeTab:guideTab; target.click(); target.focus(); e.stopPropagation(); } });
  function suspendPractice() {
    practicePaused = true;
    pauseHandlers.forEach(fn => { try { fn(); } catch (_) {} });
  }
  function setPhase(phase) {
    if (phase === "practice" && practiceStopped) return;
    if (phase === lessonPhase && (phase !== "practice" || (renderedStep === idx && !practicePaused))) return;
    stopNarration();
    if (phase !== "practice") suspendPractice();
    else {
      practicePaused = false;
      if (TASK_TYPES.has(step.t) && renderedStep !== idx) {
        exercise.replaceChildren();
        (RENDERERS[step.t] || RENDERERS.say)(step, exercise, api);
        renderedStep = idx;
      }
    }
    lessonPhase = phase;
    [explainBtn, demoBtn, practiceBtn].forEach((b, i) => {
      if (["explain", "demo", "practice"][i] === phase) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
    demo.hidden = !(phase === "demo" && hasDemo);
    exercise.hidden = TASK_TYPES.has(step.t) && phase !== "practice";
    beginPractice.hidden = !TASK_TYPES.has(step.t) || phase === "practice";
    beginPractice.textContent = phase === "explain" && hasDemo ? "צפו בהדגמה" : "הבנתי, לתרגול";
    if (phase === "demo" || phase === "practice") coach.act(currentAct, { dur: currentDur });
    else coach.act("rest");
    caption.textContent = phase === "explain" ? "ר׳ דוד מסביר" : ACT_LABELS[currentAct] ? `מדגים: ${ACT_LABELS[currentAct]}` : "";
  }
  explainBtn.addEventListener("click", () => { setPhase("explain"); speak(); });
  demoBtn.addEventListener("click", () => setPhase("demo"));
  practiceBtn.addEventListener("click", () => setPhase("practice"));
  beginPractice.addEventListener("click", () => setPhase(lessonPhase === "explain" && hasDemo ? "demo" : "practice"));
  pauseSpeech.addEventListener("click", async () => {
    if (!paused) {
      const ok = speechMode === "line" ? pauseLine() : voice.pause();
      if (ok) { paused = true; coach.stopTalk(); pauseSpeech.textContent = "▶ המשך"; speechStatus.textContent = "הקריינות מושהית"; }
    } else {
      const ok = speechMode === "line" ? await resumeLine() : await voice.resume();
      if (ok && alive) { paused = false; pauseSpeech.textContent = "⏸ השהיה"; speechStatus.textContent = "ר׳ דוד מדבר"; if (speechMode === "tts") coach.startTalk(); }
    }
  });

  function confirmExit() {
    cleanup();
    onExit();
  }
  function cleanup() {
    practicePaused = true;
    speechToken++;
    stopSpeech.disabled = true;
    coach.stopTalk();
    cleanups.forEach((f) => {
      try { f(); } catch (_) {}
    });
    cleanups = [];
    pauseHandlers = [];
    renderedStep = -1;
    voice.stop();
    stopLine();
  }

  const api = {
    coach,
    rootMidi: () => RANGES[store.get().range].root,
    onCleanup: (fn) => cleanups.push(fn),
    onPause: (fn) => pauseHandlers.push(fn),
    isPaused: () => practicePaused,
    rep: (n = 1) => { if (!practicePaused) store.addReps(n); },
    task() {
      if (practicePaused || !alive || isFinished) return;
      const stepIdx = idx;
      if (doneTasks.has(stepIdx)) return;
      doneTasks.add(stepIdx);
      store.savePosition(lesson.id, idx, [...doneTasks]);
      const pts = store.awardTask(`${lesson.id}:${stepIdx}`);
      earned += pts;
      mission.textContent = `⭐ ${doneTasks.size}/${totalTasks} משימות`;
      mission.classList.add("pop");
      setTimeout(() => mission.classList.remove("pop"), 900);
      if (!didEncourage && store.get().tts) {
        didEncourage = true;
        announceLine("progress");
      }
      const reflection = h("div",{class:"exercise-reflection"},h("p",null,"איך הרגיש התרגיל?"));
      const feedbackMessage = h("p",{class:"reflection-message",role:"status"});
      const resumePractice = h("button",{class:"btn ghost small",type:"button",hidden:true},"נחתי, לחזור לתרגול");
      resumePractice.addEventListener("click",()=>{if(!practiceStopped){setPhase("practice");resumePractice.hidden=true;}});
      for (const [key,label,message] of [["comfortable","נוח וקל","מצוין. נסו לשמור על אותה נוחות גם במשפט דיבור רגיל."],["effort","הרגשתי מאמץ","נחו מעט. בחזרה אפשר להפחית עוצמה או לקצר את התרגיל."],["stop","כאב או צרידות","עוצרים את התרגול. אם הבעיה נמשכת, פונים לאיש מקצוע."]]) {
        const choice=h("button",{class:"btn ghost small",type:"button"},label);
        choice.addEventListener("click",()=>{store.save({reflections:{...(store.get().reflections||{}),[`${lesson.id}:${idx}`]:{value:key,time:Date.now()}}});feedbackMessage.textContent=message;if(key!=="comfortable"){stopNarration();suspendPractice();coach.act("rest");}if(key==="stop"){practiceStopped=true;practiceBtn.disabled=true;resumePractice.hidden=true;}else if(key==="effort")resumePractice.hidden=false;});
        reflection.append(choice);
      }
      reflection.append(feedbackMessage,resumePractice);
      const transfer = h("details",{class:"speech-transfer"},h("summary",null,"יישום במשפט דיבור רגיל"),h("p",null,"אמרו בנוחות: ״שלום לכולם. אני שמח להיות כאן.״ בדקו שהנשימה והקול נשארים קלים גם במילים."));
      reflection.append(transfer);
      exercise.append(reflection);
      exercise.prepend(
        h("div", { class: `task-badge${pts ? "" : " muted"}` }, pts ? `✓ משימה הושלמה · +${pts} נקודות ⭐` : "✓ משימה הושלמה · כבר קיבלתם נקודות על משימה זו היום")
      );
    },
  };

  let step = lesson.steps[0];
  let speechToken = 0;
  let didEncourage = false;
  let isFinished = false;
  function stopNarration() {
    ++speechToken;
    voice.stop();
    stopLine();
    coach.stopTalk();
    paused = false; pauseSpeech.disabled = true; pauseSpeech.textContent = "⏸ השהיה"; speechStatus.textContent = "הקריינות נעצרה";
    stopSpeech.disabled = true;
    stopSpeech.textContent = "⏹ הדיבור נעצר";
  }
  stopSpeech.addEventListener("click", stopNarration);
  listenAgain.addEventListener("click", () => { setPhase("explain"); speak(); });
  function showPlaying() {
    paused = false; pauseSpeech.disabled = false; pauseSpeech.textContent = "⏸ השהיה"; speechStatus.textContent = "ר׳ דוד מדבר";
    stopSpeech.disabled = false;
    stopSpeech.textContent = "⏹ עצור דיבור";
  }
  function showStopped() {
    paused = false; pauseSpeech.disabled = true; pauseSpeech.textContent = "⏸ השהיה"; speechStatus.textContent = "הקריינות הסתיימה";
    stopSpeech.disabled = true;
    stopSpeech.textContent = "⏹ הדיבור הסתיים";
  }

  async function announceLine(lineId, after = null) {
    if (!store.get().tts) { after?.(); return; }
    const ticket = ++speechToken;
    voice.stop();
    stopLine();
    const ok = await playLine(lineId, {
      speed: store.get().speed || 1,
      onstart: () => { if (ticket === speechToken && alive) { speechMode = "line"; coach.startAudioTalk(); showPlaying(); } },
      onlevel: (level) => { if (ticket === speechToken && alive) coach.setSpeechLevel(level); },
      onend: () => {
        coach.stopTalk();
        if (ticket === speechToken && alive) { showStopped(); after?.(); }
      },
    });
    if (!ok && ticket === speechToken && alive) {
      enableAudio.hidden = false;
      after?.();
    }
  }

  function speak() {
    coach.act("rest");
    const ticket = ++speechToken;
    stopLine();
    voice.stop();
    coach.stopTalk();
    if (!store.get().tts) { speechStatus.textContent = "הקריינות כבויה"; return; }
    const explain = () => {
      if (ticket !== speechToken || !alive || isFinished) return;
      const text = spokenText(step);
      voice.speak(audioKey(lesson.id, idx), text, {
        onstart: (mode) => { if (ticket !== speechToken || !alive) return; enableAudio.hidden = true; speechMode = mode; showPlaying(); if (mode === "audio") coach.startAudioTalk(); else coach.startTalk(); },
        onlevel: (level) => { if (ticket === speechToken && alive) coach.setSpeechLevel(level); },
        onend: () => { if (ticket === speechToken && alive) { coach.stopTalk(); showStopped(); } },
      }).then(mode => { if (!mode && ticket === speechToken && alive && store.get().tts) { enableAudio.hidden = false; speechStatus.textContent = "לחצו להפעלת השמע"; } });
    };
    explain();
  }

  function show(i) {
    cleanup();
    idx = i;
    step = lesson.steps[i];
    lessonPhase = null; practiceStopped = false;
    knowledgePanel.replaceChildren(renderKnowledge(lesson,step));
    selectTab(false);
    store.savePosition(lesson.id, idx, [...doneTasks]);
    mission.textContent = `⭐ ${doneTasks.size}/${totalTasks} משימות`;
    positionLabel.textContent = `שלב ${i + 1} מתוך ${lesson.steps.length} · ${step.title || lesson.title}`;
    [...dots.children].forEach((d, j) => {
      d.className = j < i ? "on" : j === i ? "now" : "";
    });
    dots.setAttribute("aria-valuenow", String(i + 1));
    exercise.replaceChildren();
    coach.breathe("idle");
    coach.mood(step.mood || "happy");
    const act = step.mood === "cheer" ? "cheer" : step.act || "rest";
    const demoDur = ({ belly: 6, straw: 5, trill: 4, hum: 4, posture: 5, shoulders: 5, neck: 5, jaw: 5, siren: Math.max(4, step.secs || 4), scale: 5, project: 4.5 })[act] || (step.t === "glide" ? step.secs : 4);
    currentAct = act; currentDur = demoDur;
    caption.textContent = ACT_LABELS[act] ? `מדגים: ${ACT_LABELS[act]}` : "";
    // Animated visual demonstration for each exercise; clarifies movement with short step-by-step cues.
    const demos = {
      posture: { title: "עמידה יציבה", summary: "החיצים מסמנים התארכות עדינה למעלה, בלי להקשיח את הגוף.", steps: ["כפות רגליים יציבות על הקרקע", "הקודקוד נמשך קלות למעלה", "כתפיים רפויות והלסת משוחררת"], watch: ["גב ארוך", "בלי מאמץ"] },
      shoulders: { title: "שחרור כתפיים", summary: "החיצים מסמנים את כיוון גלגול הכתפיים: בעדינות, לאחור ולמטה.", steps: ["שאיפה קטנה", "הכתפיים עולות ברכות", "שחרור איטי לאחור"], watch: ["לא מהר", "בלי כאב"] },
      neck: { title: "הטיית צוואר", summary: "הקשתות מסמנות הטיית ראש עדינה לצדדים. בצעו תנועה קטנה ונוחה.", steps: ["הסנטר נשאר רגוע", "אוזן מתקרבת לכתף", "חוזרים למרכז ומחליפים צד"], watch: ["בלי למשוך", "תנועה קטנה"] },
      jaw: { title: "שחרור הלסת", summary: "פותחים וסוגרים את הלסת ברכות, בלי לדחוף את הפה.", steps: ["הפה נפתח מעט", "הלסת יורדת בחופשיות", "סוגרים בעדינות"], watch: ["ללא הידוק", "תנועה רכה"] },
      belly: { title: "נשימה אל הבטן", summary: "שמים לב לבטן: בשאיפה היא מתרחבת, ובנשיפה היא נרגעת.", steps: ["שאיפה דרך האף", "הבטן יוצאת מעט קדימה", "נשיפה איטית ושקטה"], watch: ["הבטן זזה", "הכתפיים רגועות"] },
      flow: { title: "זרימת אוויר רגועה", summary: "ר׳ דוד מדגים מעבר מאוויר שקט לזרימה רציפה, בלי לדחוף.", steps: ["שאיפה נינוחה", "האוויר יוצא לאט", "לא ממהרים להוסיף קול"], watch: ["אוויר רציף", "בלי לחץ בגרון"] },
      softvoice: { title: "קול רך ועדין", summary: "מוסיפים צליל קל על גבי הנשיפה, כמו התחלה של אנחת הקלה.", steps: ["נשיפה עדינה", "מוסיפים הַא קצר", "עוצרים לפני מאמץ"], watch: ["קול קל", "בלי לחישה"] },
      hum: { title: "הִמְהוּם", summary: "השפתיים סגורות בעדינות, והצליל מרגיש כאילו הוא מהדהד בפנים.", steps: ["סוגרים שפתיים בלי לחץ", "מפיקים מממ…", "שומרים על צליל נעים ואחיד"], watch: ["רטט בפנים", "לא חזק"] },
      transfer: { title: "מממ למילה", summary: "ר׳ דוד מדגים איך לשמור את תחושת הקלות גם כשהצליל הופך להברה או למילה.", steps: ["מתחילים במממ", "פותחים בעדינות למילה", "שומרים אותה תחושה גם בדיבור"], watch: ["מעבר חלק", "פה ולסת רפויים"] },
      speech: { title: "דיבור טבעי", summary: "עוברים למשפטים קצרים בקול יומיומי, כאילו מדברים עם אדם לידכם.", steps: ["נשימה קטנה לפני המשפט", "קצב שיחה נעים", "עוצרים להפסקה קצרה בין רעיונות"], watch: ["לא למהר", "נוחות לפני עוצמה"] },
      trill: { title: "רטט שפתיים", summary: "האוויר מניע את השפתיים לרטט קליל ורציף.", steps: ["מרפים את השפתיים", "מוציאים אוויר רציף", "נותנים לשפתיים לרטוט לבד"], watch: ["אוויר יציב", "בלי להדק שפתיים"] },
      straw: { title: "צליל דרך קשית", summary: "ר׳ דוד מדגים אטימה עדינה של השפתיים ונשיפה יציבה דרך הקשית.", steps: ["השפתיים אוטמות את הקשית בעדינות", "מוציאים אוויר רציף", "אם יש קול – שומרים עליו רגוע ואחיד"], watch: ["בועות קטנות", "בלי לחץ בגרון"] },
      siren: { title: "סירנה", summary: "הקול מחליק מלמטה למעלה וחוזר, בלי שבירה.", steps: ["מתחילים נמוך ונעים", "עולים בהדרגה", "חוזרים למטה באותה רכות"], watch: ["תנועה חלקה", "בלי צעקה"] },
      scale: { title: "סולם צלילים", summary: "עולים ויורדים בין הצלילים בקצב נוח ויציב.", steps: ["מקשיבים לצלילים", "חוזרים בקול רגוע", "שומרים על אותה איכות קול"], watch: ["דיוק", "לא ללחוץ"] },
      project: { title: "הקרנת קול", summary: "הקול יוצא קדימה על גבי נשיפה יציבה, בלי לצעוק.", steps: ["עומדים יציב", "לוקחים נשימה טובה", "שולחים את הקול קדימה"], watch: ["קול קדימה", "לא מהגרון"] },
      sigh: { title: "אנחת רווחה", summary: "משחררים אנחה ארוכה ורכה כדי להרפות את הגוף.", steps: ["שאיפה נוחה", "נשיפה ארוכה", "הכתפיים יורדות"], watch: ["שחרור", "בלי מאמץ"] },
      vowels: { title: "תנועות הפה", summary: "ר׳ דוד משנה את צורת הפה בהתאם לתנועה.", steps: ["פותחים לפתח", "מעגלים לשורוק/חולם", "שומרים תנועה ברורה"], watch: ["פה ברור", "ללא מתח"] },
      palm: { title: "דיבור איטי וברור", summary: "מקריא לאט ומדגיש הברות בצורה ברורה.", steps: ["נשימה רגועה", "מילים ברורות", "לא למהר"], watch: ["דיקציה", "קצב רגוע"] },
      present: { title: "הדגמה", summary: "מקשיבים, צופים בתנועה, ואז מנסים בעצמכם." },
      point: { title: "שימו לב", summary: "ר׳ דוד מסמן את נקודת המפתח של התרגיל." },
      wave: { title: "פתיחה רגועה", summary: "מתחילים בנחת ומקשיבים להדרכה." },
      cheer: { title: "עידוד", summary: "כל הכבוד, ממשיכים הלאה." }
    };
    if (TASK_TYPES.has(step.t) || (ACT_LABELS[act] && !["point","present","cheer","wave"].includes(act))) {
      const btn = h("button", { class: "btn ghost small", type: "button" }, "↻ הדגימו שוב");
      btn.addEventListener("click", () => { stopNarration(); coach.act(act, { dur: demoDur }); });
      const d = demos[act] || { summary: "עקבו אחרי התנועה המוצגת" };
      const copy = h("div", { class: "demo-copy" },
        d.title && h("div", { class: "demo-title" }, d.title),
        h("div", null, d.summary || "עקבו אחרי התנועה המוצגת"),
        d.steps?.length && h("ol", { class: "demo-steps" }, d.steps.map((s) => h("li", null, s))),
        d.watch?.length && h("div", { class: "demo-chips" }, d.watch.map((w) => h("span", { class: "demo-chip" }, w)))
      );
      const pose = ({flow:"palm",softvoice:"hum",transfer:"hum",speech:"present",scale:"siren"})[act] || act;
      const poseFile = ["wave","point","present","palm","jaw","straw","hum","siren","project","cheer"].includes(pose) ? `assets/poses/${pose}.webp` : null;
      const poseImage = poseFile && h("img",{class:"demo-illustration",src:poseFile,alt:`המחשה: ${d.title || ACT_LABELS[act] || lesson.title}`,loading:"lazy"});
      demo.replaceChildren(h("span", { class: "demo-label" }, "🎬 המחשה לתרגיל"), poseImage, copy, btn);
      hasDemo = true; demo.hidden = false;
    } else { hasDemo = false; demo.hidden = true; demo.replaceChildren(); }
    // Display exactly what the Cedar recording says, including heading and key points.
    // Avoid labeling the shortened on-screen summary as a complete transcript.
    const visibleText = narrationFor(step);
    bubbleText.textContent = visibleText;
    const thisStep = i;
    voice.transcriptFor(audioKey(lesson.id, i), spokenText(step)).then((script) => {
      if (alive && idx === thisStep && !isFinished && script) bubbleText.textContent = script;
    });
    replay.hidden = !voice.available() && !tts.available;
    replay.onclick = () => { setPhase("explain"); speak(); };
    if (!TASK_TYPES.has(step.t) && step.t !== "say") (RENDERERS[step.t] || RENDERERS.say)(step, exercise, api);
    prev.disabled = i === 0;
    next.textContent = i === lesson.steps.length - 1 ? "סיום השיעור 🎉" : "לשלב הבא ◀";
    demoBtn.disabled = !hasDemo;
    practiceBtn.disabled = !TASK_TYPES.has(step.t);
    setPhase("explain");
    speak();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function finish() {
    if (isFinished || !alive) return;
    cleanup();
    isFinished = true;
    announceLine("together");
    store.markComplete(lesson.id);
    store.clearPosition(lesson.id);
    flow.hidden = beginPractice.hidden = demo.hidden = resumeBanner.hidden = true;
    exercise.hidden = false;
    selectTab(false);
    const streak = store.streak(store.get().days);
    const nextLesson = LESSONS[LESSONS.findIndex((l) => l.id === lesson.id) + 1];
    [...dots.children].forEach((d) => (d.className = "on"));
    coach.mood("cheer");
    coach.act("cheer");
    caption.textContent = "";
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
          h("button", { class: "btn ghost", onclick: () => (doneTasks.clear(), (earned = 0), (mission.textContent = `⭐ 0/${totalTasks} משימות`), prev.hidden = next.hidden = false, ((isFinished = false), (flow.hidden = false), show(0))) }, "לחזור על השיעור")
        )
      )
    );
    prev.hidden = next.hidden = true;
  }

  next.addEventListener("click", () => (isFinished ? null : idx >= lesson.steps.length - 1 ? finish() : show(idx + 1)));
  prev.addEventListener("click", () => {
    if (!isFinished && idx > 0) { show(idx - 1); }
  });
  const onKey = (e) => {
    if (!alive || isFinished || !knowledgePanel.hidden || e.target.closest("input, textarea, select, button, a")) return;
    if (e.key === "ArrowLeft") next.click();
    if (e.key === "ArrowRight") prev.click();
  };
  document.addEventListener("keydown", onKey);

  show(startIndex);
  return () => {
    alive = false;
    document.removeEventListener("keydown", onKey);
    cleanup();
  };
}
