'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

// Only these custom operations are reachable from the operator screens.
const OPS: Record<string, Record<string, string>> = {
  publishShow: { showId: 'ID!', nextStatus: 'String' },
  pauseSales: { showId: 'ID!' },
  resumeSales: { showId: 'ID!' },
  cancelShow: { showId: 'ID!', reason: 'String!' },
  generateShowsFromTemplate: { templateId: 'ID!' },
  offerSlot: { showId: 'ID!', comedianId: 'ID!', role: 'String!', position: 'Int', setMinutes: 'Int', feeCents: 'Int' },
  confirmSlot: { slotId: 'ID!' },
  updateSlotStatus: { slotId: 'ID!', status: 'String!' },
  scheduleShowReminders: { showId: 'ID!' },
  issueSlotLink: { slotId: 'ID!' },
  issueComp: { showId: 'ID!', tierId: 'ID!', quantity: 'Int!', recipientName: 'String!', recipientEmail: 'String', reason: 'String!', approvalId: 'ID' },
  checkInTicket: { tokenOrCode: 'String!', showId: 'ID!', method: 'String', scannedAt: 'String' },
  seatParty: { orderId: 'ID!', tableIds: '[ID!]!', showId: 'ID!' },
  openCheck: { seatingAssignmentId: 'ID!' },
  addCheckItem: { checkId: 'ID!', menuItemId: 'ID!', qty: 'Int!' },
  closeCheck: { checkId: 'ID!', tipCents: 'Int', waive: 'Boolean', reason: 'String', approvalId: 'ID' },
  voidCheckItem: { itemId: 'ID!', checkId: 'ID!', reason: 'String!', approvalId: 'ID!' },
  runOpenMicLottery: { showId: 'ID!' },
  offerWaitlist: { showId: 'ID!' },
  removeWaitlistEntry: { entryId: 'ID!', reason: 'String' },
  setSalesWindow: { tierId: 'ID!', salesStartAt: 'String', salesEndAt: 'String' },
  undoCheckIn: { ticketId: 'ID!', showId: 'ID!', reason: 'String!' },
  updatePromoLimit: { promoId: 'ID!', perOrderLimit: 'Int!' },
  addBringerSignup: { showId: 'ID!', name: 'String!', email: 'String!', guestsRequired: 'Int!' },
  setSignupStatus: { signupId: 'ID!', status: 'String!' },
  recordBringerArrival: { signupId: 'ID!', guests: 'Int!' },
  closeShow: { showId: 'ID!' },
  closeRun: { runId: 'ID!' },
  approvePayout: { payoutId: 'ID!' },
  recordPayoutPaid: { payoutId: 'ID!', method: 'String!', reference: 'String!' },
  refundTicketOrder: { orderId: 'ID!', amountCents: 'Int', ticketIds: '[ID!]', reason: 'String!', approvalId: 'ID' },
  requestApproval: { actionType: 'String!', targetId: 'String!', reason: 'String!', amount: 'Int' },
  approveRequest: { approvalId: 'ID!' },
};
export async function findApproval(input: { actionType: string; targetId: string; reason: string; amount: number | null }) {
  const res = await keystoneClient(`query($actionType: String!, $targetId: String!, $reason: String!, $amount: Int) { matchingManagerApproval(actionType: $actionType, targetId: $targetId, reason: $reason, amount: $amount) }`, input);
  if (!res.success) return { id: '', error: res.error || 'Approval lookup failed' };
  return { id: (res.data as any)?.matchingManagerApproval?.id || '', error: '' };
}
const NO_KEY = new Set(['requestApproval', 'approveRequest']);

export async function runCommand(op: string, variables: Record<string, unknown>, paths: string[] = []) {
  const spec = OPS[op];
  if (!spec) return { ok: false as const, error: 'Unknown action' };
  const keys = Object.keys(variables).filter((k) => k in spec && variables[k] !== undefined && variables[k] !== '');
  const decl = keys.map((k) => `$${k}: ${spec[k]}`);
  const args = keys.map((k) => `${k}: $${k}`);
  const vars: Record<string, unknown> = Object.fromEntries(keys.map((k) => [k, variables[k]]));
  if (!NO_KEY.has(op)) { decl.push('$idempotencyKey: String!'); args.push('idempotencyKey: $idempotencyKey'); vars.idempotencyKey = typeof variables.idempotencyKey === 'string' && variables.idempotencyKey ? variables.idempotencyKey : randomUUID(); }
  const res = await keystoneClient(`mutation Run(${decl.join(', ')}) { ${op}(${args.join(', ')}) }`, vars);
  if (!res.success) return { ok: false as const, error: res.error || 'Action failed' };
  for (const p of paths) revalidatePath(p);
  return { ok: true as const, data: (res.data as any)?.[op] };
}
