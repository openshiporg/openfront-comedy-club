import { notFound } from 'next/navigation';
import { keystoneContext } from '@/features/keystone/context';
import { HolderTicket } from '@/features/storefront/components/HolderTicket';

export const dynamic = 'force-dynamic';

export default async function TicketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const found = await keystoneContext.prisma.ticket.findUnique({ where: { ticketCode: code }, select: { id: true } });
  if (!found) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Your ticket</h1>
      <HolderTicket ticketCode={code} />
    </div>
  );
}
