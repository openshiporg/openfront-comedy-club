import Link from 'next/link';
import { q, canRead, venueTimezone } from '../../lib/server';
import { money, when } from '../../lib/format';
import { Page, Row, Empty, Status, Meta } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';

const ACTION: Record<string, string> = {
  refund_payment: 'Refund', comp_tickets: 'Comp tickets', void_check: 'Void check', void_item: 'Void item', waive_minimum: 'Waive drink minimum',
};
// what each status means to the manager reading the list
const STATE: Record<string, string> = { pending: 'Waiting', approved: 'Approved, not used', rejected: 'Rejected', consumed: 'Approved and used', expired: 'Expired' };

/** Comps count tickets; every other request is an amount of money in cents. */
const amountText = (a: any) => a.amount === null ? null : a.actionType === 'comp_tickets' ? `${a.amount} ${a.amount === 1 ? 'ticket' : 'tickets'}` : money(a.amount);

export default async function ApprovalsPage() {
  const tz = await venueTimezone();
  const { managerApprovals } = await q<any>(`{ managerApprovals(orderBy: { requestedAt: desc }, take: 100) { id actionType targetId reason amount status requestedAt expiresAt requestedBy { name } approvedBy { name } } }`);
  // name what each request is about: the order for a refund, the show for a comp
  const ids = (type: string) => [...new Set<string>(managerApprovals.filter((a: any) => a.actionType === type).map((a: any) => a.targetId))];
  const [orders, shows] = await Promise.all([
    ids('refund_payment').length && (await canRead('ticket-orders')) ? q<any>(`query($ids: [ID!]) { ticketOrders(where: { id: { in: $ids } }) { id orderNumber name } }`, { ids: ids('refund_payment') }).then((r) => r.ticketOrders).catch(() => []) : [],
    ids('comp_tickets').length && (await canRead('shows')) ? q<any>(`query($ids: [ID!]) { shows(where: { id: { in: $ids } }) { id title startsAt } }`, { ids: ids('comp_tickets') }).then((r) => r.shows).catch(() => []) : [],
  ]);
  const about = (a: any) => {
    const o = orders.find((x: any) => x.id === a.targetId);
    if (o) return <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href={`/dashboard/platform/orders/${o.id}`}><span>Order <span className="font-mono">{o.orderNumber}</span> · {o.name}</span></Link>;
    const s = shows.find((x: any) => x.id === a.targetId);
    if (s) return <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href={`/dashboard/platform/shows/${s.id}`}><span>{s.title} · {when(s.startsAt, tz)}</span></Link>;
    return a.actionType.includes('check') || a.actionType === 'void_item' || a.actionType === 'waive_minimum' ? 'A bar check' : null;
  };
  return <Page title="Approvals">{managerApprovals.length ? managerApprovals.map((a: any) => {
    const expired = new Date(a.expiresAt) < new Date() && ['pending', 'approved'].includes(a.status);
    const state = expired ? 'expired' : a.status;
    const amt = amountText(a);
    return <Row key={a.id}>
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{ACTION[a.actionType] || a.actionType.replaceAll('_', ' ')}{amt ? ` · ${amt}` : ''}</p>
        {about(a) ? <p className="break-words text-sm">{about(a)}</p> : null}
        <p className="break-words text-sm text-muted-foreground">“{a.reason}”</p>
        <Meta>Asked by {a.requestedBy?.name || 'staff'} · {when(a.requestedAt, tz)}{a.approvedBy?.name ? ` · approved by ${a.approvedBy.name}` : ''}{state === 'pending' || state === 'approved' ? ` · good until ${when(a.expiresAt, tz, 'time')}` : ''}</Meta>
      </div>
      <div className="flex flex-wrap items-center gap-2"><Status value={state} text={STATE[state]} />{state === 'pending' ? <ActionButton op="approveRequest" vars={{ approvalId: a.id }}>Approve</ActionButton> : null}</div>
    </Row>;
  }) : <Empty>No approval requests.</Empty>}</Page>;
}
