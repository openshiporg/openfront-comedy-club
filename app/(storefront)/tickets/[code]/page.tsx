import { HolderTicket } from '@/features/storefront/components/HolderTicket';

export const dynamic = 'force-dynamic';

export default async function TicketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Your ticket</h1>
      <HolderTicket ticketCode={code} />
    </div>
  );
}
