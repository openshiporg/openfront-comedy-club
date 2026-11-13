import crypto from 'node:crypto';
import { audit, command, lockTransactionKey, requirePermission } from '../lib/commands';
import { showCapacity } from '../lib/capacity';
import { editable, localTime, normalizeEdit, overlaps, planProblems, planSeries, type Existing, type Pattern } from '../lib/series';
import { zonedTime } from '../lib/time';
import { cancelShowCore, refundCancelledShow } from './night';

const SOURCE_SELECT = { id: true, title: true, startsAt: true, doorsAt: true, endsAt: true, roomId: true, capacity: true, ageRestriction: true, publicNote: true, isOpenMic: true, status: true, room: { select: { capacity: true, venue: { select: { timezone: true } } } } };

async function tzOf(db: any, show: any) { return show.room?.venue?.timezone || (await db.venue.findFirst({ select: { timezone: true } }))?.timezone || 'America/Chicago'; }
async function loadSource(db: any, id: string) {
  const s = await db.show.findUnique({ where: { id: String(id || '') }, select: SOURCE_SELECT });
  if (!s || !s.startsAt || !s.roomId) throw new Error('The source show needs a room and a start time');
  if (s.status === 'cancelled') throw new Error('A cancelled show cannot be copied');
  return s;
}
async function roomShows(db: any, roomId: string, from: Date, to: Date, excludeIds: string[] = []): Promise<Existing[]> {
  const rows = await db.show.findMany({ where: { roomId, status: { not: 'cancelled' }, id: { notIn: excludeIds }, startsAt: { gte: new Date(from.getTime() - 864e5), lte: new Date(to.getTime() + 864e5) } }, select: { id: true, title: true, startsAt: true, endsAt: true } });
  return rows.filter((r: any) => r.startsAt);
}
async function plan(db: any, a: any, now = new Date(), keyPrefix = 'preview') {
  const source = await loadSource(db, a.sourceShowId);
  const tz = await tzOf(db, source);
  const pattern: Pattern = { dates: a.dates, from: a.from, count: a.count, everyDays: a.everyDays };
  const first = planSeries(source, tz, pattern, [], now, a.startTime || undefined, keyPrefix);
  const existing = await roomShows(db, source.roomId, first[0].startsAt, first[first.length - 1].startsAt);
  const rows = planSeries(source, tz, pattern, existing, now, a.startTime || undefined, keyPrefix);
  return { source, tz, rows };
}
const view = (rows: any[], tz: string) => rows.map((r) => ({ day: r.day, startsAt: r.startsAt.toISOString(), time: localTime(r.startsAt, tz), problem: r.problem }));

/** Read-only: what a series would create, with any date that cannot be created and why. */
export async function previewShowSeries(_: any, a: any, c: any) {
  requirePermission(c, 'canManageShows');
  const { source, tz, rows } = await plan(c.prisma, a);
  const tiers = await c.prisma.priceTier.count({ where: { showId: source.id } });
  const slots = a.copyLineup ? await c.prisma.lineupSlot.count({ where: { showId: source.id, status: { notIn: ['cancelled', 'declined'] } } }) : 0;
  return { title: source.title, timezone: tz, rows: view(rows, tz), problems: planProblems(rows).length, tiers, lineupSlots: slots };
}

