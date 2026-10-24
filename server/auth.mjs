// התחברות עצמאית למרחב: מייל + סיסמה, בלי תלות בשירות חיצוני.
// מנהלת מזמינה חברה מתוך האתר ומקבלת קישור הזמנה חד-פעמי לשליחה במייל; בלחיצה עליו החברה
// בוחרת סיסמה. ההפעלה נשמרת בעוגייה (HttpOnly) שמצביעה על שורה בטבלת sessions.

const enc = new TextEncoder();
export const COOKIE = 'kt_session';
const SESSION_DAYS = 30, INVITE_DAYS = 7, MAX_FAILED = 8, LOCK_MINUTES = 15;
export const MIN_PASSWORD = 8;

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const randomToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
export async function sha256(text) { return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)))); }
export async function hashPassword(password, salt = randomToken()) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return { salt, hash: b64url(new Uint8Array(bits)) };
}
const sameString = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; };

export const normalizeEmail = s => String(s || '').trim().toLowerCase();
export const validEmail = s => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s) && s.length <= 200;
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', ...extra } });
const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', ...extra } });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- הפעלות ---------- */
function cookieValue(request) { return (request.headers.get('cookie') || '').split(';').map(c => c.trim()).find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || ''; }
const isSecure = request => new URL(request.url).protocol === 'https:';
function setCookie(request, token, maxAgeSeconds) { return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${isSecure(request) ? '; Secure' : ''}; Max-Age=${maxAgeSeconds}`; }
export async function createSession(request, db, email) {
  const token = randomToken(), now = Date.now();
  await db.prepare('INSERT INTO sessions (id,email,created_at,expires_at) VALUES (?,?,?,?)').bind(await sha256(token), email, now, now + SESSION_DAYS * 86400000).run();
  await db.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now).run();
  return setCookie(request, token, SESSION_DAYS * 86400);
}
async function endSession(request, db) {
  const token = cookieValue(request);
  if (token) await db.prepare('DELETE FROM sessions WHERE id=?').bind(await sha256(token)).run();
  return setCookie(request, '', 0);
}

// מחזיר את החברה המחוברת ({email,name,role}) או null.
export async function getUser(request, env, db) {
  const localHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(new URL(request.url).host);
  if (env?.KESHER_LOCAL_USER && localHost) return { email: normalizeEmail(env.KESHER_LOCAL_USER), name: 'משתמשת מקומית', role: 'admin', local: true };
  const token = cookieValue(request); if (!token || !db) return null;
  const row = await db.prepare("SELECT m.email,m.name,m.role FROM sessions s JOIN members m ON m.email=s.email WHERE s.id=? AND s.expires_at>? AND m.status='active'").bind(await sha256(token), Date.now()).first();
  return row ? { email: row.email, name: row.name, role: row.role } : null;
}
export async function authorize(request, env, db) {
  const user = await getUser(request, env, db);
  return user ? { status: 'ok', user } : { status: 'anonymous', user: null };
}

/* ---------- הזמנות ---------- */
// יוצרת (או מחדשת) הזמנה לחברה ומחזירה את הטוקן החד-פעמי. משמש גם לאיפוס סיסמה.
export async function issueInvite(db, { email, name, role = 'member', by = '' }, keepRole = false) {
  const token = randomToken(), now = Date.now();
  await db.prepare(`INSERT INTO members (email,name,status,role,note,requested_at,decided_at,decided_by,invite_hash,invite_expires,failed_attempts)
    VALUES (?,?,'invited',?,'',?,?,?,?,?,0)
    ON CONFLICT(email) DO UPDATE SET name=CASE WHEN excluded.name='' THEN members.name ELSE excluded.name END,
      ${keepRole ? '' : 'role=excluded.role,'} status=CASE WHEN members.status='active' THEN 'active' ELSE 'invited' END,
      invite_hash=excluded.invite_hash,invite_expires=excluded.invite_expires,decided_by=excluded.decided_by,decided_at=excluded.decided_at,failed_attempts=0,locked_until=NULL`)
    .bind(email, name || '', role, now, now, by, await sha256(token), now + INVITE_DAYS * 86400000).run();
  return token;
}
export const inviteUrl = (origin, token) => `${origin}/join?token=${token}`;

/* ---------- בקשות API ---------- */
function csrfOk(request) {
  if (!request.headers.get('content-type')?.includes('application/json') || request.headers.get('x-kesher-client') !== '1' || request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin'); return !origin || origin === new URL(request.url).origin;
}

export async function handleAuth(request, env, db, path) {
  try {
    if (!db) return json({ error: 'המאגר המשותף אינו זמין כרגע' }, 503);
    if (path === '/logout') return new Response(null, { status: 302, headers: { Location: '/login', 'Set-Cookie': await endSession(request, db), 'Cache-Control': 'no-store' } });
    if (request.method !== 'POST') return json({ error: 'שיטה לא נתמכת' }, 405);
    if (!csrfOk(request)) return json({ error: 'בקשה לא מורשית' }, 403);
    const body = JSON.parse(await request.text()), now = Date.now();

    if (path === '/api/auth/login') {
      const email = normalizeEmail(body.email), password = String(body.password || '');
      const wrong = () => json({ error: 'המייל או הסיסמה שגויים' }, 401);
      if (!validEmail(email) || !password) return wrong();
      const m = await db.prepare("SELECT email,password_hash,password_salt,failed_attempts,locked_until,status FROM members WHERE email=? AND status='active'").bind(email).first();
      if (!m || !m.password_hash) return wrong();
      if (m.locked_until && m.locked_until > now) return json({ error: `יותר מדי ניסיונות. נסי שוב בעוד ${Math.ceil((m.locked_until - now) / 60000)} דקות.` }, 429);
      const { hash } = await hashPassword(password, m.password_salt);
      if (!sameString(hash, m.password_hash)) {
        const attempts = (m.failed_attempts || 0) + 1;
        await db.prepare('UPDATE members SET failed_attempts=?,locked_until=? WHERE email=?').bind(attempts, attempts >= MAX_FAILED ? now + LOCK_MINUTES * 60000 : null, email).run();
        return wrong();
      }
      await db.prepare('UPDATE members SET failed_attempts=0,locked_until=NULL,last_login=? WHERE email=?').bind(now, email).run();
      return json({ ok: true }, 200, { 'Set-Cookie': await createSession(request, db, email) });
    }

    if (path === '/api/auth/accept') {
      const token = String(body.token || ''), password = String(body.password || '');
      if (!token) return json({ error: 'קישור ההזמנה חסר' }, 400);
      if (password.length < MIN_PASSWORD) return json({ error: `הסיסמה צריכה להכיל לפחות ${MIN_PASSWORD} תווים` }, 400);
      const m = await db.prepare('SELECT email,invite_expires FROM members WHERE invite_hash=?').bind(await sha256(token)).first();
      if (!m || !m.invite_expires || m.invite_expires < now) return json({ error: 'קישור ההזמנה אינו תקף או שפג תוקפו. בקשי מהמנהלת קישור חדש.' }, 400);
      const { salt, hash } = await hashPassword(password);
      await db.prepare("UPDATE members SET password_hash=?,password_salt=?,status='active',invite_hash=NULL,invite_expires=NULL,failed_attempts=0,locked_until=NULL,last_login=? WHERE email=?").bind(hash, salt, now, m.email).run();
      await db.prepare('DELETE FROM sessions WHERE email=?').bind(m.email).run();
      return json({ ok: true }, 200, { 'Set-Cookie': await createSession(request, db, m.email) });
    }

    if (path === '/api/auth/password') {
      const user = await getUser(request, env, db); if (!user || user.local) return json({ error: 'יש להתחבר תחילה' }, 401);
      const current = String(body.current || ''), next = String(body.next || '');
      if (next.length < MIN_PASSWORD) return json({ error: `הסיסמה החדשה צריכה להכיל לפחות ${MIN_PASSWORD} תווים` }, 400);
      const m = await db.prepare('SELECT password_hash,password_salt FROM members WHERE email=?').bind(user.email).first();
      if (!m || !sameString((await hashPassword(current, m.password_salt)).hash, m.password_hash)) return json({ error: 'הסיסמה הנוכחית שגויה' }, 401);
      const { salt, hash } = await hashPassword(next);
      await db.prepare('UPDATE members SET password_hash=?,password_salt=? WHERE email=?').bind(hash, salt, user.email).run();
      return json({ ok: true });
    }
    return json({ error: 'לא נמצא' }, 404);
  } catch (error) {
    console.error('Auth request failed:', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'לא ניתן להשלים את הפעולה כרגע. נסי שוב.' }, 500);
  }
}

/* ---------- דפים ---------- */
export function signInRedirect(request) {
  const url = new URL(request.url), returnTo = url.pathname + url.search;
  return new Response(null, { status: 302, headers: { Location: `/login?return_to=${encodeURIComponent(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/')}`, 'Cache-Control': 'private, no-store' } });
}
const safeReturn = v => (v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/login') ? v : '/');
const page = (title, body) => `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — קשר טוב</title><meta name="robots" content="noindex,nofollow"><link rel="icon" href="/brand-mark.svg"><link rel="stylesheet" href="/style.css"><style>.access{max-width:440px;margin:7vh auto;padding:0 20px;line-height:1.7;color:#5c5062}.access h1{margin:14px 0 6px;font-size:26px;color:#6e0f42}.access .lead{margin-bottom:18px}.access label{display:flex;flex-direction:column;gap:5px;margin:14px 0;font-size:14px}.access input{border:1px solid #d4cad0;border-radius:8px;padding:11px 12px;font:inherit;font-size:16px}.access input:focus{border-color:#8f1a57;outline:none;box-shadow:0 0 0 3px #fbeef4}.access .primary{width:100%;margin-top:6px}.access .msg{min-height:24px;color:#b3261e;font-size:14px;margin-top:10px}.access .aside{margin-top:28px;padding-top:18px;border-top:1px solid #e7e0e4;font-size:14px}.access .aside a{font-weight:500}</style></head><body><main class="access"><img src="/brand-mark.svg" width="60" height="60" alt="">${body}</main></body></html>`;

// דף הכניסה. מי שאין לה גישה מוזמנת לשלוח בקשת הצטרפות במייל למנהלת.
export function loginPage(request, contact) {
  const returnTo = safeReturn(new URL(request.url).searchParams.get('return_to'));
  const mailto = contact ? `mailto:${encodeURIComponent(contact)}?subject=${encodeURIComponent('בקשת הצטרפות למרחב קשר טוב')}&body=${encodeURIComponent('שלום,\nאשמח להצטרף למרחב השידוכים "קשר טוב".\nשמי: \nכתובת המייל שלי: \nמי הפנה אותי: \n')}` : '';
  return html(page('כניסה', `<h1>כניסה למרחב</h1><p class="lead">מרחב סגור לחברות הצוות. הכניסה עם המייל והסיסמה שבחרת בהזמנה.</p>
<form id="f"><label>מייל<input name="email" type="email" required autocomplete="username" autofocus></label><label>סיסמה<input name="password" type="password" required autocomplete="current-password"></label><button class="primary" type="submit">כניסה</button><p class="msg" id="msg" role="status"></p></form>
<div class="aside"><p><b>עדיין אין לך גישה?</b> ${contact ? `<a href="${mailto}">שלחי בקשת הצטרפות במייל</a> למנהלת המרחב (${esc(contact)}).` : 'פני למנהלת המרחב.'} אחרי האישור תקבלי במייל קישור אישי לבחירת סיסמה.</p><p>שכחת סיסמה? בקשי מהמנהלת קישור חדש.</p></div>
<script>document.getElementById('f').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button'),m=document.getElementById('msg');b.disabled=true;m.textContent='';try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Kesher-Client':'1'},body:JSON.stringify({email:e.target.email.value,password:e.target.password.value})});const d=await r.json();if(!r.ok)throw Error(d.error);location.href=${JSON.stringify(returnTo)}}catch(err){m.textContent=err.message||'הכניסה נכשלה';b.disabled=false}};</script>`));
}

// דף ההזמנה: בחירת סיסמה דרך קישור חד-פעמי.
export async function joinPage(request, db) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const m = token && db ? await db.prepare('SELECT name,email,invite_expires FROM members WHERE invite_hash=?').bind(await sha256(token)).first() : null;
  if (!m || !m.invite_expires || m.invite_expires < Date.now()) return html(page('קישור לא תקף', `<h1>הקישור אינו תקף</h1><p class="lead">קישור ההזמנה כבר נוצל או שפג תוקפו (קישור תקף ל־${INVITE_DAYS} ימים). בקשי מהמנהלת קישור חדש.</p><div class="aside"><a href="/login">לדף הכניסה</a></div>`), 400);
  return html(page('הצטרפות', `<h1>ברוכה הבאה${m.name ? ', ' + esc(m.name) : ''}!</h1><p class="lead">הוזמנת למרחב "קשר טוב". בחרי סיסמה לכניסה עם המייל <b>${esc(m.email)}</b>.</p>
<form id="f"><input type="hidden" name="email" value="${esc(m.email)}" autocomplete="username"><label>סיסמה (לפחות ${MIN_PASSWORD} תווים)<input name="password" type="password" required minlength="${MIN_PASSWORD}" autocomplete="new-password" autofocus></label><label>הסיסמה שוב<input name="again" type="password" required autocomplete="new-password"></label><button class="primary" type="submit">שמירה וכניסה</button><p class="msg" id="msg" role="status"></p></form>
<script>document.getElementById('f').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button'),m=document.getElementById('msg');if(e.target.password.value!==e.target.again.value){m.textContent='שתי הסיסמאות אינן זהות';return}b.disabled=true;m.textContent='';try{const r=await fetch('/api/auth/accept',{method:'POST',headers:{'Content-Type':'application/json','X-Kesher-Client':'1'},body:JSON.stringify({token:${JSON.stringify(token)},password:e.target.password.value})});const d=await r.json();if(!r.ok)throw Error(d.error);location.href='/'}catch(err){m.textContent=err.message||'השמירה נכשלה';b.disabled=false}};</script>`));
}

// כתובת ליצירת קשר לבקשות הצטרפות: ממשתנה סביבה, ואם אין — המנהלת הפעילה הראשונה.
export async function contactEmail(env, db) {
  if (env?.KESHER_CONTACT_EMAIL) return normalizeEmail(env.KESHER_CONTACT_EMAIL);
  const row = db ? await db.prepare("SELECT email FROM members WHERE role='admin' AND status='active' ORDER BY requested_at LIMIT 1").first() : null;
  return row?.email || '';
}
