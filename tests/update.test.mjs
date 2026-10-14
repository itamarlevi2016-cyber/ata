import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

// Integration harness isolates the player from native media and graphics.
class El {
 constructor(tag,attrs={},kids=[]) {attrs=attrs||{};this.tag=tag;this.dataset={};this.attrs={...attrs};this.children=[];this.events={};this.style={setProperty(){}};this.classList={add(){},remove(){}};this.hidden=!!attrs.hidden;this.disabled=!!attrs.disabled;this.value=attrs.value;this.append(...kids);}
 append(...kids){for(const k of kids.flat(Infinity)){if(k!==false&&k!=null)this.children.push(k);}}
 replaceChildren(...kids){this.children=[];this.append(...kids);}
 setAttribute(k,v){this.attrs[k]=v;}
 removeAttribute(k){delete this.attrs[k];}
 addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
 get options(){return this.children.filter(x=>x?.tag==='option');}
 click(){if(!this.disabled)for(const fn of this.events.click||[])fn({target:this});}
 set textContent(v){this.children=[v];} get textContent(){return this.children.map(x=>x instanceof El?x.textContent:String(x)).join('');}
}
const main=new El('main');const elements=(n)=>[n,...n.children.filter(x=>x instanceof El).flatMap(elements)];
const button=(text)=>elements(main).find(x=>x.tag==='button'&&x.textContent.includes(text));
const storage=new Map();let state={range:'mid',tts:true,speed:1,positions:{},completed:{},days:[],points:0};
let stops=0, rendered=0, destroyed=0, exercisePauses=0, paused=0, spoken=0;const acts=[];
const coach={act:n=>acts.push(n),stopTalk(){},startAudioTalk(){},startTalk(){},setSpeechLevel(){},breathe(){},mood(){}};
const store={get:()=>state,save:p=>Object.assign(state,p),savePosition:(id,index,tasks)=>{state.lastLesson=id;state.positions[id]={index,tasks};},clearPosition:id=>{delete state.positions[id];state.lastLesson=null;},awardTask:()=>10,streak:()=>0,markComplete(){},stats:()=>({points:0}),addReps(){}};
const voice={loadManifest:()=>Promise.resolve(),available:()=>true,transcriptFor:()=>Promise.resolve(null),speak:async(k,t,o)=>{spoken++;o.onstart('audio');return 'audio';},stop:()=>stops++,pause:()=>{paused++;return true;},resume:async()=>true,setVolume(){}};
const lesson={id:'test',title:'בדיקה',icon:'',steps:[{t:'timer',title:'ראשון',act:'siren'},{t:'timer',title:'שני',act:'belly'}]};
const context=vm.createContext({console,setTimeout,clearTimeout,window:{scrollTo(){}},document:{addEventListener(){},removeEventListener(){}},globals:{h:(t,a,...k)=>new El(t,a,k),coach,store,voice,lesson,renderer:(s,host,api)=>{rendered++;host.append(new El('button',{},['התחילו']));api.onCleanup(()=>destroyed++);api.onPause(()=>exercisePauses++);}}});
const sources={
 './knowledge.js':'export const renderKnowledge=()=>globals.h("div",null,"ידע");',
 './ui.js':'export const h=globals.h;',
 './coach.js':'export const createCoach=()=>globals.coach;export const ACT_LABELS={siren:"סירנה",belly:"נשימה"};',
 './audio.js':'export const tts={available:true};export function setDemoVolume(){}',
 './steps.js':'export const TASK_TYPES=new Set(["timer"]);export const RENDERERS={timer:globals.renderer};',
 './pitch.js':'export const RANGES={mid:{root:52}};',
 './narration.js':'export const spokenText=s=>s.title;export const narrationFor=spokenText;export const audioKey=(id,i)=>`${id}-${i}`;',
 './voice.js':'export const {loadManifest,available,transcriptFor,speak,stop,pause,resume,setVolume}=globals.voice;',
 './recorded-lines.js':'export const playLine=async()=>true;export function stopLine(){};export const pauseLine=()=>true;export const resumeLine=async()=>true;export function setLineVolume(){};',
 './progress.js':'export const {get,save,savePosition,clearPosition,awardTask,streak,markComplete,stats,addReps}=globals.store;',
 './data.js':'export const LESSONS=[globals.lesson];',
 './guides.js':'export const guideFor=()=>null;export const renderGuide=()=>null;'
};
const module=new vm.SourceTextModule(await fs.readFile(new URL('../js/player.js',import.meta.url),'utf8'),{context});
await module.link(async id=>new vm.SourceTextModule(sources[id],{context}));await module.evaluate();
let teardown=module.namespace.mountPlayer(lesson,main,{onExit(){}});
await Promise.resolve();
assert.equal(rendered,0,'exercise must not start or mount during narration');
assert.equal(state.positions.test.index,0);
button('צפו בהדגמה').click();assert.equal(rendered,0);assert.equal(acts.at(-1),'siren');
button('הבנתי, לתרגול').click();assert.equal(rendered,1);
button('השמע שוב').click();assert.equal(destroyed,0,'returning to narration retains the exercise view');assert.ok(exercisePauses>0,'exercise is paused on leaving practice');assert.equal(elements(main).find(x=>x.attrs.class==='exercise').hidden,true);
await Promise.resolve();button('השהיה').click();assert.equal(paused,1);assert.ok(button('המשך'));
await button('המשך').events.click[0]();
button('3 · תרגול').click();const cleanupBeforeKnowledge=destroyed;const rendersBeforeKnowledge=rendered;button('הרחבת ידע').click();assert.equal(destroyed,cleanupBeforeKnowledge,'opening knowledge retains exercise state');assert.equal(rendered,rendersBeforeKnowledge);assert.equal(elements(main).find(x=>x.attrs.id==='knowledge-panel').hidden,false);assert.equal(elements(main).find(x=>x.attrs.id==='guide-panel').hidden,true);
button('לשלב הבא').click();assert.equal(state.positions.test.index,1);assert.equal(elements(main).find(x=>x.attrs.id==='knowledge-panel').hidden,true,'a new step returns to its guidance panel');
teardown();
teardown=module.namespace.mountPlayer(lesson,main,{onExit(){}});assert.equal(state.positions.test.index,1,'restore interrupted lesson');
button('התחילו את השיעור מחדש').click();assert.equal(state.positions.test.index,0);teardown();
console.log('PASS: lesson phases, exercise cleanup, narration pause/resume, position restore and restart');

