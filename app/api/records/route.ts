import { env } from 'cloudflare:workers';
import seed from '../../../server/seed.json';
import { handleRecords } from '../../../server/records.mjs';
import { getUser } from '../../../server/auth.mjs';
export const dynamic = 'force-dynamic';
// The worker in worker/index.ts has already verified that the user is approved;
// here we only identify them so every change is recorded with its author.
const actor = (request: Request) => getUser(request, env as Record<string, string | undefined>);
export function GET(request: Request) { return handleRecords(request, env.DB, seed, actor(request)); }
export function POST(request: Request) { return handleRecords(request, env.DB, seed, actor(request)); }