/** All-or-nothing: if any date is in the past or the room is booked, nothing is created. A replay with the same key returns the first result. */
export async function createShowSeries(_: any, a: any, c: any) {
  requirePermission(c, 'canManageShows');
  const name = String(a.name || '').trim();
  if (name.length > 120) throw new Error('Name is too long');
  const src = await loadSource(c.prisma, a.sourceShowId);
  return command(c, 'createShowSeries', a, async tx => {
    await lockTransactionKey(tx, 'room:' + src.roomId);
    const groupKey = 'grp_' + crypto.randomBytes(8).toString('hex');
    const { source, tz, rows } = await plan(tx, a, new Date(), groupKey);
    const bad = planProblems(rows);
    if (bad.length) throw new Error(`${bad.length} date${bad.length === 1 ? '' : 's'} cannot be created: ${bad.slice(0, 3).map((r) => `${r.day} (${r.problem})`).join('; ')}`);
    const tiers = await tx.priceTier.findMany({ where: { showId: source.id } });
    const slots = a.copyLineup ? await tx.lineupSlot.findMany({ where: { showId: source.id, status: { notIn: ['cancelled', 'declined'] }, comedian: { status: { not: 'inactive' } } } }) : [];
    const group = await tx.showGroup.create({ data: { name: name || source.title, groupKey, sourceShow: { connect: { id: source.id } } } });
    const ids: string[] = [];
    for (const r of rows) {
      const cap = Math.min(source.capacity ?? source.room.capacity, source.room.capacity ?? source.capacity);
      const show = await tx.show.create({ data: { roomId: source.roomId, groupId: group.id, title: source.title, occurrenceKey: r.key, startsAt: r.startsAt, doorsAt: r.doorsAt, endsAt: r.endsAt, signupOpensAt: source.isOpenMic ? new Date(r.startsAt.getTime() - 7 * 864e5) : null, ageRestriction: source.ageRestriction, publicNote: source.publicNote, capacity: cap, status: 'draft', isOpenMic: source.isOpenMic } });
      const shift = (d: Date | null) => (d ? new Date(r.startsAt.getTime() - (source.startsAt.getTime() - d.getTime())) : null);
      for (const t of tiers) await tx.priceTier.create({ data: { showId: show.id, name: t.name, priceCents: t.priceCents, feeCents: t.feeCents, capacity: Math.min(t.capacity, cap), isTableTier: t.isTableTier, seatsPerUnit: t.seatsPerUnit, salesStartAt: shift(t.salesStartAt), salesEndAt: shift(t.salesEndAt), status: 'on_sale' } });
      for (const s of slots) await tx.lineupSlot.create({ data: { showId: show.id, comedianId: s.comedianId, role: s.role, position: s.position, setMinutes: s.setMinutes, feeCents: s.feeCents, bonusCents: 0, status: 'offered' } });
      ids.push(show.id);
    }
    await audit(tx, c, 'series_created', 'ShowGroup', group.id, null, { source: source.id, shows: ids.length, lineup: slots.length, days: rows.map((r) => r.day) }, name);
    return { groupId: group.id, created: ids.length, showIds: ids, timezone: tz };
  });
}

async function inScope(db: any, groupId: string, now: Date) {
  const group = await db.showGroup.findUnique({ where: { id: String(groupId || '') }, include: { shows: { select: { id: true, title: true, startsAt: true, doorsAt: true, endsAt: true, status: true, roomId: true, capacity: true, room: { select: { capacity: true, venue: { select: { timezone: true } } } } }, orderBy: { startsAt: 'asc' } } } });
  if (!group) throw new Error('Series not found');
  const live = group.shows.filter((s: any) => editable(s, now));
  return { group, live, skipped: group.shows.length - live.length };
}

