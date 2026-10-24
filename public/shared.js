'use strict';
let sharedReady=false,sharedSaving=false,sharedRevision=-1,sharedEtag=null,deletedRecords=[],syncTimer=null,localMigration=[],localMigrationDismissed=false;
function syncStatus(text,kind='ready') {const el=$('syncStatus');el.textContent=text;el.dataset.state=kind;$('connectionBanner').hidden=kind!=='offline';}
function acceptShared(data) {
  if(data.etag)sharedEtag=data.etag;else sharedEtag=null;records=data.records;deletedRecords=data.deleted||[];sharedRevision=data.revision;sharedReady=true;render();
  if($('detailDialog').open){const id=$('detailContent').dataset.recordId;const record=records.find(r=>r.id===id);if(!record)close('detailDialog');else if(String(record._version)!==$('detailContent').dataset.version){close('detailDialog');detail(id);}}
  syncStatus('מאגר משותף · מעודכן לכולן');renderCelebrations(data.celebrations||[]);if(data.user)showUser(data.user);
}
async function refreshShared(force=false) {
  if(sharedSaving||(!force&&document.hidden))return;
  try {const response=await fetch('/api/records',{cache:'no-store',headers:sharedEtag?{'If-None-Match':sharedEtag}:{}});if(response.status===304){syncStatus('מאגר משותף · מעודכן לכולן');return}const data=await response.json();if(!response.ok)throw Error(data.error);acceptShared(data);}
  catch{syncStatus('אין חיבור · לא ניתן לשמור כרגע','offline');}
}
async function commitOperations(operations) {
  if(!operations.length)return true;
  if(sharedSaving){toast('שמירה קודמת עדיין מתבצעת. המתיני רגע.');return false}
  sharedSaving=true;syncStatus('שומרת במאגר המשותף…','saving');$('editForm').querySelector('[type=submit]').disabled=true;$('confirmImport').disabled=true;
  let completed=0;
  try {
    for(let i=0;i<operations.length;i+=50) {
      const response=await fetch('/api/records',{method:'POST',headers:{'Content-Type':'application/json','X-Kesher-Client':'1'},body:JSON.stringify({requestId:uid(),operations:operations.slice(i,i+50)})});
      const data=await response.json();if(!response.ok){if(data.current)acceptShared(data.current);if(response.status===409&&$('editDialog').open){$('editConflict').hidden=false;$('editConflictText').textContent=data.error;}const error=Error((completed?completed+' רשומות כבר נשמרו. ':'')+(data.error||'השמירה נכשלה'));error.conflict=response.status===409;throw error;}
      acceptShared(data);completed+=Math.min(50,operations.length-i);syncStatus('שומרת במאגר המשותף…','saving');
    }
    syncStatus('נשמר במאגר · זמין לכולן');return true;
  } catch(error){toast(error.message||'לא ניתן לשמור ללא חיבור. הפרטים נשארו בטופס.');syncStatus(error.conflict?'הכרטיס השתנה · בדקי את הגרסה החדשה':'השמירה לא הושלמה · נסי שוב',error.conflict?'conflict':'offline');return false;}
  finally{sharedSaving=false;$('editForm').querySelector('[type=submit]').disabled=false;$('confirmImport').disabled=false;}
}
async function initializeShared() {
  syncStatus('מתחברת למאגר המשותף…','loading');await refreshShared(true);prepareLocalMigration();
  syncTimer=setInterval(()=>refreshShared(),5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshShared(true)});window.addEventListener('online',()=>refreshShared(true));
}
function prepareLocalMigration() {
  if(!sharedReady||localMigrationDismissed)return;
  let dismissed=false;try{dismissed=localStorage.getItem(KEY+':shared-migrated')==='1'}catch{}if(dismissed)return;
  const shared=new Map(records.map(r=>[r.id,r]));localMigration=[];
  for(const local of legacyRecords.filter(r=>!r.demo)) {
    const cloud=shared.get(local.id)||records.find(r=>r.legacyIds?.includes(local.id)&&r.custom?.['מקור']===local.custom?.['מקור']);
    if(!cloud){if(!local.id?.startsWith('seed-'))localMigration.push({local,cloud:null,keys:['כרטיס חדש']});continue;}
    const keys=(local.userOverrides||[]).filter(k=>!['userOverrides','customOverrides'].includes(k)&&JSON.stringify(local[k]??null)!==JSON.stringify(cloud[k]??null));
    if((local.customOverrides||[]).some(k=>local.custom?.[k]!==cloud.custom?.[k]))keys.push('custom');
    if(keys.length)localMigration.push({local,cloud,keys});
  }
  $('legacyBanner').hidden=!localMigration.length;$('legacyCount').textContent=localMigration.length;
}
function migrationPreview() {
  prepareLocalMigration();$('legacyList').innerHTML=localMigration.map(({local,keys})=>`<li><b>${esc(local.name)}</b><small>${esc(keys.map(k=>labels[k]||k).join(' · '))}</small></li>`).join('');open('legacyDialog');
}
async function migrateLocal() {
  if(!sharedReady)return;const ops=localMigration.map(({local,cloud,keys})=>{if(!cloud)return{id:local.id||uid(),type:'create',record:local};const changes={},base={};for(const k of keys){base[k]=cloud[k]??null;changes[k]=k==='custom'?{...cloud.custom,...Object.fromEntries((local.customOverrides||[]).map(key=>[key,local.custom?.[key]??'']))}:local[k]??null;}return{id:cloud.id,type:'patch',changes,base}});
  if(await commitOperations(ops)){try{localStorage.setItem(KEY+':shared-migrated','1')}catch{}localMigrationDismissed=true;$('legacyBanner').hidden=true;close('legacyDialog');toast('השינויים הקודמים הועברו למאגר המשותף');}
}
function showDeleted() {$('deletedList').innerHTML=deletedRecords.length?deletedRecords.map(r=>`<div class="deleted-row"><span><b>${esc(r.name)}</b><small>נמחק ב־${esc(new Date(r._changedAt).toLocaleString('he-IL'))}</small></span><button class="outline" data-restore="${esc(r.id)}">שחזור</button></div>`).join(''):'<p class="muted">אין כרטיסים שנמחקו.</p>';open('deletedDialog');}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-restore]');if(!b)return;const r=deletedRecords.find(r=>r.id===b.dataset.restore);if(r&&await commitOperations([{id:r.id,type:'restore',version:r._version}])){close('deletedDialog');showDeleted();toast('הכרטיס שוחזר למאגר אצל כולן')}});
// Bind after the app's deferred script has created its forms and helpers.
document.addEventListener('DOMContentLoaded',()=>{
  $('syncRetry').onclick=()=>refreshShared(true);$('deletedBtn').onclick=()=>{close('helpDialog');showDeleted()};$('legacyReview').onclick=migrationPreview;$('legacyConfirm').onclick=migrateLocal;
  $('legacyBackup').onclick=()=>download(JSON.stringify(legacyRecords,null,2),'kesher-tov-previous-browser-backup.json','application/json');
  $('reloadConflict').onclick=()=>{const r=records.find(r=>r.id===editing);if(r&&confirm('לטעון את הגרסה החדשה? הטקסט שטרם נשמר בטופס יוחלף.'))edit(editing)};
});
