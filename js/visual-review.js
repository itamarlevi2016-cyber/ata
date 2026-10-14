import {ALL} from './data.js';
import {createCoach} from './coach.js';
import {h} from './ui.js';
import * as store from './progress.js';
const select=document.querySelector('#review-lesson');const grid=document.querySelector('#review-grid');
select.append(...ALL.map(l=>h('option',{value:l.id},l.title)));
function render(){const lesson=ALL.find(l=>l.id===select.value)||ALL[0];grid.replaceChildren();
for(const [i,step]of lesson.steps.entries()){
 const host=h('div',{class:'review-coach'});const artwork=h('img',{class:'review-demo-image',hidden:true,alt:'המחשה נפרדת של התרגיל',width:'120',height:'180'});const actions=h('div',{class:'controls'});
 const card=h('section',{class:'review-card'},h('h2',null,`שלב ${i+1} · ${step.title||step.label||lesson.title}`),host,artwork,actions,h('p',null,step.say||''));grid.append(card);const coach=createCoach(host);
 const show=(kind)=>{coach.stopTalk();coach.breathe('idle');coach.mood(step.mood||'happy');coach.act(kind==='demo'?(step.act||'rest'):'rest');const pose=({flow:'palm',softvoice:'hum',transfer:'hum',speech:'present',scale:'siren'})[step.act]||step.act;const hasPose=['wave','point','present','palm','jaw','straw','hum','siren','project','cheer'].includes(pose);artwork.hidden=kind!=='demo'||!hasPose;if(!artwork.hidden)artwork.setAttribute('src',`assets/poses/${pose}.webp`);if(kind==='mouth'){coach.startAudioTalk();for(let j=0;j<4;j++)coach.setSpeechLevel(.9);}}
 for(const[k,label]of[['rest','הסבר'],['mouth','פה פתוח'],['demo','המחשה']]){const b=h('button',{class:'btn ghost small',type:'button'},label);b.addEventListener('click',()=>show(k));actions.append(b);}
 const link=h('a',{href:`index.html#/lesson/${lesson.id}`},'פתיחת השלב באתר');link.addEventListener('click',()=>store.savePosition(lesson.id,i,store.get().positions?.[lesson.id]?.tasks||[]));card.append(link);show('rest');
}}
select.addEventListener('change',render);render();
