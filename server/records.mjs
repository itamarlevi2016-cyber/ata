import reviewedData from './reviewed-data.mjs';
// Shared profiles use field-level conflict detection and a transactional revision gate.
const SEED_VERSION = 'shared-2026-10-22-v1';
const ALLOWED = new Set(['enrichmentVersion','name','gender','birthDate','preferredAge','preferredLocation','verifiedAt','age','community','city','occupation','school','height','religious','marital','status','phone','contact','contactPhone','contactEmail','family','looking','notes','custom','favorite','needsCompletion','documents','resumeText','aliases','createdAt','updatedAt','seedRevision','userOverrides','customOverrides','legacyIds','demo']);
const response=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow',...extra}});
const equal=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
function clean(record) {
  if(!record||typeof record!=='object'||Array.isArray(record))throw Error('כרטיס לא תקין');
  const r={};for(const[k,v]of Object.entries(record))if(ALLOWED.has(k))r[k]=v;
  if(typeof r.name!=='string'||!r.name.trim()||r.name.length>160)throw Error('יש למלא שם תקין');
  for(const k of ['gender','birthDate','preferredAge','preferredLocation','verifiedAt','age','community','city','occupation','school','height','religious','marital','status','phone','contact','contactPhone','contactEmail','family','looking','notes','resumeText'])if(r[k]!=null&&typeof r[k]!=='string'&&typeof r[k]!=='number')throw Error('פרט לא תקין בכרטיס');
  if(JSON.stringify(r).length>250000)throw Error('הכרטיס גדול מדי');
  if(r.custom&&(!Object.getPrototypeOf(r.custom)||Array.isArray(r.custom)||typeof r.custom!=='object'))throw Error('פרטים נוספים לא תקינים');
  if(r.documents)r.documents=r.documents.filter(d=>d&&typeof d.filename==='string'&&/^\/documents\/[A-Za-z0-9_.-]+$/.test(d.url)).map(d=>({filename:d.filename,url:d.url,kind:typeof d.kind==='string'?d.kind:'רזומה מקור'}));
  return r;
}
async function initialize(db,seed) {
  await db.prepare('INSERT OR IGNORE INTO shared_state (id,revision,mutation,seed_version) VALUES (1,0,?,?)').bind('','').run();
  const state=await db.prepare('SELECT seed_version FROM shared_state WHERE id=1').first();
  if(state.seed_version===SEED_VERSION)return;
  const stmts=seed.map(r=>db.prepare('INSERT OR IGNORE INTO profiles (id,payload,version,deleted,updated_at) VALUES (?,?,1,0,?)').bind(r.id,JSON.stringify(r),r.updatedAt||r.createdAt||Date.now()));
  // Backfill belongs here, outside schema migrations. Existing shared edits are never overwritten.
  for(let i=0;i<stmts.length;i+=75)await db.batch(stmts.slice(i,i+75));
  await db.prepare('UPDATE shared_state SET seed_version=? WHERE id=1').bind(SEED_VERSION).run();
}
export function nextIsraelMidnight(now) {
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'});
  const today=fmt.format(new Date(now));let lo=now,hi=now+27*3600000;
  while(hi-lo>1){const mid=Math.floor((lo+hi)/2);if(fmt.format(new Date(mid))===today)lo=mid;else hi=mid;}return hi;
}
const reviewMap=new Map(reviewedData.map(r=>[r.id,r]));
export function enrichRecord(r){
 const review=reviewMap.get(r.id);if(!review||r.enrichmentVersion==='2026-10-22-structured'||r.name!==review.name||r.notes!==review.notes)return r;
 const next={...r};for(const[k,v]of Object.entries(review.values)){if((r.userOverrides||[]).includes(k))continue;if(equal(r[k],review.base[k]))next[k]=v;}
 next.enrichmentVersion='2026-10-22-structured';return next;
}
export function withKnownContact(r){if(Object.prototype.hasOwnProperty.call(r,'contactEmail'))return r;const email=r.custom?.['מייל אשת קשר'];return email?{...r,contactEmail:String(email)}:r}
export function withKnownBirthDate(r){if(Object.prototype.hasOwnProperty.call(r,'birthDate'))return r;const date=r.custom?.['תאריך לידה כפי הרזומה']||r.custom?.['תאריך לידה'];return date?{...r,birthDate:String(date)}:r}
async function snapshot(db) {
  const result=await db.batch([db.prepare('SELECT revision FROM shared_state WHERE id=1'),db.prepare('SELECT id,payload,version,deleted,updated_at,updated_by FROM profiles ORDER BY id'),db.prepare('SELECT id,groom,bride,created_at AS createdAt,expires_at AS expiresAt FROM celebrations WHERE expires_at>? ORDER BY created_at DESC').bind(Date.now())]);
  const all=result[1].results.map(row=>({...withKnownContact(withKnownBirthDate(enrichRecord({...JSON.parse(row.payload),id:row.id}))),id:row.id,_version:row.version,_deleted:!!row.deleted,_changedAt:row.updated_at,_updatedBy:row.updated_by||''}));
  return {revision:result[0].results[0].revision,records:all.filter(r=>!r._deleted),deleted:all.filter(r=>r._deleted),celebrations:result[2].results};
}
async function mutate(db,body,actor) {
  const by=actor?actor.name||actor.email:'';
  if(typeof body.requestId!=='string'||body.requestId.length>100||!Array.isArray(body.operations)||!body.operations.length||body.operations.length>500) return response({error:'בקשת שמירה לא תקינה'},400);
  const done=await db.prepare('SELECT revision FROM applied_requests WHERE id=?').bind(body.requestId).first();
  if(done)return response(await snapshot(db));
  if(new Set(body.operations.map(op=>op.id)).size!==body.operations.length)return response({error:'כרטיס מופיע פעמיים בבקשה'},400);
  for(let attempt=0;attempt<4;attempt++) {
    const current=await snapshot(db),all=new Map([...current.records,...current.deleted].map(r=>[r.id,r]));
    const updates=[],conflicts=[],events=[];
    for(const op of body.operations) {
      if(typeof op.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(op.id))return response({error:'מזהה כרטיס לא תקין'},400);
      const old=all.get(op.id);
      if(op.type==='celebrate') {
        if(typeof op.groom!=='string'||typeof op.bride!=='string'||!op.groom.trim()||!op.bride.trim()||op.groom.length>120||op.bride.length>120||op.groom.trim()===op.bride.trim())return response({error:'יש למלא את שמות החתן והכלה'},400);
        events.push({id:op.id,groom:op.groom.trim(),bride:op.bride.trim()});continue;
      }
      if(op.type==='create') {
        if(old){conflicts.push({id:op.id,name:old.name,fields:['כרטיס כבר קיים']});continue;}
        updates.push({id:op.id,payload:clean(op.record),deleted:0,version:1});
      } else if(op.type==='patch') {
        if(!old||old._deleted){conflicts.push({id:op.id,name:old?.name||'',fields:['הכרטיס נמחק']});continue;}
        if(!op.changes||!op.base||typeof op.changes!=='object'||Array.isArray(op.changes))return response({error:'עדכון לא תקין'},400);
        const bad=Object.keys(op.changes).filter(k=>!ALLOWED.has(k)||(!equal(old[k],op.base[k])&&!equal(old[k],op.changes[k])));
        if(bad.length){conflicts.push({id:op.id,name:old.name,fields:bad});continue;}
        updates.push({id:op.id,payload:clean({...old,...op.changes}),deleted:0,version:old._version+1});
      } else if(op.type==='delete'||op.type==='restore') {
        if(!old||op.version!==old._version){conflicts.push({id:op.id,name:old?.name||'',fields:['הכרטיס עודכן בינתיים']});continue;}
        updates.push({id:op.id,payload:clean(old),deleted:op.type==='delete'?1:0,version:old._version+1});
      } else return response({error:'פעולה לא מוכרת'},400);
    }
    if(conflicts.length)return response({error:'הכרטיס השתנה אצל משתמשת אחרת. הפרטים שלך נשארו בטופס; בדקי את הגרסה החדשה לפני שמירה.',conflicts,current},409);
    const token=crypto.randomUUID(),now=Date.now();
    const gate='EXISTS (SELECT 1 FROM shared_state WHERE id=1 AND mutation=?)';
    const statements=[db.prepare('UPDATE shared_state SET revision=revision+1,mutation=? WHERE id=1 AND revision=?').bind(token,current.revision)];
    for(const u of updates) {
      statements.push(db.prepare(`INSERT INTO profile_history (id,profile_id,payload,version,deleted,changed_at,changed_by) SELECT ?,id,payload,version,deleted,?,? FROM profiles WHERE id=? AND ${gate}`).bind(crypto.randomUUID(),now,by,u.id,token));
      statements.push(db.prepare(`INSERT INTO profiles (id,payload,version,deleted,updated_at,updated_by) SELECT ?,?,?,?,?,? WHERE ${gate} ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,version=excluded.version,deleted=excluded.deleted,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(u.id,JSON.stringify({...u.payload,updatedAt:now}),u.version,u.deleted,now,by,token));
    }
    for(const e of events)statements.push(db.prepare(`INSERT OR IGNORE INTO celebrations (id,groom,bride,created_at,expires_at) SELECT ?,?,?,?,? WHERE ${gate}`).bind(e.id,e.groom,e.bride,now,nextIsraelMidnight(now),token));
    statements.push(db.prepare(`INSERT OR IGNORE INTO applied_requests (id,revision) SELECT ?,revision FROM shared_state WHERE id=1 AND mutation=?`).bind(body.requestId,token));
    // D1 batch is atomic; the gate prevents partial writes if another request won the revision.
    const saved=await db.batch(statements);
    if(saved[0].meta.changes)return response(await snapshot(db));
    const retryDone=await db.prepare('SELECT revision FROM applied_requests WHERE id=?').bind(body.requestId).first();
    if(retryDone)return response(await snapshot(db));
  }
  return response({error:'המאגר מתעדכן כרגע. נסי לשמור שוב בעוד רגע.'},409);
}
/** @param {{id?:string,email:string,name?:string|null}|null} actor המשתמשת המחוברת, לרישום מי ביצעה כל שינוי */
export async function handleRecords(request,binding,seed,actor=null) {
  const user=actor?{email:actor.email,name:actor.name||'',role:actor.role||'member'}:null;
  try {
    if(!binding)return response({error:'המאגר המשותף אינו זמין כרגע'},503);
    const db=binding.withSession?binding.withSession('first-primary'):binding;
    if(request.method==='POST') {
      if(!request.headers.get('content-type')?.includes('application/json')||request.headers.get('x-kesher-client')!=='1'||request.headers.get('sec-fetch-site')==='cross-site')return response({error:'בקשה לא מורשית'},403);
      const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return response({error:'מקור בקשה לא תקין'},403);
      if(Number(request.headers.get('content-length')||0)>12000000)return response({error:'הייבוא גדול מדי; פצלי אותו'},413);
      await initialize(db,seed);
      const raw=await request.text();if(raw.length>12000000)return response({error:'הייבוא גדול מדי; פצלי אותו'},413);
      return await mutate(db,JSON.parse(raw),actor);
    }
    await initialize(db,seed);
    const state=await db.prepare('SELECT revision FROM shared_state WHERE id=1').first();
    const tag='"contacts-v4-'+(user?user.email.length:0)+'-'+state.revision+'-'+new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())+'"';
    if(request.headers.get('if-none-match')===tag)return new Response(null,{status:304,headers:{'Cache-Control':'no-store','ETag':tag}});
    const data=await snapshot(db);return response({...data,user,etag:tag},200,{'ETag':tag});
  } catch(error) {
    console.error('Shared records request failed:',error instanceof Error?error.message:'unknown');
    return response({error:'לא ניתן להשלים את הפעולה כרגע. השינויים בטופס נשמרו; נסי שוב.'},500);
  }
}
