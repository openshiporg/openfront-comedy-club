import { audit, code, command, hash, lockTransactionKey, requirePermission } from '../lib/commands';
import { minimum, payout, settlement, runClosePlan } from '../lib/money';
import { consumeManagerApproval, requestManagerApproval, approveManagerApproval } from '../utils/managerApproval';
import { refundOrderInternal, ticketToken } from './checkout';
import { expireUnderLock } from './tickets';
import { zonedTime } from '../lib/time';

const DAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Weekly RRULE (FREQ=WEEKLY;BYDAY=TU,WE). Creates 8 weeks of shows, idempotent on (template, date). */
export async function generateShowsFromTemplate(_: any, a: any, c: any) {
  requirePermission(c, 'canManageShows');
  return command(c, 'generateShowsFromTemplate', a, async tx => {
    const t = await tx.showTemplate.findUnique({ where: { id: a.templateId }, include: { room: { include: { venue: true } }, defaultPriceTiers: true } });
    if (!t) throw new Error('Template not found');
    const byday = /BYDAY=([A-Z,]+)/.exec(t.recurrenceRule || '')?.[1]?.split(',').map((d: string) => DAYS[d]);
    if (!/FREQ=WEEKLY/.test(t.recurrenceRule || '') || !byday?.length || byday.some((d: any) => d === undefined)) throw new Error('Weekly BYDAY rule required');
        const tz = t.room.venue.timezone;
    const created: string[] = [];
    const from = new Date(a.from || Date.now());
    for (let i = 0; i < 56; i++) {
      const d = new Date(from.getTime() + i * 86400000);
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(d);
      const g = (k: string) => parts.find(p => p.type === k)!.value;
      const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday'));
      if (!byday.includes(dow)) continue;
      const day = `${g('year')}-${g('month')}-${g('day')}`;
      const key = `${t.id}:${day}`;
      if (await tx.show.findUnique({ where: { occurrenceKey: key } })) continue;
      const startsAt = zonedTime(day, String(t.startTime), tz);
      const show = await tx.show.create({ data: { roomId: t.roomId, templateId: t.id, title: t.title, occurrenceKey: key, startsAt, doorsAt: new Date(startsAt.getTime() - 3600000), endsAt: new Date(startsAt.getTime() + t.duration * 60000), signupOpensAt: t.isOpenMic ? new Date(startsAt.getTime() - 7 * 86400000) : null, ageRestriction: t.defaultAgeRestriction, capacity: t.room.capacity, status: 'draft', isOpenMic: t.isOpenMic } });
      for (const tier of t.defaultPriceTiers) await tx.priceTier.create({ data: { showId: show.id, name: tier.name, priceCents: tier.priceCents, feeCents: tier.feeCents, capacity: Math.min(tier.capacity, t.room.capacity), isTableTier: tier.isTableTier, seatsPerUnit: tier.seatsPerUnit, status: 'on_sale' } });
      created.push(show.id);
    }
    await audit(tx, c, 'generated', 'ShowTemplate', t.id, null, { created: created.length });
    return { created: created.length };
  }, 'template:' + a.templateId);
}
export async function issueComp(_: any, a: any, c: any) {
  requirePermission(c, 'canManageOrders');
  if (!Number.isInteger(a.quantity) || a.quantity < 1 || a.quantity > 20) throw new Error('Choose 1–20 tickets');
  const settings = await c.prisma.venueSettings.findFirst();
  return command(c, 'issueComp', a, async tx => {
    await expireUnderLock(tx, a.showId, c);
    const show = await tx.show.findUnique({ where: { id: a.showId }, include: { room: true } });
    const tier = await tx.priceTier.findUnique({ where: { id: a.tierId } });
    if (!show || !tier || tier.showId !== show.id || ['cancelled', 'completed', 'settled'].includes(show.status)) throw new Error('Tickets unavailable');
    const totals = await tx.priceTier.aggregate({ where: { showId: show.id }, _sum: { sold: true, held: true } });
    if (tier.sold + tier.held + a.quantity > tier.capacity || (totals._sum.sold || 0) + (totals._sum.held || 0) + a.quantity > Math.min(show.capacity, show.room.capacity)) throw new Error('Not enough capacity');
    let approvalId: string | null = null;
    if (a.quantity > (settings?.compApprovalQuantity ?? 4)) {
      await consumeManagerApproval(tx, { approvalId: a.approvalId, actorId: c.session.itemId, actionType: 'comp_tickets', targetId: show.id, reason: a.reason, amount: a.quantity, entityType: 'Comp', entityId: show.id });
      approvalId = a.approvalId;
    }
    const comp = await tx.comp.create({ data: { showId: show.id, issuedById: c.session.itemId, recipientName: a.recipientName, recipientEmail: String(a.recipientEmail || '').toLowerCase(), quantity: a.quantity, reason: a.reason, approvalId } });
    const order = await tx.ticketOrder.create({ data: { orderNumber: code('CC'), email: comp.recipientEmail, name: a.recipientName, showId: show.id, status: 'comp', source: 'comp', partySize: a.quantity, secretKey: hash(code()), lines: { create: [{ tierName: tier.name, unitPriceCents: 0, unitFeeCents: 0, quantity: a.quantity, lineTotalCents: 0, priceTierId: tier.id }] } }, include: { lines: true } });
    for (let i = 0; i < a.quantity; i++) { const tc = code('T'); await tx.ticket.create({ data: { orderId: order.id, showId: show.id, lineId: order.lines[0].id, ticketCode: tc, tokenHash: hash(ticketToken(tc)), holderName: a.recipientName, status: 'valid' } }); }
    await tx.priceTier.update({ where: { id: tier.id }, data: { sold: { increment: a.quantity } } });
    await audit(tx, c, 'comp_issued', 'Comp', comp.id, null, comp, a.reason);
    return { compId: comp.id, orderNumber: order.orderNumber };
  }, 'show:' + a.showId);
}

