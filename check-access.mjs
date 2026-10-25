// בדיקת ההתחברות והחברות: הזמנה → בחירת סיסמה → כניסה בעוגייה; כניסה שגויה ונעילה; ניהול חברות; שינוי סיסמה.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { authorize, handleAuth, issueInvite, joinPage, loginPage, contactEmail, needsSetup, parseEmailList } from './server/auth.mjs';
import { handleAccess } from './server/access.mjs';
const sql = new DatabaseSync(':memory:');
for (const name of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync('drizzle/' + name, 'utf8'));
class Statement { constructor(query, values = []) { this.query = query; this.values = values; } bind(...values) { return new Statement(this.query, values); } async first() { return sql.prepare(this.query).get(...this.values) || null; } async run() { return this.execute(); } async all() { return this.execute(); } execute() { const stmt = sql.prepare(this.query); let results = []; if (stmt.columns().length) results = stmt.all(...this.values); else stmt.run(...this.values); return { results, meta: { changes: Number(sql.prepare('SELECT changes() AS n').get().n) } }; } }
const db = { prepare: query => new Statement(query) };
const env = {};
const B = 'https://example.test';
const jsonHeaders = { 'Content-Type': 'application/json', 'X-Kesher-Client': '1' };
const cookie = r => (r.headers.get('set-cookie') || '').split(';')[0];
let r, a;
const post = (path, body, extra = {}) => handleAuth(new Request(B + path, { method: 'POST', headers: { ...jsonHeaders, ...extra }, body: JSON.stringify(body) }), env, db, path);
const asUser = (c, path = '/', init = {}) => new Request(B + path, { ...init, headers: { cookie: c, ...(init.headers || {}) } });
const access = async (c, body) => handleAccess(asUser(c, '/api/access', body ? { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) } : {}), db, await authorize(asUser(c), env, db), 'admin@example.com');

// לפני הזמנה: אנונימית, ודף כניסה עם מייל ליצירת קשר
assert.equal((await authorize(new Request(B + '/'), env, db)).status, 'anonymous');
assert.equal(await contactEmail({ KESHER_CONTACT_EMAIL: 'Admin@Example.com' }, db), 'admin@example.com');
assert.match(await loginPage(new Request(B + '/login?return_to=%2F%23all'), 'admin@example.com').text(), /mailto:admin%40example.com/);

// הקמה ראשונית מהדפדפן: עובדת רק כל עוד אין אף חברה
assert.equal(await needsSetup(db), true);
assert.equal((await post('/api/auth/setup', { name: 'הקמה', email: 'bad', password: 'password-123' })).status, 400);
r = await post('/api/auth/setup', { name: 'מקימה', email: 'founder@example.com', password: 'password-123' }); assert.equal(r.status, 200);
a = await authorize(asUser(cookie(r)), env, db); assert.equal(a.user.role, 'admin'); assert.equal(a.user.name, 'מקימה');
assert.equal(await needsSetup(db), false);
assert.equal((await post('/api/auth/setup', { name: 'שוב', email: 'x@example.com', password: 'password-123' })).status, 409);
sql.exec("DELETE FROM members; DELETE FROM sessions");

// המנהלת הראשונה מוזמנת (כמו בסקריפט scripts/invite.mjs) ובוחרת סיסמה
const adminToken = await issueInvite(db, { email: 'admin@example.com', name: 'רבקה כהן', role: 'admin', by: 'setup' });
assert.match(await (await joinPage(new Request(B + '/join?token=' + adminToken), db)).text(), /רבקה כהן/);
assert.equal((await post('/api/auth/accept', { token: adminToken, password: 'short' })).status, 400);
r = await post('/api/auth/accept', { token: adminToken, password: 'password-123' }); assert.equal(r.status, 200);
const adminCookie = cookie(r); assert.match(adminCookie, /^kt_session=.{20,}/);
a = await authorize(asUser(adminCookie), env, db); assert.equal(a.status, 'ok'); assert.equal(a.user.role, 'admin'); assert.equal(a.user.name, 'רבקה כהן');
// הקישור חד-פעמי
assert.equal((await post('/api/auth/accept', { token: adminToken, password: 'password-123' })).status, 400);
assert.equal((await joinPage(new Request(B + '/join?token=' + adminToken), db)).status, 400);

