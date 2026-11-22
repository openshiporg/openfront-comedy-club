import { q, venueTimezone } from '../../lib/server';
import { label, money, when } from '../../lib/format';
import { Page, Tabs, Row, Empty, Status, Meta, SearchBox, MoreLink } from '../../components/ui';

const TABS = ['paid', 'pending_payment', 'partially_refunded', 'refunded', 'cancelled', 'comp'];
export default async function OrdersPage({ searchParams }: { searchParams?: Promise<{ tab?: string; q?: string; n?: string }> }) {
  const tz = await venueTimezone();
  const sp = (await searchParams) || {};
  const tab = TABS.includes(sp.tab || '') ? sp.tab! : 'paid';
  const term = (sp.q || '').trim();
  const take = Math.min(Math.max(Number(sp.n) || 50, 50), 1000);
  const find = term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }, { orderNumber: { contains: term, mode: 'insensitive' } }] } : {};
  const counts = await q<any>(`{ ${TABS.map((t) => `${t}: ticketOrdersCount(where: { status: { equals: ${t} } })`).join(' ')} }`);
  const { ticketOrders, found } = await q<any>(`query($w: TicketOrderWhereInput!, $n: Int!) { found: ticketOrdersCount(where: $w) ticketOrders(where: $w, orderBy: { createdAt: desc }, take: $n) { id orderNumber name email status totalCents partySize createdAt show { title startsAt } } }`, { w: { status: { equals: tab }, ...find }, n: take });
  return (
    <Page title="Orders">
      <Tabs active={tab} items={TABS.map((t) => ({ key: t, label: label(t), href: `/dashboard/platform/orders?tab=${t}`, count: counts[t] }))} />
      <SearchBox q={term} placeholder="Name, email or order number" keep={{ tab }} />
      <div>
        {ticketOrders.length ? ticketOrders.map((o: any) => (
          <Row key={o.id} href={`/dashboard/platform/orders/${o.id}`}>
            <span className="min-w-0"><span className="block"><span className="font-mono text-xs">{o.orderNumber}</span> <span className="font-medium">{o.name}</span></span><Meta>{o.show?.title} · {when(o.show?.startsAt, tz, 'day')} · {o.partySize} guests</Meta></span>
            <span className="flex flex-col items-end gap-1"><Status value={o.status} /><Meta>{money(o.totalCents)}</Meta></span>
          </Row>
        )) : <Empty>{term ? `No ${label(tab).toLowerCase()} orders match “${term}”.` : 'No orders here.'}</Empty>}
        {found > ticketOrders.length ? <MoreLink shown={ticketOrders.length} total={found} href={`/dashboard/platform/orders?${new URLSearchParams({ tab, ...(term ? { q: term } : {}), n: String(take + 100) })}`} /> : null}
      </div>
    </Page>
  );
}
