import { env } from 'cloudflare:workers';
import seed from '../../../public/seed.json';
import { handleRecords } from '../../../server/records.mjs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) { return handleRecords(request, env.DB, seed); }
export function POST(request: Request) { return handleRecords(request, env.DB, seed); }
