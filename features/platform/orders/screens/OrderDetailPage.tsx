import { notFound } from 'next/navigation';
import { q, venueTimezone } from '../../lib/server';
import { money, when } from '../../lib/format';
import { Page, Section, Row, Stat, Status, Meta } from '../../components/ui';
import { RefundPanel } from '../components/RefundPanel';

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tz = await venueTimezone();
  const { ticketOrder: o } = await q<any>(`query($id: ID!) { ticketOrder(where: { id: $id }) {
    id orderNumber name email phone status source subtotalCents feesCents discountCents taxCents totalCents partySize seatingRequest birthdayOrOccasion ageAttested
    show { id title startsAt }
    lines { id tierName unitPriceCents unitFeeCents quantity lineTotalCents }
    tickets { id ticketCode status holderName }
    refunds { id amount status reason }
  } }`, { id });
  if (!o) notFound();
  return (
    <Page title={o.orderNumber} crumbs={[{ label: 'Orders', href: '/dashboard/platform/orders' }]}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><Status value={o.status} /><Meta>{o.name} · {o.email} · {o.show?.title} · {when(o.show?.startsAt, tz)}</Meta></div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><Stat name="Subtotal" value={money(o.subtotalCents)} /><Stat name="Fees" value={money(o.feesCents)} /><Stat name="Discount" value={money(o.discountCents)} /><Stat name="Total" value={money(o.totalCents)} /></div>
      <Section title="Lines">{o.lines.map((l: any) => <Row key={l.id}><span>{l.quantity} × {l.tierName}</span><span className="font-mono text-xs">{money(l.lineTotalCents)}</span></Row>)}</Section>
      <Section title="Tickets">{o.tickets.map((t: any) => <Row key={t.id}><span className="font-mono text-xs">{t.ticketCode}</span><Status value={t.status} /></Row>)}</Section>
      {o.refunds.length ? <Section title="Refunds">{o.refunds.map((r: any) => <Row key={r.id}><span className="min-w-0 break-words">{r.reason}</span><span className="inline-flex gap-3"><Meta>{money(r.amount)}</Meta><Status value={r.status} /></span></Row>)}</Section> : null}
      {['paid', 'partially_refunded'].includes(o.status) ? <Section title="Refund"><RefundPanel orderId={o.id} remainingTickets={o.tickets.filter((t: any) => t.status === 'valid').map((t: any) => ({ id: t.id, code: t.ticketCode }))} /></Section> : null}
    </Page>
  );
}
