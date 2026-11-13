import Link from 'next/link';
import { q } from '../../lib/server';
import { Page, Row, Empty, Status, Meta } from '../../components/ui';

export default async function PaymentProvidersPage() {
  const { paymentProviders } = await q<any>(`{ paymentProviders(orderBy: { name: asc }) { id name code isInstalled createPaymentFunction } }`);
  const { authenticatedItem } = await q<{ authenticatedItem?: { role?: { canManagePayments?: boolean } } }>(`{ authenticatedItem { ... on User { role { canManagePayments } } } }`);
  const canManage = authenticatedItem?.role?.canManagePayments === true;
  const stripeReady = Boolean(process.env.NEXT_PUBLIC_STRIPE_KEY && process.env.STRIPE_SECRET_KEY);
  return (
    <Page title="Payment providers">
      {canManage ? <div className="flex justify-end"><Link className="inline-flex min-h-11 items-center text-sm underline underline-offset-4" href="/dashboard/payment-providers/create">Add provider</Link></div> : null}
      {paymentProviders.length ? paymentProviders.map((p: any) => (
        <Row key={p.id} href={`/dashboard/payment-providers/${p.id}`}>
          <span className="min-w-0"><span className="font-medium">{p.name}</span> {canManage ? <Meta>{p.code} · adapter {p.createPaymentFunction}{p.createPaymentFunction === 'stripe' ? ` · keys ${stripeReady ? 'set' : 'missing'}` : ''}</Meta> : null}</span>
          <Status value={p.isInstalled ? 'active' : 'paused'} />
        </Row>
      )) : <Empty>No providers. Run club setup from the sidebar.</Empty>}
    </Page>
  );
}
