// ניהול חברות המרחב על ידי מנהלות (API בנתיב /api/access): הזמנה, קישור חדש, השבתה, הסרה, תפקיד.
import { issueInvite, inviteUrl, normalizeEmail, validEmail } from './auth.mjs';

const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
const ACTIONS = new Set(['invite', 'reinvite', 'remove', 'disable', 'enable', 'promote', 'demote']);

async function listMembers(db) {
  return (await db.prepare("SELECT email,name,status,role,requested_at AS invitedAt,decided_by AS invitedBy,invite_expires AS inviteExpires,last_login AS lastLogin FROM members ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END, name, email").all()).results;
}

// auth הוא תוצאת authorize(); כל הפעולות כאן שמורות למנהלות.
export async function handleAccess(request, db, auth, contact = '') {
  try {
    if (!db) return response({ error: 'המאגר המשותף אינו זמין כרגע' }, 503);
    if (auth.status !== 'ok') return response({ error: 'יש להתחבר תחילה' }, 401);
    if (auth.user.role !== 'admin') return response({ error: 'פעולה זו שמורה למנהלות' }, 403);
    if (request.method === 'GET') return response({ me: auth.user, contact, members: await listMembers(db) });
    if (request.method !== 'POST') return response({ error: 'שיטה לא נתמכת' }, 405);
    if (!request.headers.get('content-type')?.includes('application/json') || request.headers.get('x-kesher-client') !== '1' || request.headers.get('sec-fetch-site') === 'cross-site') return response({ error: 'בקשה לא מורשית' }, 403);
    const origin = request.headers.get('origin'); if (origin && origin !== new URL(request.url).origin) return response({ error: 'מקור בקשה לא תקין' }, 403);
    const body = JSON.parse(await request.text());
    if (!ACTIONS.has(body.action)) return response({ error: 'פעולה לא מוכרת' }, 400);
    const email = normalizeEmail(body.email);
    if (!validEmail(email)) return response({ error: 'כתובת מייל לא תקינה' }, 400);
    if (email === auth.user.email && body.action !== 'reinvite') return response({ error: 'אי אפשר לשנות את ההרשאה של עצמך' }, 400);
    const by = auth.user.name || auth.user.email, now = Date.now();
    const existing = await db.prepare('SELECT status FROM members WHERE email=?').bind(email).first();

    if (body.action === 'invite' || body.action === 'reinvite') {
      const name = String(body.name || '').trim().slice(0, 120), role = body.role === 'admin' ? 'admin' : 'member';
      if (body.action === 'invite' && existing?.status === 'active') return response({ error: 'הכתובת הזו כבר חברה פעילה. כדי לאפס סיסמה השתמשי ב„קישור חדש”.' }, 409);
      if (body.action === 'reinvite' && !existing) return response({ error: 'הכתובת אינה ברשימת החברות' }, 404);
      const token = await issueInvite(db, { email, name, role, by }, body.action === 'reinvite');
      return response({ ok: true, inviteUrl: inviteUrl(new URL(request.url).origin, token), members: await listMembers(db) });
    }
    if (!existing) return response({ error: 'הכתובת אינה ברשימת החברות' }, 404);
    if (body.action === 'remove') { await db.prepare('DELETE FROM members WHERE email=?').bind(email).run(); await db.prepare('DELETE FROM sessions WHERE email=?').bind(email).run(); }
    else if (body.action === 'disable') { await db.prepare("UPDATE members SET status='disabled',decided_at=?,decided_by=? WHERE email=?").bind(now, by, email).run(); await db.prepare('DELETE FROM sessions WHERE email=?').bind(email).run(); }
    else if (body.action === 'enable') await db.prepare("UPDATE members SET status=CASE WHEN password_hash IS NULL THEN 'invited' ELSE 'active' END,decided_at=?,decided_by=? WHERE email=? AND status='disabled'").bind(now, by, email).run();
    else await db.prepare('UPDATE members SET role=? WHERE email=?').bind(body.action === 'promote' ? 'admin' : 'member', email).run();
    return response({ ok: true, members: await listMembers(db) });
  } catch (error) {
    console.error('Access request failed:', error instanceof Error ? error.message : 'unknown');
    return response({ error: 'לא ניתן להשלים את הפעולה כרגע. נסי שוב.' }, 500);
  }
}