export async function requestApproval(_: any, a: any, c: any) { const r = await requestManagerApproval(null, a, c); return { id: r.id, status: r.status }; }
export async function approveRequest(_: any, a: any, c: any) { const r = await approveManagerApproval(null, { approvalId: a.approvalId }, c); await audit(c.prisma, c, 'approved', 'ManagerApproval', r.id, null, { status: r.status }); return { id: r.id, status: r.status }; }

export async function voidCheckItem(_: any, a: any, c: any) {
  requirePermission(c, 'canManageChecks');
  return command(c, 'voidCheckItem', a, async tx => {
    const item = await tx.checkItem.findUnique({ where: { id: a.itemId }, include: { check: true } });
    if (!item || item.checkId !== a.checkId || item.voided || item.check.status !== 'open') throw new Error('Item cannot be voided');
    await consumeManagerApproval(tx, { approvalId: a.approvalId, actorId: c.session.itemId, actionType: 'void_item', targetId: item.id, reason: a.reason, amount: item.priceCents * item.qty, entityType: 'CheckItem', entityId: item.id });
    const changed = await tx.checkItem.updateMany({ where: { id: item.id, voided: false }, data: { voided: true, voidReason: a.reason, approvalId: a.approvalId } });
    if (changed.count !== 1) throw new Error('Item changed');
    await audit(tx, c, 'voided', 'CheckItem', item.id, item, { voided: true }, a.reason);
    return { voided: true };
  }, 'check:' + a.checkId);
}

/** Computes the minimum shortfall from the check's snapshot, then closes it. waive requires an approval. */
export async function closeCheck(_: any, a: any, c: any) {
  requirePermission(c, 'canManageChecks');
  return command(c, 'closeCheck', a, async tx => {
    const check = await tx.check.findUnique({ where: { id: a.checkId }, include: { items: true } });
    if (!check || !['open', 'presented'].includes(check.status)) throw new Error('Check cannot be closed');
    const live = check.items.filter((i: any) => !i.voided);
    const qualifying = live.filter((i: any) => i.countsTowardMinimum);
    const waived = a.waive === true;
    if (waived) await consumeManagerApproval(tx, { approvalId: a.approvalId, actorId: c.session.itemId, actionType: 'waive_minimum', targetId: check.id, reason: a.reason, amount: null, entityType: 'Check', entityId: check.id });
    const shortfall = minimum({ requiredItems: check.minimumItemsRequired, qualifyingItems: qualifying.reduce((n: number, i: any) => n + i.qty, 0), cheapestCents: check.minimumUnitPriceCents, floorCents: check.minimumCentsFloor, qualifyingCents: qualifying.reduce((n: number, i: any) => n + i.qty * i.priceCents, 0), waived });
    const subtotal = live.reduce((n: number, i: any) => n + i.qty * i.priceCents, 0) + shortfall;
    const tax = Math.floor((subtotal * check.taxBps + 5000) / 10000);
    const tip = Number.isSafeInteger(a.tipCents) && a.tipCents > 0 ? a.tipCents : 0;
    const before = check;
    const changed = await tx.check.updateMany({ where: { id: check.id, status: check.status }, data: { status: 'paid', minimumShortfallCents: shortfall, subtotalCents: subtotal, taxCents: tax, tipCents: tip, totalCents: subtotal + tax + tip } });
    if (changed.count !== 1) throw new Error('Check changed');
    await tx.seatingAssignment.updateMany({ where: { id: check.seatingAssignmentId }, data: { status: 'closed' } });
    await tx.tableOccupancy.updateMany({ where: { assignmentId: check.seatingAssignmentId }, data: { occupancyKey: null } });
    await audit(tx, c, 'closed', 'Check', check.id, before, { shortfall, subtotal, tax, tip }, waived ? a.reason : '');
    return { checkId: check.id, minimumShortfallCents: shortfall, totalCents: subtotal + tax + tip };
  }, 'check:' + a.checkId);
}