// Real persistence module: migration of existing browser data retains scores.
const pctx=vm.createContext({window:{localStorage:{getItem:()=>JSON.stringify({points:90,completed:{intro:123}}),setItem:(k,v)=>storage.set(k,v)},dispatchEvent(){}},Event:class{}});
const pm=new vm.SourceTextModule(await fs.readFile(new URL('../js/progress.js',import.meta.url),'utf8'),{context:pctx});await pm.link(()=>{});await pm.evaluate();
const ps=pm.namespace;assert.equal(ps.get().points,90);ps.savePosition('breath',3,[1]);assert.equal(ps.get().positions.breath.index,3);assert.equal(ps.get().completed.intro,123);ps.clearPosition('breath');assert.equal(ps.get().positions.breath,undefined);assert.equal(ps.get().points,90);
console.log('PASS: progress migration preserves existing achievements');

// Native media adapter: pausing resumes the same file and creates one analyser.
let media, analyserCount=0, ended=0;
class MockAudio { constructor(src){this.src=src;this.paused=true;media=this;}async play(){this.paused=false;this.onplaying?.();}pause(){this.paused=true;} }
class MockAC {constructor(){this.destination={};}createMediaElementSource(){analyserCount++;return{connect(){},disconnect(){}};}createAnalyser(){return{connect(){},disconnect(){},getByteTimeDomainData(v){v.fill(128);}};}resume(){return Promise.resolve();}close(){} }
const vctx=vm.createContext({Audio:MockAudio,window:{AudioContext:MockAC},requestAnimationFrame:()=>1,cancelAnimationFrame(){},Uint8Array,fetch:async url=>({ok:true,json:async()=>url.includes('cedar-map')?{'test-0':{file:'test.mp3',contentHash:'x'}}:{items:{}}}),globals:{store:{get:()=>({tts:true,speed:1,speechVolume:.6})}}});
const vmod=new vm.SourceTextModule(await fs.readFile(new URL('../js/voice.js',import.meta.url),'utf8'),{context:vctx});
await vmod.link(async id=>new vm.SourceTextModule(id==='./audio.js'?'export const tts={available:false,cancel(){}};':id==='./progress.js'?'export const get=globals.store.get;':'export const hashText=()=>"x";',{context:vctx}));await vmod.evaluate();
const v=vmod.namespace;assert.equal(await v.speak('test-0','text',{onend:()=>ended++,onlevel(){}}),'audio');assert.equal(media.volume,.6);media.currentTime=4.3;assert.equal(v.pause(),true);assert.equal(media.paused,true);await v.resume();assert.equal(media.currentTime,4.3);assert.equal(analyserCount,1);media.onended();assert.equal(ended,1);assert.equal(await v.resume(),false);
console.log('PASS: recording pause/resume preserves position and a single analyser');

