import { gqlCall } from '@/features/storefront/lib/data';

// Sweeper for expired holds and unresolved pending checkouts. Call from a scheduler with the CRON_SECRET.
export async function POST(request: Request) {
  const secret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const holds = await gqlCall(`mutation { expireHolds }`);
  const sweep = await gqlCall(`mutation($s: String!) { sweepPendingCheckouts(secret: $s) }`, { s: secret });
  return Response.json({ holds: holds.ok ? (holds.data as any).expireHolds : holds.error, sweep: sweep.ok ? (sweep.data as any).sweepPendingCheckouts : sweep.error }, { status: sweep.ok ? 200 : 401 });
}