export async function cancelShow(_: any, a: any, c: any) {
  requirePermission(c, 'canManageShows');
  requirePermission(c, 'canIssueRefunds');
  const settings = await c.prisma.venueSettings.findFirst();
  const first = await command(c, 'cancelShow', a, async tx => {
    const show = await tx.show.findUnique({ where: { id: a.showId } });
    if (!show || ['completed', 'settled', 'cancelled'].includes(show.status)) throw new Error('Show cannot be cancelled');
    await tx.show.update({ where: { id: show.id }, data: { status: 'cancelled' } });
    await tx.priceTier.updateMany({ where: { showId: show.id }, data: { status: 'closed' } });
    await tx.lineupSlot.updateMany({ where: { showId: show.id, status: { notIn: ['performed'] } }, data: { status: 'cancelled' } });
    const holds = await tx.inventoryHold.findMany({ where: { showId: show.id, status: 'active', order: null } });
    for (const h of holds) { await tx.inventoryHold.update({ where: { id: h.id }, data: { status: 'released' } }); await tx.priceTier.update({ where: { id: h.priceTierId }, data: { held: { decrement: h.quantity } } }); await tx.tableOccupancy.updateMany({ where: { holdId: h.id }, data: { occupancyKey: null } }); }
    await audit(tx, c, 'cancelled', 'Show', show.id, show, { status: 'cancelled' }, a.reason);
    const orders = await tx.ticketOrder.findMany({ where: { showId: show.id, status: { in: ['paid', 'partially_refunded'] } }, select: { id: true } });
    return { orderIds: orders.map((o: any) => o.id) };
  }, 'show:' + a.showId);
  let refunded = 0, failed = 0;
  for (const id of first.orderIds) {
    try { await refundOrderInternal(c, { orderId: id, reason: 'Show cancelled', idempotencyKey: `cancel:${a.showId}:${id}`, actorId: c.session.itemId, threshold: Number.MAX_SAFE_INTEGER }); refunded++; } catch { failed++; }
  }
  return { cancelled: true, refunded, failed };
}

