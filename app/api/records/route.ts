import { env } from 'cloudflare:workers';
import seed from '../../../server/seed.json';
import { handleRecords } from '../../../server/records.mjs';
import { authorize } from '../../../server/auth.mjs';
export const dynamic = 'force-dynamic';
// The worker in worker/index.ts already gates every request; this second check
// identifies the member so each change is recorded with its author.
async function handle(request: Request) {
  const db = env.DB?.withSession ? env.DB.withSession('first-primary') : env.DB;
  const auth = await authorize(request, env as Record<string, string | undefined>, db);
  if (auth.status !== 'ok') return new Response(JSON.stringify({ error: 'יש להתחבר כדי לגשת למאגר' }), { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  return handleRecords(request, env.DB, seed, auth.user);
}
export function GET(request: Request) { return handle(request); }
export function POST(request: Request) { return handle(request); }
