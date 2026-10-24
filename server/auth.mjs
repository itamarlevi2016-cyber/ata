// זיהוי המשתמשת המחוברת ובדיקת הרשאה.
// ההתחברות עצמה מתבצעת על ידי פלטפורמת האחסון (ChatGPT sign-in), שמוסיפה לכל בקשה
// כותרות oai-authenticated-user-*. כאן בודקים מי היא, ואם היא מנהלת (רשימת הניהול
// הקבועה) או חברה מאושרת (טבלת members, שמנהלות מאשרות מתוך האתר).
import adminsFile from './allowed-emails.mjs';

const HEADERS = {
  id: 'oai-authenticated-user-id',
  email: 'oai-authenticated-user-email',
  name: 'oai-authenticated-user-full-name',
  encoding: 'oai-authenticated-user-full-name-encoding',
};
export const SIGN_IN_PATH = '/signin-with-chatgpt';
export const SIGN_OUT_PATH = '/signout-with-chatgpt';
export const AUTH_PATHS = new Set([SIGN_IN_PATH, SIGN_OUT_PATH, '/callback']);

export function getUser(request, env) {
  const id = request.headers.get(HEADERS.id), email = request.headers.get(HEADERS.email);
  if (id && email) {
    let name = null;
    const raw = request.headers.get(HEADERS.name);
    if (raw && request.headers.get(HEADERS.encoding) === 'percent-encoded-utf-8') { try { name = decodeURIComponent(raw); } catch { name = null; } }
    return { id, email: email.trim().toLowerCase(), name };
  }
  // לפיתוח מקומי בלבד (.dev.vars): מדמה משתמשת מחוברת.
  if (env?.KESHER_LOCAL_USER && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(new URL(request.url).host)) {
    return { id: 'local', email: String(env.KESHER_LOCAL_USER).trim().toLowerCase(), name: 'משתמשת מקומית' };
  }
  return null;
}

// המנהלות הקבועות: ממשתנה הסביבה ומהקובץ. הן תמיד נכנסות, ואי אפשר להסיר אותן מהאתר.
export function adminEmails(env) {
  const fromEnv = String(env?.KESHER_ALLOWED_EMAILS || '').split(/[,\s;]+/);
  const fromFile = Array.isArray(adminsFile) ? adminsFile : [];
  return [...new Set([...fromEnv, ...fromFile].map(s => String(s).trim().toLowerCase()).filter(s => s.includes('@')))];
}

// מחזיר {status, user}. status: 'ok' | 'anonymous' | 'unconfigured' | 'new' | 'pending' | 'rejected'
// ב-ok, user.role הוא 'admin' או 'member', ולמנהלות גם pendingRequests.
export async function authorize(request, env, db) {
  const user = getUser(request, env);
  if (!user) return { status: 'anonymous', user: null };
  const admins = adminEmails(env);
  const row = db ? await db.prepare('SELECT email,name,status,role FROM members WHERE email=?').bind(user.email).first() : null;
  const isAdmin = admins.includes(user.email) || (row?.status === 'approved' && row.role === 'admin');
  if (isAdmin) {
    const pending = db ? await db.prepare("SELECT COUNT(*) AS n FROM members WHERE status='pending'").first() : null;
    return { status: 'ok', user: { ...user, role: 'admin', builtIn: admins.includes(user.email), pendingRequests: Number(pending?.n || 0) } };
  }
  if (row?.status === 'approved') return { status: 'ok', user: { ...user, role: 'member' } };
  if (!admins.length) {
    const anyone = db ? await db.prepare("SELECT 1 AS ok FROM members WHERE status='approved' AND role='admin' LIMIT 1").first() : null;
    if (!anyone) return { status: 'unconfigured', user };
  }
  return { status: row?.status === 'pending' ? 'pending' : row?.status === 'rejected' ? 'rejected' : 'new', user: { ...user, note: row?.note || '' } };
}