// Coach lifecycle and pose sequencing, without claiming a visual browser test.
let timerId=0;const timers=new Map();const root={dataset:{},isConnected:true,innerHTML:'id="fademask" url(#fademask)',style:{setProperty(){}},querySelector:()=>({setAttribute(){}}),querySelectorAll:()=>[]};
const cctx=vm.createContext({window:{matchMedia:()=>({matches:false})},document:{body:{}},Math,fetch:async()=>({ok:true,json:async()=>({siren:'siren.webp',present:'present.webp'})}),setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),setInterval:()=>++timerId,clearInterval(){},MutationObserver:class{observe(){}disconnect(){}}});
const cm=new vm.SourceTextModule(await fs.readFile(new URL('../js/coach.js',import.meta.url),'utf8'),{context:cctx});await cm.link(()=>{});await cm.evaluate();const ch=cm.namespace.createCoach({set innerHTML(v){},querySelector:()=>root});await Promise.resolve();await Promise.resolve();await Promise.resolve();ch.act('siren',{dur:6});assert.equal(root.dataset.act,'siren');ch.startAudioTalk();assert.equal(root.dataset.act,'rest');assert.equal(root.dataset.pose,'0');ch.setSpeechLevel(1);assert.equal(root.dataset.mouth,'open1');ch.stopTalk();assert.equal(root.dataset.mouth,'closed');assert.ok(!root.innerHTML.includes('headclip-'),'do not alter the original hair silhouette');
console.log('PASS: speech resets demonstration poses and keeps mouth local');
assert.equal(await v.speak('absent-0','changed',{onlevel(){}}),null);assert.equal(v.pause(),false,'missing audio must not leave a phantom paused player');
console.log('PASS: missing audio has no stale playback state');

// Music respects browser autoplay policy, silent lesson/tool routes and saved zero volume.
let musicAudio, musicBlocked=true;
class MusicAudio {constructor(){musicAudio=this;this.events={};this.paused=true;}addEventListener(k,fn){this.events[k]=fn;}async play(){if(musicBlocked)throw new Error('autoplay');this.paused=false;}pause(){this.paused=true;} }
const musicState={musicEnabled:true,musicVolume:0};const musicHost=new El('body');
const musicDoc={hidden:false,addEventListener(){},removeEventListener(){}};
const mctx=vm.createContext({Audio:MusicAudio,document:musicDoc,globals:{h:(t,a,...k)=>new El(t,a,k),store:{get:()=>musicState,save:p=>Object.assign(musicState,p)}}});
const mm=new vm.SourceTextModule(await fs.readFile(new URL('../js/music.js',import.meta.url),'utf8'),{context:mctx});
await mm.link(async id=>new vm.SourceTextModule(id==='./ui.js'?'export const h=globals.h;':'export const {get,save}=globals.store;',{context:mctx}));await mm.evaluate();
const music=mm.namespace.mountMusic(musicHost);assert.equal(musicAudio.volume,0,'keep a saved muted volume');
music.setPage('home');await Promise.resolve();await Promise.resolve();const musicButton=elements(musicHost).find(e=>e.tag==='button');assert.ok(musicButton.textContent.includes('הפעילו'));
musicBlocked=false;musicButton.click();await new Promise(setImmediate);assert.equal(musicAudio.paused,false);
music.setPage('lesson');assert.equal(musicAudio.paused,true);music.setPage('tools');assert.equal(musicAudio.paused,true);
music.setPage('home');await new Promise(setImmediate);assert.equal(musicAudio.paused,false);
musicButton.click();await Promise.resolve();assert.equal(musicState.musicEnabled,false);assert.equal(musicAudio.paused,true);
music.setPage('course');await Promise.resolve();assert.equal(musicAudio.paused,true);
console.log('PASS: music autoplay recovery, zero volume, quiet lessons/tools and persistent off preference');

