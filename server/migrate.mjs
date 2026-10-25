// הרצת המיגרציות של מסד הנתונים מתוך האתר עצמו, בבקשה הראשונה אחרי פרסום.
// כך הפרסום לא תלוי בפקודות נוספות: `wrangler deploy` רגיל מספיק, והטבלאות נוצרות לבד.
import m0000 from '../drizzle/0000_sad_maddog.sql?raw';
import m0001 from '../drizzle/0001_quiet_santa_claus.sql?raw';
import m0002 from '../drizzle/0002_mysterious_whistler.sql?raw';
import m0003 from '../drizzle/0003_robust_polaris.sql?raw';
import m0004 from '../drizzle/0004_spicy_iron_fist.sql?raw';
import m0005 from '../drizzle/0005_faithful_may_parker.sql?raw';

// סדר ההרצה חשוב. קובץ חדש בתיקיית drizzle צריך להתווסף גם כאן.
export const migrations = [
  ['0000_sad_maddog', m0000],
  ['0001_quiet_santa_claus', m0001],
  ['0002_mysterious_whistler', m0002],
  ['0003_robust_polaris', m0003],
  ['0004_spicy_iron_fist', m0004],
  ['0005_faithful_may_parker', m0005],
];

const ALREADY = /already exists|duplicate column/i;

export async function migrate(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS kt_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)').run();
  const done = new Set((await db.prepare('SELECT name FROM kt_migrations').all()).results.map(r => r.name));
  // מיגרציות שהורצו עם wrangler d1 migrations apply (פיתוח מקומי) נחשבות גם הן.
  try { for (const r of (await db.prepare('SELECT name FROM d1_migrations').all()).results) done.add(String(r.name).replace(/\.sql$/, '')); } catch { /* הטבלה לא קיימת */ }
  for (const [name, sql] of migrations) {
    if (done.has(name)) continue;
    for (const statement of sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) {
      try { await db.prepare(statement).run(); }
      catch (error) { if (!ALREADY.test(error?.message || '')) throw error; }
    }
    await db.prepare('INSERT OR IGNORE INTO kt_migrations (name,applied_at) VALUES (?,?)').bind(name, Date.now()).run();
  }
}

// פעם אחת לכל מופע של ה-Worker; כישלון מאפשר ניסיון חוזר בבקשה הבאה.
let pending = null;
export function ensureMigrated(db) {
  if (!db) return Promise.resolve();
  if (!pending) pending = migrate(db).catch(error => { pending = null; throw error; });
  return pending;
}