/** Edits every future show in the series together; any show that cannot take the change refuses all of them. */
export async function editShowSeries(_: any, a: any, c: any) {
  requirePermission(c, 'canManageShows');
  const edit = normalizeEdit(a.edit || {});
  return command(c, 'editShowSeries', a, async tx => {
    await lockTransactionKey(tx, 'group:' + a.groupId);
    const now = new Date();
    const { group, live, skipped } = await inScope(tx, a.groupId, now);
    if (group.cancelRequestedAt && !group.cancelCompletedAt) throw new Error('This series is being cancelled');
    if (!live.length) throw new Error('No future shows in this series');
    const roomId = live[0].roomId;
    if (roomId) await lockTransactionKey(tx, 'room:' + roomId);
    const ids = live.map((s: any) => s.id);
    const seats = await tx.priceTier.groupBy({ by: ['showId'], where: { showId: { in: ids } }, _sum: { sold: true, held: true } });
    const taken = new Map<string, number>(seats.map((g: any) => [g.showId, (g._sum.sold || 0) + (g._sum.held || 0)]));
    const tickets = await tx.ticket.groupBy({ by: ['showId'], where: { showId: { in: ids }, status: { not: 'void' } }, _count: { _all: true } });
    const hasTickets = new Set<string>(tickets.map((t: any) => t.showId));
    const changes: Record<string, any> = {};
    for (const s of live) {
      const data: any = {};
      if (edit.title !== undefined) data.title = edit.title;
      if (edit.publicNote !== undefined) data.publicNote = edit.publicNote;
      if (edit.ageRestriction !== undefined && edit.ageRestriction !== s.ageRestriction) {
        if (hasTickets.has(s.id) || (taken.get(s.id) || 0) > 0) throw new Error(`${s.title}: the age rule cannot change once tickets are sold or held`);
        data.ageRestriction = edit.ageRestriction;
      }
      if (edit.capacity !== undefined) {
        const room = s.room?.capacity; const cap = Math.min(edit.capacity, room ?? edit.capacity);
        if (cap < (taken.get(s.id) || 0)) throw new Error(`${s.title}: ${taken.get(s.id)} seats are already sold or held`);
        if (edit.capacity > (room ?? edit.capacity)) throw new Error(`${s.title}: the room holds ${room}`);
        data.capacity = cap;
      }
      if (edit.startTime !== undefined) {
        if (hasTickets.has(s.id) || (taken.get(s.id) || 0) > 0) throw new Error(`${s.title}: the time cannot change once tickets are sold or held`);
        const tz = s.room?.venue?.timezone || 'America/Chicago';
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(s.startsAt);
        const startsAt = zonedTime(day, edit.startTime, tz);
        if (startsAt <= now) throw new Error(`${s.title}: the new time is in the past`);
        data.startsAt = startsAt; if (s.doorsAt) data.doorsAt = new Date(startsAt.getTime() - (s.startsAt.getTime() - s.doorsAt.getTime())); if (s.endsAt) data.endsAt = new Date(startsAt.getTime() + (s.endsAt.getTime() - s.startsAt.getTime()));
      }
      changes[s.id] = data;
    }
    if (edit.startTime !== undefined && roomId) {
      const moved = live.map((s: any) => ({ ...s, ...changes[s.id] }));
      const others = await roomShows(tx, roomId, moved[0].startsAt, moved[moved.length - 1].startsAt, ids);
      for (const m of moved) { const clash = others.find((o) => overlaps(m, o)); if (clash) throw new Error(`${m.title}: the room is already booked then (${clash.title})`); }
    }
    for (const s of live) await tx.show.update({ where: { id: s.id }, data: changes[s.id] });
    await audit(tx, c, 'series_edited', 'ShowGroup', group.id, null, { edit, shows: live.length, skipped });
    return { edited: live.length, skipped };
  });
}

/**
 * How far a recorded series cancellation has got. A show is done when it is cancelled and none of its orders is still waiting for a refund,
 * or when it ran anyway (completed or settled) before the cancellation reached it: those keep their orders and are reported as `ran`.
 */
export async function seriesCancelStatus(db: any, group: { id: string; cancelRequestedAt: Date | null; cancelCompletedAt: Date | null; cancelShowIds: any }) {
  const ids: string[] = Array.isArray(group.cancelShowIds) ? group.cancelShowIds : [];
  if (!group.cancelRequestedAt) return { requested: false, completed: false, total: 0, done: 0, ran: 0, refundsWaiting: 0, pending: [] as string[] };
  const shows = ids.length ? await db.show.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } }) : [];
  const owed = ids.length ? await db.ticketOrder.groupBy({ by: ['showId'], where: { showId: { in: ids }, status: { in: ['paid', 'partially_refunded'] } }, _count: { _all: true } }) : [];
  const owing = new Map<string, number>(owed.map((o: any) => [o.showId, o._count._all]));
  const ran = shows.filter((x: any) => ['completed', 'settled'].includes(x.status)).map((x: any) => x.id as string);
  const pending = ids.filter((id) => { const sh = shows.find((x: any) => x.id === id); return !!sh && !ran.includes(id) && (sh.status !== 'cancelled' || (owing.get(id) || 0) > 0); });
  const refundsWaiting = ids.filter((id) => !ran.includes(id)).reduce((n, id) => n + (owing.get(id) || 0), 0);
  return { requested: true, completed: !!group.cancelCompletedAt, total: ids.length, done: ids.length - pending.length, ran: ran.length, refundsWaiting, pending };
}

/**
 * Finishes a recorded series cancellation, working for at most `budgetMs` (at least one show). Called by the operator's screen (the Continue button);
 * every call uses the same per-show and per-order keys, so running them at once, or again after an interruption, never cancels or refunds twice.
 */
