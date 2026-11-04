import { WaitlistClaim } from '@/features/storefront/components/WaitlistClaim';

export const dynamic = 'force-dynamic';

export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ hold?: string }> }) {
  const { hold } = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Your waitlist offer</h1>
      {hold ? <WaitlistClaim holdKey={hold} /> : <p className="text-sm text-muted-foreground">No offer in this link. <a className="underline" href="/">Browse shows</a>.</p>}
    </div>
  );
}
