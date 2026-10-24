import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { handleRecords, nextIsraelMidnight } from './server/records.mjs';
const sql=new DatabaseSync(':memory:');
for(const name of ['0000_sad_maddog.sql','0001_quiet_santa_claus.sql','0002_mysterious_whistler.sql'])sql.exec(readFileSync('drizzle/'+name,'utf8'));
class Statement {constructor(query,values=[]){this.query=query;this.values=values}bind(...values){return new Statement(this.query,values)}async first(){return sql.prepare(this.query).get(...this.values)||null}async run(){return this.execute()}execute(){const stmt=sql.prepare(this.query);let results=[];if(stmt.columns().length)results=stmt.all(...this.values);else stmt.run(...this.values);return{results,meta:{changes:Number(sql.prepare('SELECT changes() AS n').get().n)}}}}
const db={prepare:query=>new Statement(query),batch:async statements=>{sql.exec('BEGIN');try{const results=statements.map(s=>s.execute());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
const seed=[{id:'seed-1',name:'בדיקה בלבד',age:'24',city:'ירושלים',status:'לא נבדק',custom:{}}];
const get=async(tag)=>handleRecords(new Request('https://example.test/api/records',{headers:tag?{'If-None-Match':tag}:{}}),db,seed);
const post=async(operations,requestId=crypto.randomUUID())=>handleRecords(new Request('https://example.test/api/records',{method:'POST',headers:{'Content-Type':'application/json','X-Kesher-Client':'1'},body:JSON.stringify({requestId,operations})}),db,seed);
let first=await get(),tag=first.headers.get('etag'),data=await first.json();assert.equal(data.records.length,1);assert.equal((await get(tag)).status,304);
const op1={id:'seed-1',type:'patch',base:{age:'24'},changes:{age:'25'}};let r=await post([op1],'idempotent');assert.equal(r.status,200);data=await r.json();assert.equal(data.records[0].age,'25');const version=data.records[0]._version;
r=await post([op1],'idempotent');assert.equal((await r.json()).records[0]._version,version);
// Another visitor can merge a different field from the same old snapshot.
r=await post([{id:'seed-1',type:'patch',base:{city:'ירושלים'},changes:{city:'בני ברק'}}]);assert.equal(r.status,200);data=await r.json();assert.equal(data.records[0].age,'25');assert.equal(data.records[0].city,'בני ברק');
// Competing writes to the same field are rejected atomically, including creates in that batch.
r=await post([{id:'extra',type:'create',record:{name:'אסור להיווצר'}},{id:'seed-1',type:'patch',base:{age:'24'},changes:{age:'26'}}]);assert.equal(r.status,409);data=await(await get()).json();assert.equal(data.records.length,1);assert.equal(data.records[0].age,'25');
r=await post([{id:'seed-1',type:'delete',version:data.records[0]._version}]);data=await r.json();assert.equal(data.records.length,0);assert.equal(data.deleted.length,1);
r=await post([{id:'seed-1',type:'restore',version:data.deleted[0]._version}]);data=await r.json();assert.equal(data.records.length,1);assert.equal(data.deleted.length,0);
r=await post([{id:'party-1',type:'celebrate',groom:'חתן לבדיקה',bride:'כלה לבדיקה'},{id:'seed-1',type:'patch',base:{status:'לא נבדק'},changes:{status:'מאורס/ת'}}]);assert.equal(r.status,200);data=await r.json();assert.equal(data.records[0].status,'מאורס/ת');assert.equal(data.celebrations.length,1);assert(data.celebrations[0].expiresAt>Date.now());
// Banner expiry uses Jerusalem's calendar, including DST transition dates.
for(const date of ['2026-10-22T12:00:00Z','2026-10-24T20:00:00Z','2026-03-26T20:00:00Z']){const t=Date.parse(date),end=nextIsraelMidnight(t),fmt=new Intl.DateTimeFormat('he-IL',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});assert.equal(fmt.format(end),'00:00');assert(end>t&&end-t<=26*3600000);assert.notEqual(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',day:'2-digit'}).format(end),new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',day:'2-digit'}).format(t));}
const cross=await handleRecords(new Request('https://example.test/api/records',{method:'POST',headers:{'Content-Type':'application/json','X-Kesher-Client':'1','Origin':'https://evil.test'},body:'{}'}),db,seed);assert.equal(cross.status,403);
assert(sql.prepare('SELECT count(*) AS n FROM profile_history').get().n>=4);
console.log('PASS: shared reads, conditional polling, independent-field merge, conflict atomicity, idempotency, soft delete/restore, engagement + celebration, Israel midnight/DST, cross-origin write rejection');
const seededDates={id:'seed-1',type:'patch',base:{custom:{}},changes:{custom:{'תאריך לידה כפי הרזומה':'כ״ד תשרי תשס״ג'}}};
assert.equal((await post([seededDates])).status,200);
let dates=await(await get()).json();assert.equal(dates.records[0].birthDate,'כ״ד תשרי תשס״ג');
assert.equal((await post([{id:'seed-1',type:'patch',base:{birthDate:'כ״ד תשרי תשס״ג'},changes:{birthDate:'2002-10-01',looking:'תכונות שנמסרו',verifiedAt:'2026-10-22',preferredAge:'23–28',preferredLocation:'ירושלים'}}])).status,200);
dates=await(await get()).json();assert.equal(dates.records[0].birthDate,'2002-10-01');assert.equal(dates.records[0].preferredAge,'23–28');
assert.equal((await post([{id:'seed-1',type:'patch',base:{birthDate:'2002-10-01'},changes:{birthDate:''}}])).status,200);
dates=await(await get()).json();assert.equal(dates.records[0].birthDate,'');
console.log('PASS: legacy birth date projection, structured fields persistence, explicit clearing without restoring stale source');
const {enrichRecord}=await import('./server/records.mjs');
const {default:reviewRows}=await import('./server/reviewed-data.mjs');
for(const row of reviewRows){const old={id:row.id,name:row.name,notes:row.notes,...row.base};const enriched=enrichRecord(old);for(const[k,v]of Object.entries(row.values))assert.deepEqual(enriched[k],v);assert.deepEqual(enrichRecord({...old,name:'שם שעודכן'}),{...old,name:'שם שעודכן'});}
const sample=reviewRows.find(r=>r.values.looking);const raw={id:sample.id,name:sample.name,notes:sample.notes,...sample.base};assert.equal(enrichRecord({...raw,looking:'עודכן בידי משתמשת'}).looking,'עודכן בידי משתמשת');assert.equal(enrichRecord({...enrichRecord(raw),looking:''}).looking,'');
console.log('PASS: all reviewed source enrichments, preservation of live edits and explicit clearing');
