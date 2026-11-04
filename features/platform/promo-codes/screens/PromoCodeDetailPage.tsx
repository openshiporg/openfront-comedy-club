import { notFound } from 'next/navigation';
import { q } from '../../lib/server';
import { money } from '../../lib/format';
import { Page, Section, Stat, Status, Meta } from '../../components/ui';
import { PromoLimitForm } from '../components/PromoLimitForm';

export default async function PromoCodeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { promoCode: p } = await q<any>(`query($id: ID!) { promoCode(where: { id: $id }) { id code discountType value perOrderLimit maxUses usedCount status } }`, { id });
  if (!p) notFound();
  const off = p.discountType === 'percent_bps' ? `${p.value / 100}% off` : p.discountType === 'amount_cents' ? `${money(p.value)} off` : 'Comp';
  return (
    <Page title={p.code} crumbs={[{ label: 'Promo codes', href: '/dashboard/platform/promo-codes' }]}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><Status value={p.status} /><Meta>{off}</Meta></div>
      <div className="grid grid-cols-2 gap-4"><Stat name="Used" value={`${p.usedCount}${p.maxUses ? ` of ${p.maxUses}` : ''}`} /><Stat name="Per order" value={p.perOrderLimit} /></div>
      <Section title="Per-order limit"><PromoLimitForm promoId={p.id} current={p.perOrderLimit} /></Section>
    </Page>
  );
}