// כניסה עם סיסמה, סיסמה שגויה, ונעילה אחרי 8 ניסיונות
r = await post('/api/auth/login', { email: 'ADMIN@example.com', password: 'password-123' }); assert.equal(r.status, 200); assert.equal((await authorize(asUser(cookie(r)), env, db)).status, 'ok');
assert.equal((await post('/api/auth/login', { email: 'admin@example.com', password: 'wrong' })).status, 401);
assert.equal((await post('/api/auth/login', { email: 'nobody@example.com', password: 'x' })).status, 401);
for (let i = 0; i < 7; i++) await post('/api/auth/login', { email: 'admin@example.com', password: 'wrong' });
assert.equal((await post('/api/auth/login', { email: 'admin@example.com', password: 'password-123' })).status, 429);
sql.exec("UPDATE members SET locked_until=NULL, failed_attempts=0");
// CSRF: בלי הכותרת של הלקוח
assert.equal((await handleAuth(new Request(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), env, db, '/api/auth/login')).status, 403);

// המנהלת מזמינה חברה; החברה נכנסת; חברה לא יכולה לנהל
r = await access(adminCookie, { action: 'invite', name: 'שרה לוי', email: 'Sara@example.com', role: 'member' }); let d = await r.json(); assert.equal(r.status, 200); assert.match(d.inviteUrl, /^https:\/\/example\.test\/join\?token=/);
assert.equal(d.members.find(m => m.email === 'sara@example.com').status, 'invited');
const saraToken = new URL(d.inviteUrl).searchParams.get('token');
assert.equal((await post('/api/auth/login', { email: 'sara@example.com', password: 'anything-1' })).status, 401);
r = await post('/api/auth/accept', { token: saraToken, password: 'sara-pass-1' }); const saraCookie = cookie(r);
a = await authorize(asUser(saraCookie), env, db); assert.equal(a.user.role, 'member'); assert.equal(a.user.name, 'שרה לוי');
assert.equal((await access(saraCookie)).status, 403);
assert.equal((await access('kt_session=bogus')).status, 401);
// הזמנה כפולה לחברה פעילה נדחית; "קישור חדש" מאפס סיסמה ושומר תפקיד
assert.equal((await access(adminCookie, { action: 'invite', name: 'שרה', email: 'sara@example.com' })).status, 409);
r = await access(adminCookie, { action: 'promote', email: 'sara@example.com' }); assert.equal((await r.json()).members.find(m => m.email === 'sara@example.com').role, 'admin');
r = await access(adminCookie, { action: 'reinvite', email: 'sara@example.com' }); d = await r.json(); const reset = new URL(d.inviteUrl).searchParams.get('token');
assert.equal((await post('/api/auth/login', { email: 'sara@example.com', password: 'sara-pass-1' })).status, 200, 'old password still works until the link is used');
r = await post('/api/auth/accept', { token: reset, password: 'sara-pass-2' }); assert.equal(r.status, 200);
assert.equal((await post('/api/auth/login', { email: 'sara@example.com', password: 'sara-pass-1' })).status, 401);
assert.equal((await authorize(asUser(saraCookie), env, db)).status, 'anonymous', 'old sessions end after a password reset');
assert.equal((await authorize(asUser(cookie(r)), env, db)).user.role, 'admin');
// שינוי סיסמה על ידי החברה עצמה
const sara2 = cookie(r);
assert.equal((await handleAuth(asUser(sara2, '/api/auth/password', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ current: 'wrong', next: 'sara-pass-3' }) }), env, db, '/api/auth/password')).status, 401);
assert.equal((await handleAuth(asUser(sara2, '/api/auth/password', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ current: 'sara-pass-2', next: 'sara-pass-3' }) }), env, db, '/api/auth/password')).status, 200);
assert.equal((await post('/api/auth/login', { email: 'sara@example.com', password: 'sara-pass-3' })).status, 200);
// השבתה מנתקת מיד, הפעלה מחזירה; הסרה; הגנה עצמית; התנתקות
await access(adminCookie, { action: 'disable', email: 'sara@example.com' }); assert.equal((await authorize(asUser(sara2), env, db)).status, 'anonymous'); assert.equal((await post('/api/auth/login', { email: 'sara@example.com', password: 'sara-pass-3' })).status, 401);
r = await access(adminCookie, { action: 'enable', email: 'sara@example.com' }); assert.equal((await r.json()).members.find(m => m.email === 'sara@example.com').status, 'active');
assert.equal((await access(adminCookie, { action: 'remove', email: 'admin@example.com' })).status, 400);
r = await access(adminCookie, { action: 'remove', email: 'sara@example.com' }); assert.equal((await r.json()).members.length, 1);
r = await handleAuth(asUser(adminCookie, '/logout'), env, db, '/logout'); assert.equal(r.status, 302); assert.equal((await authorize(asUser(adminCookie), env, db)).status, 'anonymous');
// רשימה מאושרת מראש + קוד הצטרפות: ייבוא, הרשמה עצמית, קוד שגוי, מייל שלא ברשימה
assert.deepEqual(parseEmailList('rivka@Example.com\nשרה לוי <sara@example.com>\nlea@example.com, לאה גולד\nלא מייל\nrivka@example.com'), [{ email: 'rivka@example.com', name: '' }, { email: 'sara@example.com', name: 'שרה לוי' }, { email: 'lea@example.com', name: 'לאה גולד' }]);
const adminToken2 = await issueInvite(db, { email: 'admin@example.com', name: 'רבקה', role: 'admin', by: 'setup' }, true);
r = await post('/api/auth/accept', { token: adminToken2, password: 'password-123' }); const adminCookie2 = cookie(r);
r = await access(adminCookie2, { action: 'import', text: 'miri@example.com\nדינה כץ <dina@example.com>' }); d = await r.json(); assert.equal(r.status, 200); assert.equal(d.added, 2);
assert.equal(d.members.find(m => m.email === 'dina@example.com').name, 'דינה כץ'); assert.equal(d.members.find(m => m.email === 'dina@example.com').status, 'invited');
r = await access(adminCookie2, { action: 'import', text: 'miri@example.com' }); d = await r.json(); assert.equal(d.added, 0); assert.equal(d.skipped, 1);
assert.equal((await access(adminCookie2, { action: 'import', text: 'שום דבר' })).status, 400);
// בלי קוד שנקבע: המייל מהרשימה מספיק; מי שלא ברשימה נדחית
assert.equal((await post('/api/auth/register', { email: 'stranger@example.com', password: 'x-pass-123' })).status, 401);
r = await post('/api/auth/register', { email: 'Miri@example.com', password: 'miri-pass-1' }); assert.equal(r.status, 200);
a = await authorize(asUser(cookie(r)), env, db); assert.equal(a.status, 'ok'); assert.equal(a.user.email, 'miri@example.com');
assert.equal((await post('/api/auth/register', { email: 'miri@example.com', password: 'again-pass-1' })).status, 409, 'cannot re-register a member who has a password');
assert.equal((await post('/api/auth/login', { email: 'miri@example.com', password: 'miri-pass-1' })).status, 200);
await access(adminCookie2, { action: 'import', text: 'tova@example.com' });
// עם קוד: חובה להזין אותו
assert.equal((await access(adminCookie2, { action: 'joinCode', code: '123' })).status, 400);
r = await access(adminCookie2, { action: 'joinCode', code: 'shidduch-2026' }); assert.equal(r.status, 200);
r = await access(adminCookie2); assert.equal((await r.json()).joinCode, 'shidduch-2026');
assert.equal((await post('/api/auth/register', { email: 'tova@example.com', code: 'wrong', password: 'tova-pass-1' })).status, 401);
assert.equal((await post('/api/auth/register', { email: 'tova@example.com', password: 'tova-pass-1' })).status, 401, 'code required once set');
assert.equal((await post('/api/auth/register', { email: 'stranger@example.com', code: 'shidduch-2026', password: 'x-pass-123' })).status, 401);
assert.equal((await post('/api/auth/register', { email: 'tova@example.com', code: 'shidduch-2026', password: 'short' })).status, 400);
r = await post('/api/auth/register', { email: 'tova@example.com', code: 'shidduch-2026', password: 'tova-pass-1' }); assert.equal(r.status, 200);
// נעילה אחרי ניסיונות קוד שגויים
for (let i = 0; i < 8; i++) await post('/api/auth/register', { email: 'dina@example.com', code: 'wrong', password: 'dina-pass-1' });
assert.equal((await post('/api/auth/register', { email: 'dina@example.com', code: 'shidduch-2026', password: 'dina-pass-1' })).status, 429);
// ביטול הקוד: שוב המייל מספיק
await access(adminCookie2, { action: 'joinCode', code: '' }); sql.exec("UPDATE members SET locked_until=NULL, failed_attempts=0");
assert.equal((await post('/api/auth/register', { email: 'dina@example.com', password: 'dina-pass-1' })).status, 200);
console.log('PASS: pre-approved email list import, join code, self-registration, lockout');
console.log('PASS: invite link → password → cookie session, login lockout, CSRF, member management, password reset and change, logout');