export async function closeShow(_: any, a: any, c: any) {
  requirePermission(c, 'canManagePayouts');
  return command(c, 'closeShow', a, async tx => {
    const show = await tx.show.findUnique({ where: { id: a.showId }, include: { settlement: true, lineup: true, run: true } });
    if (!show || !['in_progress', 'completed', 'doors_open'].includes(show.status)) throw new Error('Show cannot be closed');
    if (show.settlement?.status === 'closed') throw new Error('Settlement already closed');
    if (await tx.check.count({ where: { showId: show.id, status: { in: ['open', 'presented'] } } })) throw new Error('Close all checks first');
    if (await tx.ticketOrder.count({ where: { showId: show.id, status: 'pending_payment' } }) || await tx.inventoryHold.count({ where: { showId: show.id, status: 'active' } })) throw new Error('Resolve pending payments and holds first');
    if (await tx.refund.count({ where: { order: { showId: show.id }, status: { in: ['processing', 'unknown'] } } })) throw new Error('Reconcile refunds first');
    const orders = await tx.ticketOrder.findMany({ where: { showId: show.id, status: { in: ['paid', 'partially_refunded', 'refunded'] } } });
    const refunds = await tx.refund.aggregate({ where: { order: { showId: show.id }, status: 'succeeded' }, _sum: { amount: true } });
    const checks = await tx.check.aggregate({ where: { showId: show.id, status: 'paid' }, _sum: { subtotalCents: true, minimumShortfallCents: true, tipCents: true } });
    const comps = await tx.comp.aggregate({ where: { showId: show.id }, _sum: { quantity: true } });
    const performing = show.lineup.filter((s: any) => ['confirmed', 'performed'].includes(s.status));
    for (const s of performing) await tx.lineupSlot.update({ where: { id: s.id }, data: { status: 'performed' } });
    const byComic = new Map<string, any[]>(); for (const s of performing) byComic.set(s.comedianId, [...(byComic.get(s.comedianId) || []), s]);
    let talent = 0;
    for (const [comedianId, slots] of byComic) {
      const isRun = show.run && show.run.headlinerId === comedianId && show.run.runFeeCents > 0;
      const amount = payout(slots, 0); // run fees are paid once per run through closeRun
      const p = await tx.comedianPayout.upsert({ where: { payoutKey: `${show.id}:${comedianId}` }, update: {}, create: { payoutKey: `${show.id}:${comedianId}`, comedianId, showId: show.id, amountCents: isRun ? payout(slots.map((s: any) => ({ feeCents: 0, bonusCents: s.bonusCents }))) : amount, currencyCode: 'USD', status: 'draft', method: 'check', lineupSlots: { connect: slots.map((s: any) => ({ id: s.id })) } } });
      talent += p.amountCents;
    }
    const gross = orders.reduce((n: number, o: any) => n + o.subtotalCents, 0);
    const fees = orders.reduce((n: number, o: any) => n + o.feesCents, 0);
    const discounts = orders.reduce((n: number, o: any) => n + o.discountCents, 0);
    const figures = { ticketGrossCents: gross, feesCents: fees, discountsCents: discounts, refundsCents: refunds._sum.amount || 0, compsCount: comps._sum.quantity || 0, foodBeverageGrossCents: (checks._sum.subtotalCents || 0) - (checks._sum.minimumShortfallCents || 0), minimumShortfallRevenueCents: checks._sum.minimumShortfallCents || 0, tipsCents: checks._sum.tipCents || 0, talentCostCents: talent };
    const netCents = settlement(figures);
    const data = { ...figures, netCents, currencyCode: 'USD', status: 'closed', closedById: c.session.itemId };
    const row = show.settlement ? await tx.showSettlement.update({ where: { id: show.settlement.id }, data }) : await tx.showSettlement.create({ data: { ...data, show: { connect: { id: show.id } } } });
    await tx.show.update({ where: { id: show.id }, data: { status: 'settled' } });
    if (show.runId) await tx.run.updateMany({ where: { id: show.runId, status: 'scheduled' }, data: { status: 'in_progress' } });
    await audit(tx, c, 'settled', 'Show', show.id, null, { netCents });
    return { settlementId: row.id, netCents, talentCostCents: talent };
  }, 'show:' + a.showId);
}

/** Closes a headliner run once: one run-fee payout for the headliner, per-show bonus payouts stay as closeShow made them. */
export async function closeRun(_: any, a: any, c: any) {
  requirePermission(c, 'canManagePayouts');
  return command(c, 'closeRun', a, async tx => {
    const run = await tx.run.findUnique({ where: { id: a.runId }, include: { shows: { select: { id: true, status: true } } } });
    if (!run) throw new Error('Run not found');
    const showsPerformed = run.headlinerId ? (await tx.lineupSlot.findMany({ where: { comedianId: run.headlinerId, status: 'performed', show: { runId: run.id } }, select: { showId: true }, distinct: ['showId'] })).length : 0;
    const plan = runClosePlan({ runStatus: run.status, runFeeCents: run.runFeeCents, showStatuses: run.shows.map((s: any) => s.status), headlinerPerformedShows: showsPerformed });
    if (!plan.ok) throw new Error(plan.reason);
    // Compare-and-set: only one caller moves the run to closed.
    const moved = await tx.run.updateMany({ where: { id: run.id, status: { not: 'closed' } }, data: { status: 'closed', closedAt: new Date() } });
    if (moved.count !== 1) throw new Error('Run already closed');
    let payoutId: string | null = null;
    if (plan.createPayout) {
      const key = `run:${run.id}:${run.headlinerId}`;
      const p = await tx.comedianPayout.upsert({
        where: { payoutKey: key }, update: {},
        create: { payoutKey: key, comedianId: run.headlinerId, runId: run.id, amountCents: plan.payoutCents, currencyCode: 'USD', status: 'draft', method: 'check' },
      });
      payoutId = p.id;
    }
    await audit(tx, c, 'run_closed', 'Run', run.id, { status: run.status }, { status: 'closed', payoutId, amountCents: plan.payoutCents, showsPerformed }, plan.note);
    return { runId: run.id, payoutId, amountCents: plan.payoutCents, note: plan.note };
  }, 'run:' + a.runId);
}
