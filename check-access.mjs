// בדיקת זרימת ההצטרפות: בקשה → המתנה → אישור על ידי מנהלת → כניסה, וכן דחייה, הסרה ומנהלות קבועות.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { authorize } from './server/auth.mjs';
import { handleAccess } from './server/access.mjs';
const sql = new DatabaseSync(':memory:');
for (const name of ['0000_sad_maddog.sql', '0001_quiet_santa_claus.sql', '0002_mysterious_whistler.sql', '0003_robust_polaris.sql']) sql.exec(readFileSync('drizzle/' + name, 'utf8'));
class Statement { constructor(query, values = []) { this.query = query; this.values = values; } bind(...values) { return new Statement(this.query, values); } async first() { return sql.prepare(this.query).get(...this.values) || null; } async run() { return this.execute(); } async all() { return this.execute(); } execute() { const stmt = sql.prepare(this.query); let results = []; if (stmt.columns().length) results = stmt.all(...this.values); else stmt.run(...this.values); return { results, meta: { changes: Number(sql.prepare('SELECT changes() AS n').get().n) } }; } }
const db = { prepare: query => new Statement(query) };
const env = { KESHER_ALLOWED_EMAILS: 'admin@example.com' };
const as = (email, name = '') => ({ 'oai-authenticated-user-id': 'id-' + email, 'oai-authenticated-user-email': email, 'oai-authenticated-user-full-name': encodeURIComponent(name), 'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8' });
const get = (email) => new Request('https://example.test/', { headers: as(email) });
const post = (email, body, name = '') => new Request('https://example.test/api/access', { method: 'POST', headers: { ...as(email, name), 'Content-Type': 'application/json', 'X-Kesher-Client': '1' }, body: JSON.stringify(body) });
const call = async (request) => handleAccess(request, db, await authorize(request, env, db), ['admin@example.com']);

// אנונימית ומנהלת קבועה
assert.equal((await authorize(new Request('https://example.test/'), env, db)).status, 'anonymous');
let a = await authorize(get('admin@example.com'), env, db); assert.equal(a.status, 'ok'); assert.equal(a.user.role, 'admin'); assert.equal(a.user.pendingRequests, 0);
// חדשה: לא יכולה לקרוא את רשימת החברות, אבל יכולה לבקש הצטרפות
assert.equal((await authorize(get('rivka@example.com'), env, db)).status, 'new');
let r = await call(new Request('https://example.test/api/access', { headers: as('rivka@example.com') })); assert.equal((await r.json()).members, undefined);
r = await call(post('rivka@example.com', { action: 'request', note: 'הופניתי על ידי שרה' }, 'רבקה כהן')); assert.equal(r.status, 200);
assert.equal((await authorize(get('rivka@example.com'), env, db)).status, 'pending');
a = await authorize(get('admin@example.com'), env, db); assert.equal(a.user.pendingRequests, 1);
// ממתינה לא יכולה לאשר את עצמה
r = await call(post('rivka@example.com', { action: 'approve', email: 'rivka@example.com' })); assert.equal(r.status, 403);
// מנהלת רואה את הבקשה ומאשרת
r = await call(new Request('https://example.test/api/access', { headers: as('admin@example.com') })); let data = await r.json(); assert.equal(data.members[0].email, 'rivka@example.com'); assert.equal(data.members[0].note, 'הופניתי על ידי שרה'); assert.equal(data.members[0].name, 'רבקה כהן');
r = await call(post('admin@example.com', { action: 'approve', email: 'rivka@example.com' })); assert.equal(r.status, 200);
a = await authorize(get('rivka@example.com'), env, db); assert.equal(a.status, 'ok'); assert.equal(a.user.role, 'member');
// חברה רגילה לא יכולה לנהל
r = await call(post('rivka@example.com', { action: 'approve', email: 'x@example.com' })); assert.equal(r.status, 403);
// קידום למנהלת, ואז היא מאשרת אחרת; הסרה; דחייה
r = await call(post('admin@example.com', { action: 'promote', email: 'rivka@example.com' })); assert.equal((await authorize(get('rivka@example.com'), env, db)).user.role, 'admin');
await call(post('sara@example.com', { action: 'request' }));
r = await call(post('rivka@example.com', { action: 'reject', email: 'sara@example.com' })); assert.equal(r.status, 200); assert.equal((await authorize(get('sara@example.com'), env, db)).status, 'rejected');
r = await call(post('rivka@example.com', { action: 'remove', email: 'rivka@example.com' })); assert.equal(r.status, 400);
r = await call(post('rivka@example.com', { action: 'remove', email: 'admin@example.com' })); assert.equal(r.status, 400);
r = await call(post('admin@example.com', { action: 'remove', email: 'rivka@example.com' })); assert.equal((await authorize(get('rivka@example.com'), env, db)).status, 'new');
// ללא מנהלת קבועה וללא מנהלת מאושרת: המרחב לא מוגדר
assert.equal((await authorize(get('someone@example.com'), {}, db)).status, 'unconfigured');
// בקשה חוזרת אחרי דחייה
r = await call(post('sara@example.com', { action: 'request', note: 'שוב' })); assert.equal((await authorize(get('sara@example.com'), env, db)).status, 'pending');
console.log('PASS: join request flow, admin approval/rejection/removal, promotion, built-in admin protection');
