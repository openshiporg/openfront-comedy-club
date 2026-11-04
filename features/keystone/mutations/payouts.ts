import { audit, command, requirePermission, transition } from '../lib/commands';

/** Manual payment evidence only: does not execute ACH, check or Venmo transfers. */
export async function approvePayout(_: any, a: any, c: any) {
  requirePermission(c, 'canManagePayouts');
  return command(c, 'approvePayout', a, async tx => {
    const row = await tx.comedianPayout.findUnique({ where: { id: a.payoutId }, include: { comedian: true } });
    if (!row?.comedian?.payeeDetailsOnFile) throw new Error('Payee details must be on file');
    return transition(tx, c, 'comedianPayout', row.id, 'approved', { draft: ['approved'] });
  }, 'payout:' + a.payoutId);
}
export async function recordPayoutPaid(_: any, a: any, c: any) {
  requirePermission(c, 'canManagePayouts');
  if (!['check', 'ach', 'venmo'].includes(a.method) || !a.reference?.trim() || a.reference.length > 200) throw new Error('Payment method and reference required');
  return command(c, 'recordPayoutPaid', a, async tx => {
    const before = await tx.comedianPayout.findUnique({ where: { id: a.payoutId } });
    if (before?.status !== 'approved') throw new Error('Only approved payouts can be paid');
    const changed = await tx.comedianPayout.updateMany({ where: { id: before.id, status: 'approved' }, data: { status: 'paid', method: a.method, reference: a.reference.trim(), paidAt: new Date() } });
    if (changed.count !== 1) throw new Error('Payout changed');
    const after = await tx.comedianPayout.findUnique({ where: { id: before.id } });
    await audit(tx, c, 'manual_payment_recorded', 'ComedianPayout', before.id, before, after, a.reference.trim());
    return after;
  }, 'payout:' + a.payoutId);
}
