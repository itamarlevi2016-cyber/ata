# קשר טוב — מרחב השידוכים המשותף

אפליקציית ניהול שידוכים בעברית: מאגר שמות משותף, כרטיסים, ייבוא מקבצים ורזומות.
מבוססת על vinext + Cloudflare Workers + D1.

- הוראות הפעלה, פרסום והגדרת רשימת הגישה: [START-HERE-HE.txt](START-HERE-HE.txt)
- `pnpm dev` — פיתוח מקומי · `pnpm build` — בנייה · `pnpm start` — הרצת הגרסה הבנויה עם wrangler

**לפני פרסום**: להגדיר את `KESHER_ALLOWED_EMAILS` או את `server/allowed-emails.mjs`, אחרת האתר נעול לכולן.
