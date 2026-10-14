import {h} from './ui.js';
import {currentReview,reviewStatus,reviewEntry,reviewCsv} from './review-state.js';
const $=id=>document.getElementById(id);let rows=[],playing=null,state={};const key='kol-batuach-qa-v1';
try{const raw=JSON.parse(localStorage.getItem(key)||'{}');if(raw&&typeof raw==='object'&&!Array.isArray(raw))state=raw;}catch{}
function save(row,patch){state[row.key]=reviewEntry(state[row.key],row,patch);try{localStorage.setItem(key,JSON.stringify(state));}catch{$('storage-message').textContent='לא ניתן לשמור בדפדפן. אפשר לייצא את התוצאות לקובץ.';}draw();}
function draw(){if(playing){playing.pause();playing=null;}const q=$('search').value.trim(),filter=$('filter').value;
 const showing=rows.filter(r=>(!q||`${r.key} ${r.lesson} ${r.transcript}`.includes(q))&&(filter==='all'||filter==='todo'&&!reviewStatus(state[r.key],r)||filter==='technical'&&r.technical_flags||reviewStatus(state[r.key],r)===filter));
 const good=rows.filter(r=>reviewStatus(state[r.key],r)==='good').length,bad=rows.filter(r=>reviewStatus(state[r.key],r)==='bad').length;
 $('counts').textContent=`${rows.length} קטעים · ${good} תקינים · ${bad} דורשים תיקון · ${rows.length-good-bad} טרם אומתו · ${showing.length} מוצגים`;
 const articles=showing.map(row=>{const status=reviewStatus(state[row.key],row);
  const info=h('div',null,h('h3',null,`${row.lesson} — ${row.key}`),h('p',{class:'caption'},row.transcript),h('small',{class:'muted'},`${row.seconds.toFixed(1)} שניות · ${row.category}`));
  if(row.technical_flags)info.append(h('p',{class:'warn'},`בדיקה טכנית: ${row.technical_flags}. זה סימון להאזנה, לא קביעה שהקטע פגום.`));
  if(state[row.key]&&!currentReview(state[row.key],row))info.append(h('p',{class:'warn'},'קיים סימון קודם שאינו קשור לגרסת הקובץ הנוכחית. נדרשת בדיקה מחדש.'));
  if(row.flags)info.append(h('details',null,h('summary',null,'הערות מהבדיקה הקודמת'),h('p',null,row.flags)));
  const audio=h('audio',{controls:true,preload:'none',src:`${row.audio}?v=${row.audio_hash.slice(0,16)}`});audio.addEventListener('play',()=>{if(playing&&playing!==audio)playing.pause();playing=audio;});
  const controls=h('div',null,audio);const choices=h('div',{class:'state'});
  for(const[value,label]of[['good','✓ תקין'],['bad','⚠ דורש תיקון'],[null,'נקה סימון']]){const button=h('button',{'aria-pressed':String(status===value),class:status===value?'primary':null,type:'button'},label);button.addEventListener('click',()=>save(row,{status:value}));choices.append(button);}
  const notes=h('textarea',{rows:'3','aria-label':`הערות בדיקה עבור ${row.key}`,placeholder:'לדוגמה: המילה שנחתכה, שגיאת הגייה או חוסר התאמה'});notes.value=currentReview(state[row.key],row)?state[row.key].notes||'':'';notes.addEventListener('change',()=>save(row,{notes:notes.value}));
  controls.append(choices,h('label',null,'הערות לביקורת',notes));return h('article',null,info,controls);
 });$('items').replaceChildren(...articles);
}
$('search').addEventListener('input',draw);$('filter').addEventListener('change',draw);
$('export').addEventListener('click',()=>{const blob=new Blob([reviewCsv(rows,state)],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=h('a',{href:url,download:'תוצאות_בדיקת_הקלטות.csv'});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
try{const result=await fetch('review/qa-data.json',{cache:'no-cache'});if(!result.ok)throw new Error('load');rows=await result.json();draw();}catch{$('items').textContent='נתוני הבדיקה לא נטענו. פתחו את העמוד דרך כתובת האתר ונסו שוב.';}
