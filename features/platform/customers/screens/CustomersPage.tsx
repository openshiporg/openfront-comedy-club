import { q } from '../../lib/server';
import { money } from '../../lib/format';
import { Page, Row, Empty, Meta, SearchBox, MoreLink } from '../../components/ui';

export default async function CustomersPage({ searchParams }: { searchParams?: Promise<{ q?: string; n?: string }> }) {
  const sp = (await searchParams) || {};
  const term = (sp.q || '').trim();
  const shown = Math.min(Math.max(Number(sp.n) || 50, 50), 5000);
  const find = term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }] } : {};
  const { ticketOrders } = await q<any>(`query($w: TicketOrderWhereInput!) { ticketOrders(where: $w, orderBy: { createdAt: desc }, take: 5000) { email name totalCents partySize } }`, { w: { status: { in: ['paid', 'partially_refunded', 'comp'] }, ...find } });
  const byEmail = new Map<string, { name: string; orders: number; guests: number; spent: number }>();
  for (const o of ticketOrders) {
    const k = String(o.email).toLowerCase();
    const c = byEmail.get(k) || { name: o.name, orders: 0, guests: 0, spent: 0 };
    c.orders++; c.guests += o.partySize; c.spent += o.totalCents; byEmail.set(k, c);
  }
  const rows = [...byEmail.entries()].sort((a, b) => b[1].spent - a[1].spent);
  return (
    <Page title="Customers">
      <SearchBox q={term} placeholder="Name or email" />
      {rows.length ? rows.slice(0, shown).map(([email, c]) => (
        <Row key={email}><span className="min-w-0"><span className="block font-medium">{c.name}</span><Meta>{email}</Meta></span><span className="text-right"><span className="block font-mono text-xs">{money(c.spent)}</span><Meta>{c.orders} orders · {c.guests} guests</Meta></span></Row>
      )) : <Empty>{term ? `No customers match “${term}”.` : 'No customers yet.'}</Empty>}
      {rows.length > shown ? <MoreLink shown={shown} total={rows.length} href={`/dashboard/platform/customers?${new URLSearchParams({ ...(term ? { q: term } : {}), n: String(shown + 100) })}`} /> : null}
    </Page>
  );
}
