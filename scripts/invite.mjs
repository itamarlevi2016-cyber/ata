// יצירת הזמנה למנהלת הראשונה (או קישור חדש לכל חברה) ישירות במסד הנתונים.
// שימוש: node scripts/invite.mjs <email> "<שם>" [--local] [--url https://your-site.workers.dev]
// --local פועל על מסד הנתונים המקומי של wrangler dev; בלעדיו על המסד בענן (--remote).
// יש להריץ pnpm build לפני כן, כי ההגדרות נקראות מ-dist/server/wrangler.json.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { issueInvite, inviteUrl, normalizeEmail, validEmail } from '../server/auth.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--') && !a.startsWith('--url')));
const urlArg = args.find(a => a.startsWith('--url='))?.slice(6) || (args.includes('--url') ? args[args.indexOf('--url') + 1] : '');
const [email, name = ''] = args.filter(a => !a.startsWith('--') && a !== urlArg);
if (!validEmail(normalizeEmail(email))) { console.error('שימוש: node scripts/invite.mjs <email> "<שם>" [--local] [--url https://...]'); process.exit(1); }
if (!existsSync('dist/server/wrangler.json')) { console.error('קודם יש להריץ: pnpm build'); process.exit(1); }

const statements = [];
const db = { prepare: query => ({ bind: (...values) => ({ run: async () => { statements.push({ query, values }); } }) }) };
const token = await issueInvite(db, { email: normalizeEmail(email), name, role: 'admin', by: 'invite script' }, flags.has('--keep-role'));
const sqlLiteral = v => v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const command = statements.map(({ query, values }) => { let i = 0; return query.replace(/\?/g, () => sqlLiteral(values[i++])); }).join(';\n');

const wrangler = ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', flags.has('--local') ? '--local' : '--remote', '--config', 'dist/server/wrangler.json', ...(flags.has('--local') ? ['--persist-to', '.wrangler/state'] : []), '--command', command];
const result = spawnSync(process.execPath, wrangler, { stdio: ['inherit', 'pipe', 'inherit'] });
if (result.status !== 0) { console.error(result.stdout?.toString()); process.exit(result.status ?? 1); }
const origin = urlArg || (flags.has('--local') ? 'http://127.0.0.1:8787' : 'https://<your-site>');
console.log(`\nההזמנה נוצרה עבור ${email} (מנהלת). הקישור תקף לשבוע ופעם אחת:\n${inviteUrl(origin.replace(/\/$/, ''), token)}\n`);