export async function advanceSeriesCancel(c: any, groupId: string, actorId: string | null, budgetMs: number) {
  const started = Date.now();
  const load = () => c.prisma.showGroup.findUnique({ where: { id: groupId }, select: { id: true, name: true, cancelRequestedAt: true, cancelCompletedAt: true, cancelReason: true, cancelShowIds: true } });
  let group = await load();
  if (!group?.cancelRequestedAt) throw new Error('No cancellation was requested for this series');
  const problems: string[] = []; let refunded = 0, failed = 0, worked = 0, last = 0;
  if (!group.cancelCompletedAt) {
    const st = await seriesCancelStatus(c.prisma, group);
    for (const showId of st.pending) {
      if (worked > 0 && Date.now() - started + last >= budgetMs) break; // never start a show we expect to outlive the budget
      const t0 = Date.now();
      try {
        const show = await c.prisma.show.findUnique({ where: { id: showId }, select: { status: true, title: true } });
        // a show whose doors opened before the cancellation reached it is left to run; it counts as ran once it closes
        if (show && ['doors_open', 'in_progress'].includes(show.status)) { problems.push(`${show.title}: already running, not cancelled`); continue; }
        const r: any = show?.status === 'cancelled'
          ? await refundCancelledShow(c, showId, group.cancelReason, actorId)
          : await cancelShowCore({ ...c, session: c.session || { itemId: actorId } }, { showId, reason: group.cancelReason, idempotencyKey: `series-cancel:${group.id}:${showId}` }, actorId);
        refunded += r.refunded; failed += r.failed; worked++;
      } catch (e: any) { problems.push(e.message); worked++; }
      last = Math.max(last, Date.now() - t0);
    }
    group = await load();
    const after = await seriesCancelStatus(c.prisma, group);
    if (after.requested && after.done === after.total && !group.cancelCompletedAt) {
      await c.prisma.$transaction(async (tx: any) => {
        await lockTransactionKey(tx, 'group:' + groupId);
        const moved = await tx.showGroup.updateMany({ where: { id: groupId, cancelCompletedAt: null }, data: { cancelCompletedAt: new Date() } });
        if (moved.count) await audit(tx, { session: { itemId: actorId } }, 'series_cancelled', 'ShowGroup', groupId, null, { shows: after.total }, group.cancelReason);
      });
      group = await load();
    }
  }
  const status = await seriesCancelStatus(c.prisma, group);
  return { ...status, refunded, failed, problems };
}

/**
 * Records the intent to cancel every future show in the series (once, audited), then starts working through them. The work continues from
 * the operator's screen or, if they close the tab, from the Continue button; the intent and the exact list of shows are stored on the series.
 */
export async function recordSeriesCancel(c: any, a: any) {
  requirePermission(c, 'canManageShows'); requirePermission(c, 'canIssueRefunds');
  const reason = String(a.reason || '').trim();
  if (!reason) throw new Error('A reason is required');
  const groupId = String(a.groupId || '');
  await command(c, 'cancelShowSeries', { ...a, reason }, async tx => {
    await lockTransactionKey(tx, 'group:' + groupId);
    const { group, live } = await inScope(tx, groupId, new Date());
    if (group.cancelRequestedAt) return { recorded: false };
    if (!live.length) throw new Error('No future shows in this series');
    await tx.showGroup.update({ where: { id: group.id }, data: { cancelRequestedAt: new Date(), cancelRequestedBy: { connect: { id: c.session.itemId } }, cancelReason: reason, cancelShowIds: live.map((s: any) => s.id), cancelCompletedAt: null } });
    await audit(tx, c, 'series_cancel_requested', 'ShowGroup', group.id, null, { shows: live.length, showIds: live.map((s: any) => s.id) }, reason);
    return { recorded: true, shows: live.length };
  }, 'group:' + groupId);
  return groupId;
}

export async function cancelShowSeries(_: any, a: any, c: any) {
  const groupId = await recordSeriesCancel(c, a);
  return advanceSeriesCancel(c, groupId, c.session.itemId, 6000);
}

/** Read-only progress for the series screen. */
export async function seriesCancelProgress(_: any, a: any, c: any) {
  requirePermission(c, 'canManageShows');
  const group = await c.prisma.showGroup.findUnique({ where: { id: String(a.groupId || '') }, select: { id: true, cancelRequestedAt: true, cancelCompletedAt: true, cancelShowIds: true, cancelReason: true } });
  if (!group) throw new Error('Series not found');
  const { pending, ...rest } = await seriesCancelStatus(c.prisma, group);
  return { ...rest, reason: group.cancelReason, requestedAt: group.cancelRequestedAt };
}
