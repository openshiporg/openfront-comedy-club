import { notFound } from 'next/navigation';
import { keystoneContext } from '@/features/keystone/context';
import { Confirmation } from '@/features/storefront/components/Confirmation';

export const dynamic = 'force-dynamic';

export default async function OrderPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const found = await keystoneContext.prisma.ticketOrder.findUnique({ where: { orderNumber }, select: { id: true } });
  if (!found) notFound();
  return <Confirmation orderNumber={orderNumber} />;
}
