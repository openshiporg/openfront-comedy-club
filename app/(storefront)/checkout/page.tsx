import { CheckoutForm } from '@/features/storefront/components/CheckoutForm';

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ hold?: string }> }) {
  const { hold } = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Checkout</h1>
      {hold ? <CheckoutForm holdKey={hold} /> : <p className="text-sm text-muted-foreground">No tickets held. <a className="underline" href="/">Choose a show</a>.</p>}
    </div>
  );
}
