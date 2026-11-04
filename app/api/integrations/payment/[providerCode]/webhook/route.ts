import { NextRequest, NextResponse } from 'next/server';
import { keystoneContext } from '@/features/keystone/context';
import { handlePaymentWebhook } from '@/features/keystone/mutations/paymentWebhook';
export const runtime = 'nodejs';
const MAX_BYTES = 262144;
export async function POST(request: NextRequest, { params }: { params: Promise<{ providerCode: string }> }) {
  if ((await params).providerCode !== 'pp_stripe') return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
  if (Number(request.headers.get('content-length') || 0) > MAX_BYTES) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > MAX_BYTES) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  try {
    const result = await handlePaymentWebhook(keystoneContext, rawBody, Object.fromEntries(request.headers.entries()));
    return NextResponse.json(result, { status: result.success ? 200 : 409 });
  } catch {
    return NextResponse.json({ error: 'Webhook verification or settlement failed' }, { status: 400 });
  }
}
