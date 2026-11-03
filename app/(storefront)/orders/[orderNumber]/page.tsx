import { Confirmation } from '@/features/storefront/components/Confirmation';

export default async function OrderPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  return <Confirmation orderNumber={orderNumber} />;
}
