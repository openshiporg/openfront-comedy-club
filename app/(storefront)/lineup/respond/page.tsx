import { SlotResponse } from '@/features/storefront/components/SlotResponse';

export const dynamic = 'force-dynamic';

export default async function RespondPage({ searchParams }: { searchParams: Promise<{ slot?: string }> }) {
  const { slot } = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Your lineup slot</h1>
      {slot ? <SlotResponse slotId={slot} /> : <p className="text-sm text-muted-foreground">No slot in this link.</p>}
    </div>
  );
}
