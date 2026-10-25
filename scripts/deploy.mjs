// פרסום מהטרמינל לחשבון Cloudflare של בעלת האתר: בנייה והעלאה. דרישה: npx wrangler login (פעם אחת).
// מזהה מסד הנתונים נמצא ב-wrangler.jsonc; המיגרציות רצות מתוך האתר בבקשה הראשונה.
import { spawnSync } from 'node:child_process';
const run = (label, cmd, args) => {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
  if (r.status !== 0) { console.error(`✘ ${label} נכשל`); process.exit(r.status ?? 1); }
};
run('בנייה', process.execPath, ['scripts/run-framework.mjs', 'build']);
run('העלאת האתר', process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy']);
console.log('\n✔ פורסם. בכניסה הראשונה לכתובת האתר יופיע דף ההקמה ליצירת המנהלת הראשונה.');
