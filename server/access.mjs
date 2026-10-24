// ניהול חברות המרחב: בקשות הצטרפות, אישור, דחייה והסרה (API בנתיב /api/access).
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
const ACTIONS = new Set(['approve', 'reject', 'remove', 'promote', 'demote']);

async function listMembers(db) {
  const rows = (await db.prepare('SELECT email,name,status,role,note,requested_at AS requestedAt,decided_at AS decidedAt,decided_by AS decidedBy FROM members ORDER BY CASE status WHEN \'pending\' THEN 0 ELSE 1 END, requested_at DESC').all()).results;
  return rows;
}

// auth הוא תוצאת authorize(): כל משתמשת מחוברת יכולה לבקש הצטרפות; שאר הפעולות למנהלות בלבד.
export async function handleAccess(request, db, auth, admins = []) {
  try {
    if (!db) return response({ error: 'המאגר המשותף אינו זמין כרגע' }, 503);
    if (!auth.user) return response({ error: 'יש להתחבר תחילה' }, 401);
    const isAdmin = auth.status === 'ok' && auth.user.role === 'admin';
    if (request.method === 'GET') {
      if (!isAdmin) return response({ me: { email: auth.user.email, status: auth.status } });
      return response({ me: { email: auth.user.email, status: 'ok', role: 'admin' }, admins, members: await listMembers(db) });
    }
    if (request.method !== 'POST') return response({ error: 'שיטה לא נתמכת' }, 405);
    if (!request.headers.get('content-type')?.includes('application/json') || request.headers.get('x-kesher-client') !== '1' || request.headers.get('sec-fetch-site') === 'cross-site') return response({ error: 'בקשה לא מורשית' }, 403);
    const origin = request.headers.get('origin'); if (origin && origin !== new URL(request.url).origin) return response({ error: 'מקור בקשה לא תקין' }, 403);
    const body = JSON.parse(await request.text());
    const now = Date.now();

    if (body.action === 'request') {
      if (auth.status === 'ok') return response({ ok: true, status: 'ok' });
      if (auth.status === 'unconfigured') return response({ error: 'המרחב עדיין לא הוגדר; אין למי לשלוח את הבקשה' }, 409);
      const note = String(body.note || '').trim().slice(0, 500);
      await db.prepare('INSERT INTO members (email,name,status,role,note,requested_at) VALUES (?,?,\'pending\',\'member\',?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,status=\'pending\',note=excluded.note,requested_at=excluded.requested_at,decided_at=NULL,decided_by=NULL')
        .bind(auth.user.email, auth.user.name || '', note, now).run();
      return response({ ok: true, status: 'pending' });
    }

    if (!isAdmin) return response({ error: 'פעולה זו שמורה למנהלות' }, 403);
    if (!ACTIONS.has(body.action)) return response({ error: 'פעולה לא מוכרת' }, 400);
    const email = String(body.email || '').trim().toLowerCase();
    if (!email.includes('@') || email.length > 200) return response({ error: 'כתובת מייל לא תקינה' }, 400);
    if (email === auth.user.email && body.action !== 'approve') return response({ error: 'אי אפשר לשנות את ההרשאה של עצמך' }, 400);
    if (admins.includes(email)) return response({ error: 'מנהלת קבועה מוגדרת בקובץ ההגדרות ולא ניתן לשנות אותה מכאן' }, 400);
    const by = auth.user.name || auth.user.email;
    if (body.action === 'remove') await db.prepare('DELETE FROM members WHERE email=?').bind(email).run();
    else if (body.action === 'approve') await db.prepare('INSERT INTO members (email,name,status,role,note,requested_at,decided_at,decided_by) VALUES (?,?,\'approved\',\'member\',\'\',?,?,?) ON CONFLICT(email) DO UPDATE SET status=\'approved\',decided_at=excluded.decided_at,decided_by=excluded.decided_by').bind(email, String(body.name || '').slice(0, 120), now, now, by).run();
    else if (body.action === 'reject') await db.prepare('UPDATE members SET status=\'rejected\',decided_at=?,decided_by=? WHERE email=?').bind(now, by, email).run();
    else await db.prepare('UPDATE members SET role=?,decided_at=?,decided_by=? WHERE email=? AND status=\'approved\'').bind(body.action === 'promote' ? 'admin' : 'member', now, by, email).run();
    return response({ ok: true, members: await listMembers(db) });
  } catch (error) {
    console.error('Access request failed:', error instanceof Error ? error.message : 'unknown');
    return response({ error: 'לא ניתן להשלים את הפעולה כרגע. נסי שוב.' }, 500);
  }
}
