import Link from 'next/link';
import { q } from '../../lib/server';
import { money } from '../../lib/format';
import { Page, Row, Empty, Status, Meta } from '../../components/ui';

export default async function PromoCodesPage() {
  const { promoCodes } = await q<any>(`{ promoCodes(orderBy: { code: asc }, take: 100) { id code discountType value maxUses usedCount status } }`);
  const off = (p: any) => p.discountType === 'percent_bps' ? `${p.value / 100}% off` : p.discountType === 'amount_cents' ? `${money(p.value)} off` : 'Comp';
  return (
    <Page title="Promo codes">
      <div className="flex justify-end"><Link className="text-sm underline underline-offset-4" href="/dashboard/promo-codes/create">Add code</Link></div>
      {promoCodes.length ? promoCodes.map((p: any) => (
        <Row key={p.id} href={`/dashboard/promo-codes/${p.id}`}>
          <span className="min-w-0"><span className="font-mono font-semibold">{p.code}</span> <Meta>{off(p)} · {p.usedCount}{p.maxUses ? ` of ${p.maxUses}` : ''} used</Meta></span>
          <Status value={p.status} />
        </Row>
      )) : <Empty>No promo codes.</Empty>}
    </Page>
  );
}
