import { q } from '../../lib/server';
import { money } from '../../lib/format';
import { Page, Row, Empty, Meta } from '../../components/ui';

export default async function CustomersPage() {
  const { ticketOrders } = await q<any>(`{ ticketOrders(where: { status: { in: [paid, partially_refunded, comp] } }, orderBy: { createdAt: desc }, take: 500) { email name totalCents partySize } }`);
  const byEmail = new Map<string, { name: string; orders: number; guests: number; spent: number }>();
  for (const o of ticketOrders) {
    const k = String(o.email).toLowerCase();
    const c = byEmail.get(k) || { name: o.name, orders: 0, guests: 0, spent: 0 };
    c.orders++; c.guests += o.partySize; c.spent += o.totalCents; byEmail.set(k, c);
  }
  const rows = [...byEmail.entries()].sort((a, b) => b[1].spent - a[1].spent);
  return (
    <Page title="Customers">
      {rows.length ? rows.map(([email, c]) => (
        <Row key={email}><span className="min-w-0"><span className="block font-medium">{c.name}</span><Meta>{email}</Meta></span><span className="text-right"><span className="block font-mono text-xs">{money(c.spent)}</span><Meta>{c.orders} orders · {c.guests} guests</Meta></span></Row>
      )) : <Empty>No customers yet.</Empty>}
    </Page>
  );
}