// Real knowledge topics: every current course step has explanatory content and primary sources.
const kctx=vm.createContext({globals:{h:(t,a,...k)=>new El(t,a,k)}});
const km=new vm.SourceTextModule(await fs.readFile(new URL('../js/knowledge.js',import.meta.url),'utf8'),{context:kctx});await km.link(async()=>new vm.SourceTextModule('export const h=globals.h;',{context:kctx}));await km.evaluate();
const dm=new vm.SourceTextModule(await fs.readFile(new URL('../js/data.js',import.meta.url),'utf8'),{context:kctx});await dm.link(()=>{});await dm.evaluate();
let knowledgeCount=0;for(const lesson of dm.namespace.ALL)for(const step of lesson.steps){const info=km.namespace.knowledgeFor(lesson,step);assert.ok(info.title&&info.mechanism&&info.goal);const panel=km.namespace.renderKnowledge(lesson,step);assert.ok(panel.textContent.includes('מיתרי הקול'));assert.ok(panel.textContent.includes('מה משפיע'));knowledgeCount++;}
assert.equal(km.namespace.knowledgeFor({id:'warmup'},{act:'straw'}).key,'straw');assert.equal(km.namespace.knowledgeFor({id:'transfer'},{act:'hum'}).key,'hum');assert.equal(km.namespace.SOURCES.length,3);
console.log(`PASS: contextual knowledge for all ${knowledgeCount} lesson screens, anatomy, influences and primary source links`);

// Completion is recorded once even if the hidden Next button receives another click.
let completions=0;store.markComplete=()=>completions++;
const endContext=vm.createContext({console,setTimeout,clearTimeout,window:{scrollTo(){}},document:{addEventListener(){},removeEventListener(){}},globals:{h:(t,a,...k)=>new El(t,a,k),coach,store,voice,lesson,renderer:(s,host,api)=>host.append(new El('button',{},['התחילו']))}});
const endMod=new vm.SourceTextModule(await fs.readFile(new URL('../js/player.js',import.meta.url),'utf8'),{context:endContext});await endMod.link(async id=>new vm.SourceTextModule(sources[id],{context:endContext}));await endMod.evaluate();store.clearPosition('test');let endTeardown=endMod.namespace.mountPlayer(lesson,main,{onExit(){}});button('לשלב הבא').click();const ending=button('סיום השיעור');ending.click();assert.equal(completions,1);ending.click();assert.equal(completions,1);endTeardown();
console.log('PASS: repeated completion cannot inflate lesson runs');

