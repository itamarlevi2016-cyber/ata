// פרסום לחשבון Cloudflare של בעלת האתר: בנייה, הרצת המיגרציות על D1 בענן, והעלאת ה-Worker.
// דרישות: wrangler login (פעם אחת), ומשתנה סביבה KESHER_D1_ID עם מזהה מסד הנתונים (wrangler d1 create kesher-tov).
import { spawnSync } from 'node:child_process';

if (!process.env.KESHER_D1_ID) {
  console.error('חסר KESHER_D1_ID. צרי מסד נתונים עם: npx wrangler d1 create kesher-tov — והגדירי את ה-database_id שהתקבל כמשתנה סביבה.');
  process.exit(1);
}
const run = (label, cmd, args) => {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
  if (r.status !== 0) { console.error(`✘ ${label} נכשל`); process.exit(r.status ?? 1); }
};
const wrangler = ['node_modules/wrangler/bin/wrangler.js'];
run('בנייה', process.execPath, ['scripts/run-framework.mjs', 'build']);
run('מיגרציות על מסד הנתונים בענן', process.execPath, [...wrangler, 'd1', 'migrations', 'apply', 'DB', '--remote', '--config', 'dist/server/wrangler.json']);
run('העלאת האתר', process.execPath, [...wrangler, 'deploy', '--config', 'dist/server/wrangler.json']);
console.log('\n✔ פורסם. אם זו הפעם הראשונה, צרי את המנהלת הראשונה: node scripts/invite.mjs <email> "<שם>" --url https://<כתובת-האתר>');
