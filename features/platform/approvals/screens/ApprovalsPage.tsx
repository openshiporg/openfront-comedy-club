import { q } from '../../lib/server';
import { Page, Row, Empty, Status, Meta } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';

export default async function ApprovalsPage() {
  const { managerApprovals } = await q<any>(`{ managerApprovals(orderBy: { requestedAt: desc }, take: 100) { id actionType targetId reason amount status expiresAt requestedBy { name } approvedBy { name } } }`);
  return <Page title="Approvals">{managerApprovals.length ? managerApprovals.map((a: any) => <Row key={a.id}>
    <div className="min-w-0 space-y-1"><span className="font-medium">{a.actionType.replaceAll('_', ' ')}</span><p className="break-words text-sm">{a.reason}</p><Meta>{a.requestedBy?.name} · {a.amount === null ? 'No amount' : `${a.amount} units / cents`} · expires {new Date(a.expiresAt).toLocaleTimeString('en-US')}</Meta><p className="break-all font-mono text-xs">{a.targetId}</p></div>
    <div className="flex flex-wrap items-center gap-2"><Status value={new Date(a.expiresAt) < new Date() && ['pending', 'approved'].includes(a.status) ? 'expired' : a.status} />{a.status === 'pending' && new Date(a.expiresAt) > new Date() ? <ActionButton op="approveRequest" vars={{ approvalId: a.id }}>Approve</ActionButton> : null}</div>
  </Row>) : <Empty>No approval requests.</Empty>}</Page>;
}