// Late microphone permissions must be released immediately after the view is destroyed.
let resolveMic,streamStops=0;const meterHost=new El('div');El.prototype.getContext=()=>null;El.prototype.remove=()=>{};
const micContext=vm.createContext({console,Float32Array,performance:{now:()=>0},window:{addEventListener(){},removeEventListener(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,globals:{h:(t,a,...k)=>new El(t,a,k),startMic:()=>new Promise(resolve=>{resolveMic=resolve;})}});
const meterMod=new vm.SourceTextModule(await fs.readFile(new URL('../js/meter.js',import.meta.url),'utf8'),{context:micContext});await meterMod.link(async id=>new vm.SourceTextModule(id==='./ui.js'?'export const h=globals.h;':id==='./audio.js'?'export const startMic=globals.startMic;export const micErrorText=()=>"error";':'export const detectPitch=()=>null;export const rms=()=>0;export const level=()=>0;export const freqToMidi=()=>0;export const noteName=()=>"";export const isNatural=()=>false;',{context:micContext}));await meterMod.evaluate();const meter=meterMod.namespace.createMeter(meterHost);const micButton=elements(meterHost).find(e=>e.tag==='button'&&e.textContent.includes('הפעילו'));micButton.click();meter.destroy();resolveMic({stop:()=>streamStops++,sampleRate:24000});await new Promise(setImmediate);assert.equal(streamStops,1);
console.log('PASS: late microphone stream is stopped after navigation');

// Exercise adapters preserve timer state, wait through a final-second pause and require practice confirmation.
let intervalCallback=null;const sleeping=[];let playbackOptions=null;let pausedExercise=false,practiceAwards=0,practiceReps=0;
const sctx=vm.createContext({console,performance:{now:()=>1000},setInterval:fn=>(intervalCallback=fn,1),clearInterval:()=>{intervalCallback=null;},setTimeout:(fn,ms)=>(sleeping.push({fn,ms}),sleeping.length),clearTimeout(){},globals:{h:(t,a,...k)=>{const e=new El(t,a,k);e.classList.toggle=()=>{};return e;},audio:{playSequence:(notes,opts)=>(playbackOptions=opts,{stop(){opts.onEnd?.();}}),playGlide:()=>({stop(){}})}}});
const sm=new vm.SourceTextModule(await fs.readFile(new URL('../js/steps.js',import.meta.url),'utf8'),{context:sctx});await sm.link(async id=>new vm.SourceTextModule(id==='./ui.js'?'export const h=globals.h;export const fmtTime=n=>String(n);export const richText=t=>t;':id==='./progress.js'?'export const get=()=>({bestExhale:0,range:"mid"});export function save(){}':id==='./pitch.js'?'export const RANGES={mid:{root:52}};export const midiToFreq=n=>n;export const noteName=n=>String(n);':id==='./audio.js'?'export const {playSequence,playGlide}=globals.audio;export function chime(){};export function getCtx(){};':'export function createMeter(){return{stop(){},destroy(){}};}',{context:sctx}));await sm.evaluate();
const pauses=[];const exerciseApi={coach,onPause:fn=>pauses.push(fn),onCleanup(){},isPaused:()=>pausedExercise,rootMidi:()=>52,rep:()=>practiceReps++,task:()=>practiceAwards++};
let timerHost=new El('div');sm.namespace.RENDERERS.timer({secs:5,label:'טיימר'},timerHost,exerciseApi);elements(timerHost).find(e=>e.tag==='button'&&e.textContent.includes('התחילו')).click();intervalCallback();intervalCallback();const timerText=elements(timerHost).find(e=>e.attrs.class==='ring-time');assert.equal(timerText.textContent,'3');pauses.at(-1)();assert.equal(intervalCallback,null);assert.equal(timerText.textContent,'3');elements(timerHost).find(e=>e.tag==='button'&&e.textContent.includes('המשיכו')).click();assert.equal(timerText.textContent,'3');
let breathHost=new El('div');sm.namespace.RENDERERS.breath({cycles:1,pattern:[['נשיפה',1,'out']]},breathHost,exerciseApi);elements(breathHost).find(e=>e.tag==='button').click();pausedExercise=true;const awardBefore=practiceAwards;sleeping.shift().fn();await new Promise(setImmediate);assert.equal(practiceAwards,awardBefore,'final-second pause must delay completion');pausedExercise=false;sleeping.shift().fn();await new Promise(setImmediate);assert.equal(practiceAwards,awardBefore+1);
let scaleHost=new El('div');sm.namespace.RENDERERS.scale({notes:[0,2,0],syll:['מי','מי','מי'],mic:false},scaleHost,exerciseApi);elements(scaleHost).find(e=>e.tag==='button'&&e.textContent.includes('השמיעו')).click();const beforeListening=practiceAwards;playbackOptions.onNote(2);playbackOptions.onEnd();assert.equal(practiceAwards,beforeListening,'reference playback is not vocal practice');elements(scaleHost).find(e=>e.tag==='button'&&e.textContent.includes('תרגלתי בקול')).click();assert.equal(practiceAwards,beforeListening+1);
ch.act('trill');assert.equal(root.dataset.mouth,'round');assert.equal(root.dataset.pose,'0');
console.log('PASS: preserved timer, final-second breath pause, explicit practice confirmation and stable trill portrait');

// Reflections offer an explicit rest/resume path; pain cannot resume the current practice.
El.prototype.prepend=function(...kids){this.children.unshift(...kids.flat(Infinity));};
let capturedPractice;
const reflectionContext=vm.createContext({console,Date,setTimeout:()=>1,clearTimeout,window:{scrollTo(){}},document:{addEventListener(){},removeEventListener(){}},globals:{h:(t,a,...k)=>new El(t,a,k),coach,store,voice,lesson,renderer:(s,host,api)=>{capturedPractice=api;host.append(new El('button',{},['התחילו']));api.onPause(()=>{});}}});
const reflectionMod=new vm.SourceTextModule(await fs.readFile(new URL('../js/player.js',import.meta.url),'utf8'),{context:reflectionContext});await reflectionMod.link(async id=>new vm.SourceTextModule(sources[id],{context:reflectionContext}));await reflectionMod.evaluate();store.clearPosition('test');const reflectionExit=reflectionMod.namespace.mountPlayer(lesson,main,{onExit(){}});button('3 · תרגול').click();capturedPractice.task();button('הרגשתי מאמץ').click();assert.equal(capturedPractice.isPaused(),true);button('נחתי, לחזור לתרגול').click();assert.equal(capturedPractice.isPaused(),false);button('כאב או צרידות').click();assert.equal(capturedPractice.isPaused(),true);button('הרחבת ידע').click();button('הדרכה ותרגול').click();assert.equal(capturedPractice.isPaused(),true);reflectionExit();
console.log('PASS: comfort reflection, explicit rest/resume and pain stop');

// QA approvals follow exact recording bytes and retain multiline reviewer notes.
const qctx=vm.createContext({});const qm=new vm.SourceTextModule(await fs.readFile(new URL('../js/review-state.js',import.meta.url),'utf8'),{context:qctx});await qm.link(()=>{});await qm.evaluate();const q=qm.namespace;const qaRow={key:'intro-1',lesson:'היכרות',seconds:21.15,transcript:'טקסט',audio_hash:'new',technical_flags:'בדיקה'};
assert.equal(q.reviewStatus('good',qaRow),null,'legacy unversioned verdict needs review');assert.equal(q.reviewStatus({audioHash:'old',status:'good'},qaRow),null);const review=q.reviewEntry(null,qaRow,{status:'bad',notes:'מילה "חתוכה"\nבשורה השנייה'});assert.equal(q.reviewStatus(review,qaRow),'bad');assert.equal(q.reviewStatus(review,{...qaRow,audio_hash:'replacement'}),null);const csv=q.reviewCsv([qaRow],{'intro-1':review});assert.ok(csv.includes('מילה ""חתוכה""\nבשורה השנייה'));assert.equal(v.hasRecordings(),true,'Cedar availability must not require a separate manifest');
console.log('PASS: versioned audio verdicts, reviewer notes CSV and Cedar availability');

// Construct every live exercise adapter with current course content, not just example timer fixtures.
sctx.document={createDocumentFragment:()=>new El('fragment')};let exerciseScreens=0;
for(const courseLesson of dm.namespace.ALL)for(const step of courseLesson.steps){const host=new El('div');(sm.namespace.RENDERERS[step.t]||sm.namespace.RENDERERS.say)(step,host,exerciseApi);exerciseScreens++;}
assert.equal(exerciseScreens,78);console.log('PASS: current content constructs all 78 exercise screens');