export function signInRedirect(request) {
  const url = new URL(request.url);
  const returnTo = url.pathname + url.search;
  return new Response(null, { status: 302, headers: { Location: `${SIGN_IN_PATH}?return_to=${encodeURIComponent(returnTo.startsWith('/') ? returnTo : '/')}`, 'Cache-Control': 'private, no-store' } });
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// דף הכניסה למי שמחוברת אבל עדיין לא חברה: בקשת הצטרפות, המתנה, או דחייה.
export function accessPage(result) {
  const { status, user } = result;
  const name = user.name || user.email;
  let title, body, form = false;
  if (status === 'unconfigured') {
    title = 'המרחב עדיין לא הוגדר';
    body = `<p>האתר מוגן, אבל עדיין לא הוגדרה אף מנהלת. יש להוסיף את כתובת המייל של המנהלת למשתנה הסביבה <code>KESHER_ALLOWED_EMAILS</code> או לקובץ <code>server/allowed-emails.mjs</code> ולפרסם מחדש.</p><p>הכתובת שאיתה את מחוברת כעת: <b>${esc(user.email)}</b></p>`;
  } else if (status === 'pending') {
    title = 'הבקשה שלך ממתינה לאישור';
    body = `<p>שלום ${esc(name)}, הבקשה להצטרף למרחב נשלחה. ברגע שאחת המנהלות תאשר אותה, הכניסה תיפתח. אפשר לסגור את הדף ולחזור מאוחר יותר.</p><p><a class="primary" href="/">בדיקה מחדש</a></p>`;
  } else if (status === 'rejected') {
    title = 'הבקשה לא אושרה';
    body = `<p>שלום ${esc(name)}, הבקשה להצטרף מהכתובת <b>${esc(user.email)}</b> לא אושרה. אם זו טעות, פני לאחת המנהלות של המרחב, או שלחי בקשה חדשה.</p>`;
    form = true;
  } else {
    title = 'מרחב סגור לחברות מאושרות';
    body = `<p>שלום ${esc(name)}, הכתובת <b>${esc(user.email)}</b> עדיין לא ברשימת החברות. כמו בקבוצה במייל: שלחי בקשת הצטרפות, ואחת המנהלות תאשר אותה.</p>`;
    form = true;
  }
  const formHtml = form ? `<form id="joinForm"><label>כמה מילים על עצמך (לא חובה)<textarea name="note" rows="3" maxlength="500" placeholder="למשל: רבקה מירושלים, הופניתי על ידי…">${esc(user.note || '')}</textarea></label><button class="primary" type="submit">שליחת בקשת הצטרפות</button><p id="joinMessage" role="status"></p></form>
<script>document.getElementById('joinForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;const m=document.getElementById('joinMessage');m.textContent='שולחת…';try{const r=await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json','X-Kesher-Client':'1'},body:JSON.stringify({action:'request',note:e.target.note.value})});const d=await r.json();if(!r.ok)throw Error(d.error);location.reload()}catch(err){m.textContent=err.message||'השליחה נכשלה, נסי שוב';b.disabled=false}};</script>` : '';
  return new Response(`<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — קשר טוב</title><meta name="robots" content="noindex,nofollow"><link rel="icon" href="/brand-mark.svg"><link rel="stylesheet" href="/style.css"><style>.access{max-width:560px;margin:8vh auto;padding:0 20px;line-height:1.8;color:#5c5062}.access h1{margin:16px 0 12px;font-size:26px;color:#6e0f42}.access label{display:flex;flex-direction:column;gap:6px;margin:18px 0 12px;font-size:14px}.access textarea{border:1px solid #d4cad0;border-radius:8px;padding:10px 12px;font:inherit}.access .primary{margin-top:4px}.access .signout{display:block;margin-top:28px;font-size:14px}</style></head><body><main class="access"><img src="/brand-mark.svg" width="64" height="64" alt=""><h1>${title}</h1>${body}${formHtml}<a class="signout" href="${SIGN_OUT_PATH}?return_to=%2F">התנתקות והתחברות עם חשבון אחר</a></main></body></html>`,
    { status: status === 'pending' ? 200 : 403, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}
