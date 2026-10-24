// זיהוי המשתמשת המחוברת ובדיקת הרשאה מול רשימת הגישה.
// ההתחברות עצמה מתבצעת על ידי פלטפורמת האחסון (ChatGPT sign-in), שמוסיפה לכל בקשה
// כותרות oai-authenticated-user-*. כאן רק בודקים שהכתובת נמצאת ברשימה המאושרת.
import allowedFile from './allowed-emails.json';

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

export function allowedEmails(env) {
  const fromEnv = String(env?.KESHER_ALLOWED_EMAILS || '').split(/[,\s;]+/);
  const fromFile = Array.isArray(allowedFile) ? allowedFile : [];
  return [...new Set([...fromEnv, ...fromFile].map(s => String(s).trim().toLowerCase()).filter(s => s.includes('@')))];
}

// מחזיר {status:'ok'|'anonymous'|'unconfigured'|'forbidden', user}
export function authorize(request, env) {
  const user = getUser(request, env);
  if (!user) return { status: 'anonymous', user: null };
  const list = allowedEmails(env);
  if (!list.length) return { status: 'unconfigured', user };
  return { status: list.includes(user.email) ? 'ok' : 'forbidden', user };
}

export function signInRedirect(request) {
  const url = new URL(request.url);
  const returnTo = url.pathname + url.search;
  return new Response(null, { status: 302, headers: { Location: `${SIGN_IN_PATH}?return_to=${encodeURIComponent(returnTo.startsWith('/') ? returnTo : '/')}`, 'Cache-Control': 'private, no-store' } });
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function deniedPage(result) {
  const unconfigured = result.status === 'unconfigured';
  const title = unconfigured ? 'רשימת הגישה עדיין לא הוגדרה' : 'אין לך הרשאה למרחב הזה';
  const body = unconfigured
    ? `<p>האתר מוגן, אבל עדיין לא הוגדר מי רשאית להיכנס. כדי לפתוח את הגישה יש להוסיף את כתובות המייל המאושרות למשתנה הסביבה <code>KESHER_ALLOWED_EMAILS</code> (מופרדות בפסיק) או לקובץ <code>server/allowed-emails.json</code>, ולפרסם מחדש.</p>
       <p>הכתובת שאיתה את מחוברת כעת: <b>${esc(result.user.email)}</b></p>`
    : `<p>את מחוברת בתור <b>${esc(result.user.email)}</b>, אבל הכתובת הזו אינה ברשימת המשתמשות המאושרות. פני למי שמנהלת את המרחב כדי להוסיף אותך.</p>`;
  return new Response(`<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — קשר טוב</title><meta name="robots" content="noindex,nofollow"><link rel="icon" href="/brand-mark.svg"><link rel="stylesheet" href="/style.css"></head><body><main style="max-width:560px;margin:10vh auto;padding:0 20px"><img src="/brand-mark.svg" width="64" height="64" alt=""><h1 style="margin:16px 0 12px;font-size:26px;color:#6e0f42">${title}</h1><div style="color:#5c5062;line-height:1.8">${body}</div><p style="margin-top:24px"><a class="outline" href="${SIGN_OUT_PATH}?return_to=%2F">התנתקות והתחברות עם חשבון אחר</a></p></main></body></html>`,
    { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}
