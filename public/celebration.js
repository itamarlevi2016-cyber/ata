'use strict';
let currentCelebrations=[],celebrationCandidate=null,celebrationExpiryTimer=null,fireworkFrame=null,fireworkEnd=0,partyAudio=null,partySound=false;
const partySeen=new Set();
try{JSON.parse(sessionStorage.getItem('kesher-celebrations-seen')||'[]').forEach(id=>partySeen.add(id))}catch{}
function renderCelebrations(events) {
  currentCelebrations=events.filter(e=>e.expiresAt>Date.now());const banner=$('celebrationBanner');banner.hidden=!currentCelebrations.length;
  if(!currentCelebrations.length){banner.innerHTML='';return}
  banner.innerHTML=`<div class="celebration-ornament" aria-hidden="true">✦<span>♡</span>✧</div><div class="celebration-message"><div class="celebration-eyebrow">בסימן טוב ובמזל טוב</div><h2>מזל טוב!</h2>${currentCelebrations.map(e=>`<p class="couple-names"><b>${esc(e.groom)}</b><span> &amp; </span><b>${esc(e.bride)}</b></p>`).join('')}<p class="celebration-wish">שתזכו לבנות בית נאמן בישראל, באהבה, אחווה, שלום ורעות</p><small>השמחה של היום · מוצג עד חצות, שעון ישראל</small></div><div class="party-controls"><button class="party-replay" id="replayFireworks">✦ עוד קצת שמחה</button><button class="party-sound" id="partySoundToggle" aria-pressed="${partySound}">${partySound?'♫ כיבוי צלילים':'♫ צלילי חגיגה'}</button></div>`;
  $('replayFireworks').onclick=()=>startFireworks();$('partySoundToggle').onclick=()=>{partySound=!partySound;if(partySound){const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){partyAudio=partyAudio||new Audio();partyAudio.resume();}startFireworks()}renderCelebrations(currentCelebrations)};
  const unseen=currentCelebrations.filter(e=>!partySeen.has(e.id));if(unseen.length){unseen.forEach(e=>partySeen.add(e.id));try{sessionStorage.setItem('kesher-celebrations-seen',JSON.stringify([...partySeen]))}catch{}startFireworks();}
  clearTimeout(celebrationExpiryTimer);celebrationExpiryTimer=setTimeout(()=>renderCelebrations(currentCelebrations),Math.max(50,Math.min(...currentCelebrations.map(e=>e.expiresAt))-Date.now()+20));
}
function openCelebration(id) {
  if(!sharedReady){toast('המתיני לחיבור למאגר המשותף');return}
  celebrationCandidate=id||null;$('celebrationForm').reset();
  for(const [field,gender]of [['groom','מועמד'],['bride','מועמדת']])$(field+'Options').innerHTML=records.filter(r=>r.gender===gender&&!r.needsCompletion&&r.status!=='מאורס/ת').map(r=>`<option value="${esc(r.name)}"></option>`).join('');
  const r=records.find(r=>r.id===id);if(r){if(r.gender==='מועמד')$('groomName').value=r.name;else if(r.gender==='מועמדת')$('brideName').value=r.name;}
  open('celebrationDialog');
}
function boom() {
  if(!partySound||!partyAudio)return;const audio=partyAudio,seconds=.34,buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*seconds),audio.sampleRate),samples=buffer.getChannelData(0);
  for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.pow(1-i/samples.length,2);
  const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=430;gain.gain.value=.12;source.connect(filter);filter.connect(gain);gain.connect(audio.destination);source.start();
}
function startFireworks() {
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const canvas=$('fireworksCanvas'),ctx=canvas.getContext('2d');if(!ctx)return;
  cancelAnimationFrame(fireworkFrame);canvas.hidden=false;const dpr=Math.min(window.devicePixelRatio||1,2),w=window.innerWidth,h=window.innerHeight;canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);
  const colors=['#f3c94b','#ed70a8','#60c5d0','#80bf87','#c29cdb','#ffffff'];let particles=[],rockets=[],lastLaunch=0,lastTime=0;fireworkEnd=performance.now()+10500;
  function burst(x,y){boom();for(let i=0;i<72;i++){const angle=Math.random()*Math.PI*2,speed=1.2+Math.random()*4.7;particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:1,decay:.009+Math.random()*.011,color:colors[Math.floor(Math.random()*colors.length)],size:1.2+Math.random()*1.5})}}
  function frame(time){const step=lastTime?Math.min(2,(time-lastTime)/16.67):1;lastTime=time;ctx.clearRect(0,0,w,h);
    if(time<fireworkEnd&&time-lastLaunch>450){lastLaunch=time;rockets.push({x:w*(.15+Math.random()*.7),y:h+10,targetY:h*(.12+Math.random()*.4),color:colors[Math.floor(Math.random()*colors.length)]})}
    for(const r of rockets){r.y-=10*step;ctx.beginPath();ctx.strokeStyle=r.color;ctx.lineWidth=2;ctx.moveTo(r.x,r.y+28);ctx.lineTo(r.x,r.y);ctx.stroke();if(r.y<=r.targetY){burst(r.x,r.y);r.done=true}}
    rockets=rockets.filter(r=>!r.done);
    for(const p of particles){p.x+=p.vx*step;p.y+=p.vy*step;p.vy+=.045*step;p.vx*=Math.pow(.986,step);p.life-=p.decay*step;ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill()}
    ctx.globalAlpha=1;particles=particles.filter(p=>p.life>0);
    if(time<fireworkEnd||particles.length||rockets.length)fireworkFrame=requestAnimationFrame(frame);else{ctx.clearRect(0,0,w,h);canvas.hidden=true;}
  }
  fireworkFrame=requestAnimationFrame(frame);
}
document.addEventListener('DOMContentLoaded',()=>{
  $('reportCelebrationBtn').onclick=()=>openCelebration();
  $('celebrationForm').onsubmit=async event=>{event.preventDefault();const groom=$('groomName').value.trim(),bride=$('brideName').value.trim();if(!groom||!bride||groom===bride){toast('יש למלא את שמות החתן והכלה');return}
    const selected=records.filter(r=>r.name===groom||r.name===bride);if(records.filter(r=>r.name===groom).length>1||records.filter(r=>r.name===bride).length>1){toast('נמצאו שמות כפולים במאגר. יש להשלים זיהוי לפני הדיווח.');return}
    const operations=selected.filter(r=>r.status!=='מאורס/ת').map(r=>({id:r.id,type:'patch',changes:{status:'מאורס/ת'},base:{status:r.status??null}}));operations.push({id:uid(),type:'celebrate',groom,bride});
    const btn=$('celebrationForm').querySelector('[type=submit]');btn.disabled=true;try{if(await commitOperations(operations)){close('celebrationDialog');if($('detailDialog').open)close('detailDialog');window.scrollTo({top:0,behavior:'smooth'});toast('מזל טוב! הבשורה פורסמה אצל כולן');}}finally{btn.disabled=false}
  };
});
