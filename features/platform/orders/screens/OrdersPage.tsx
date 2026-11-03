import { q, venueTimezone } from '../../lib/server';
import { money, when } from '../../lib/format';
import { Page, Tabs, Row, Empty, Status, Meta } from '../../components/ui';

const TABS = ['paid', 'pending_payment', 'partially_refunded', 'refunded', 'cancelled', 'comp'];
export default async function OrdersPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  const tz = await venueTimezone();
  const tab = ((await searchParams) || {}).tab || 'paid';
  const counts = await q<any>(`{ ${TABS.map((t) => `${t}: ticketOrdersCount(where: { status: { equals: ${t} } })`).join(' ')} }`);
  const { ticketOrders } = await q<any>(`query($s: TicketOrderStatusType!) { ticketOrders(where: { status: { equals: $s } }, orderBy: { createdAt: desc }, take: 60) { id orderNumber name email status totalCents partySize createdAt show { title startsAt } } }`, { s: tab });
  return (
    <Page title="Orders">
      <Tabs active={tab} items={TABS.map((t) => ({ key: t, label: t.replaceAll('_', ' '), href: `/dashboard/platform/orders?tab=${t}`, count: counts[t] }))} />
      <div>
        {ticketOrders.length ? ticketOrders.map((o: any) => (
          <Row key={o.id} href={`/dashboard/platform/orders/${o.id}`}>
            <span className="min-w-0"><span className="block"><span className="font-mono text-xs">{o.orderNumber}</span> <span className="font-medium">{o.name}</span></span><Meta>{o.show?.title} · {when(o.show?.startsAt, tz, 'day')} · {o.partySize} guests</Meta></span>
            <span className="flex flex-col items-end gap-1"><Status value={o.status} /><Meta>{money(o.totalCents)}</Meta></span>
          </Row>
        )) : <Empty>No orders here.</Empty>}
      </div>
    </Page>
  );
}
