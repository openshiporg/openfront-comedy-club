import { audit, code, hash } from '../lib/commands';
import { requirePermission } from '../lib/commands';
import { generateShowsFromTemplate } from './night';
import { ticketToken } from './checkout';
import { zonedTime } from '../lib/time';
import seedData from '../../platform/onboarding/lib/seed.json';

const ADAPTERS = new Set(['stripe', 'manual']);
const need = (ok: any, message: string) => { if (!ok) throw new Error(message); };

/** Setup-only creation boundary: natural keys make every record rerunnable and nothing is overwritten. */
export async function ensureClubOnboardingRecord(_: any, { entity, data }: { entity: string; data: any }, context: any) {
  requirePermission(context, 'canManageOnboarding');
  need(data && typeof data === 'object' && !Array.isArray(data), 'Invalid setup record');
  const db = context.prisma;
  const byName = async (model: string, where: any, create: any) => {
    const found = await db[model].findFirst({ where });
    if (found) return { id: found.id, reused: true };
    return { id: (await db[model].create({ data: create })).id, reused: false };
  };
  switch (entity) {
    case 'Venue': need(data.name && data.timezone, 'Venue needs name and timezone'); new Intl.DateTimeFormat('en', { timeZone: data.timezone });
      return byName('venue', { name: data.name }, data);
    case 'VenueSettings': { const found = await db.venueSettings.findFirst(); return found ? { id: found.id, reused: true } : { id: (await db.venueSettings.create({ data: { ...data, id: 1 } })).id, reused: false }; }
    case 'Room': { const venue = await db.venue.findFirst(); need(venue, 'Venue first'); return byName('room', { name: data.name, venueId: venue.id }, { ...data, active: true, venueId: venue.id }); }
    case 'Section': { const room = await db.room.findFirst({ where: { name: data.room } }); need(room, 'Missing room'); return byName('section', { name: data.name, roomId: room.id }, { name: data.name, sort: data.sort || 0, roomId: room.id }); }
    case 'Table': { const room = await db.room.findFirst({ where: { name: data.room } }); const section = room && await db.section.findFirst({ where: { name: data.section, roomId: room.id } }); need(section, 'Missing section');
      return byName('table', { label: data.label, sectionId: section.id }, { label: data.label, seats: data.seats, x: data.x, y: data.y, shape: data.shape, sectionId: section.id }); }
    case 'Comedian': need(data.stageName, 'Comedian needs a stage name'); return byName('comedian', { stageName: data.stageName }, data);
    case 'MenuItem': need(data.name && Number.isSafeInteger(data.priceCents) && data.priceCents >= 0, 'Invalid menu item'); return byName('menuItem', { name: data.name }, data);
    case 'PromoCode': return byName('promoCode', { code: data.code.toUpperCase() }, { ...data, code: data.code.toUpperCase() });
    case 'PaymentProvider': {
      need(ADAPTERS.has(data.adapter) && /^pp_[A-Za-z0-9_-]+$/.test(data.code), 'Setup accepts registered payment adapters only');
      return byName('paymentProvider', { code: data.code }, { name: data.name, code: data.code, isInstalled: true, createPaymentFunction: data.adapter, capturePaymentFunction: data.adapter, refundPaymentFunction: data.adapter, getPaymentStatusFunction: data.adapter, generatePaymentLinkFunction: data.adapter, handleWebhookFunction: data.adapter });
    }
    case 'ShowTemplate': {
      const room = await db.room.findFirst({ where: { name: data.room } }); need(room, 'Missing room');
      const found = await db.showTemplate.findFirst({ where: { title: data.title, roomId: room.id } });
      if (found) return { id: found.id, reused: true };
      const template = await db.showTemplate.create({ data: { title: data.title, roomId: room.id, recurrenceRule: data.recurrenceRule, startTime: data.startTime, duration: data.duration, isOpenMic: data.isOpenMic, defaultAgeRestriction: data.defaultAgeRestriction } });
      for (const tier of data.tiers) await db.priceTier.create({ data: { name: tier.name, priceCents: tier.priceCents, feeCents: tier.feeCents, capacity: tier.capacity, isTableTier: tier.isTableTier, seatsPerUnit: tier.seatsPerUnit, status: 'on_sale', templates: { connect: { id: template.id } } } });
      return { id: template.id, reused: false };
    }
    default: throw new Error('Unsupported setup record');
  }
}

const DAY_MS = 86400000;
const dayOf = (date: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const localTime = (day: string, hhmm: string, tz: string) => zonedTime(day, hhmm, tz);

export async function seedClubOperations(_: any, { template }: { template: string }, context: any) {
  requirePermission(context, 'canManageOnboarding');
  need(['full', 'minimal'].includes(template), 'Unknown setup type');
  const db = context.prisma;
  const venue = await db.venue.findFirst({ include: { rooms: true } }); need(venue, 'Venue first');
  const templates = await db.showTemplate.findMany({ include: { room: true } });
  if (await db.show.count()) return { created: 0, reused: true };
  const out: any = { generated: 0, run: 0, past: 0 };
  const from = new Date(); const limit = template === 'minimal' ? 2 : 21;
  for (const t of templates) {
    if (template === 'minimal' && t.title !== 'Tuesday Showcase') continue;
    const r: any = await generateShowsFromTemplate(null, { templateId: t.id, from: from.toISOString(), idempotencyKey: `seed:gen:${t.id}` }, context);
    out.generated += r.created;
  }
  const upcoming = await db.show.findMany({ where: { status: 'draft' }, orderBy: { startsAt: 'asc' }, include: { template: true } });
  const keep = template === 'minimal' ? upcoming.slice(0, 2) : upcoming.filter((s: any) => s.startsAt.getTime() < from.getTime() + limit * DAY_MS);
  const drop = upcoming.filter((s: any) => !keep.includes(s));
  for (const s of drop) { await db.priceTier.deleteMany({ where: { showId: s.id } }); await db.show.delete({ where: { id: s.id } }); }
  if (template === 'minimal') { await db.show.updateMany({ where: { id: { in: keep.map((s: any) => s.id) } }, data: { status: 'on_sale' } }); return out; }
  const comics = await db.comedian.findMany({ orderBy: { stageName: 'asc' } });
  const comic = (name: string) => comics.find((c: any) => c.stageName === name);
  const slot = (showId: string, c: any, role: string, position: number, minutes: number, status = 'confirmed') =>
    db.lineupSlot.create({ data: { showId, comedianId: c.id, role, position, setMinutes: minutes, feeCents: c.defaultFeeCents, bonusCents: 0, status, confirmedAt: status === 'confirmed' || status === 'performed' ? new Date() : null } });

  // Weekend headliner run: Thu 1, Fri 2, Sat 2, Sun 2 = 7 shows in the next free Thu–Sun.
  const main = venue.rooms.find((r: any) => r.name === 'Main Room')!;
  const mainTiers = (await db.showTemplate.findFirst({ where: { title: 'Friday Late Show' }, include: { defaultPriceTiers: true } }))!.defaultPriceTiers;
  const headliner = comic(seedData.run.headliner)!;
  let cursor = new Date(from.getTime() + 8 * DAY_MS);
  while (new Intl.DateTimeFormat('en-US', { timeZone: venue.timezone, weekday: 'short' }).format(cursor) !== 'Thu') cursor = new Date(cursor.getTime() + DAY_MS);
  const runDays = [[0, ['20:00']], [1, ['19:30', '21:45']], [2, ['19:30', '21:45']], [3, ['18:00', '20:00']]] as const;
  const run = await db.run.create({ data: { headlinerId: headliner.id, startAt: cursor, endAt: new Date(cursor.getTime() + 3 * DAY_MS), runFeeCents: seedData.run.runFeeCents, notes: seedData.run.title } });
  for (const [offset, times] of runDays) for (const hhmm of times) {
    const day = dayOf(new Date(cursor.getTime() + offset * DAY_MS + 12 * 3600000), venue.timezone);
    const startsAt = localTime(day, hhmm, venue.timezone);
    const show = await db.show.create({ data: { roomId: main.id, runId: run.id, title: seedData.run.title, occurrenceKey: `run:${run.id}:${day}:${hhmm}`, startsAt, doorsAt: new Date(startsAt.getTime() - 3600000), endsAt: new Date(startsAt.getTime() + 5400000), ageRestriction: '21', capacity: main.capacity, status: 'on_sale', isOpenMic: false } });
    for (const t of mainTiers) await db.priceTier.create({ data: { showId: show.id, name: t.name, priceCents: t.priceCents + 1000, feeCents: t.feeCents, capacity: t.capacity, isTableTier: t.isTableTier, seatsPerUnit: 1, status: 'on_sale' } });
    await slot(show.id, comic('Dex Ramirez')!, 'host', 1, 8); await slot(show.id, comic('Priya Venkataraman')!, 'opener', 2, 15); await slot(show.id, headliner, 'headliner', 3, 50);
    out.run++;
  }
  // Publish generated shows and give every one a lineup.
  const hosts = ['Dex Ramirez', 'Walt Hollis', 'Jun Tanaka'].map(comic); const openers = ['Bridget Salazar', 'Omar Haddad', 'Lena Kowalski', 'Theo Banks'].map(comic); const features = ['Rosa Delgado', 'Gus Pemberton', 'Nia Fontaine', 'Priya Venkataraman'].map(comic);
  let i = 0;
  for (const s of keep) {
    await db.show.update({ where: { id: s.id }, data: { status: 'on_sale' } });
    if (s.isOpenMic) { await slot(s.id, hosts[i % 3]!, 'host', 1, 10); }
    else { await slot(s.id, hosts[i % 3]!, 'host', 1, 8); await slot(s.id, openers[i % 4]!, 'opener', 2, 12); await slot(s.id, openers[(i + 1) % 4]!, 'guest_set', 3, 15); await slot(s.id, features[i % 4]!, 'feature', 4, 25); }
    i++;
  }
  // History: three past nights with paid orders, check-ins, checks, payouts and a closed settlement; one cancelled show with refunds.
  const manual = await db.paymentProvider.findFirst({ where: { code: 'pp_manual' } });
  const tz = venue.timezone;
  const tuesday = templates.find((t: any) => t.title === 'Tuesday Showcase')!;
  const tuesdayTiers = (await db.showTemplate.findUnique({ where: { id: tuesday.id }, include: { defaultPriceTiers: true } }))!.defaultPriceTiers;
  const drinks = await db.menuItem.findMany({ where: { countsTowardMinimum: true, active: true }, orderBy: { priceCents: 'asc' } });
  const food = await db.menuItem.findMany({ where: { category: 'food' }, orderBy: { priceCents: 'asc' } });
  const settingsRow = await db.venueSettings.findFirst();
  for (let n = 1; n <= 4; n++) {
    const day = dayOf(new Date(from.getTime() - n * 7 * DAY_MS + 12 * 3600000), tz);
    const startsAt = localTime(day, '20:00', tz); const cancelled = n === 4;
    const show = await db.show.create({ data: { roomId: main.id, templateId: tuesday.id, title: tuesday.title, occurrenceKey: `past:${tuesday.id}:${day}`, startsAt, doorsAt: new Date(startsAt.getTime() - 3600000), endsAt: new Date(startsAt.getTime() + 5400000), ageRestriction: '18', capacity: main.capacity, status: cancelled ? 'cancelled' : 'settled' } });
    const tiers: any[] = []; for (const t of tuesdayTiers) tiers.push(await db.priceTier.create({ data: { showId: show.id, name: t.name, priceCents: t.priceCents, feeCents: t.feeCents, capacity: t.capacity, isTableTier: t.isTableTier, seatsPerUnit: 1, status: cancelled ? 'closed' : 'on_sale' } }));
    const slots = [await slot(show.id, hosts[n % 3]!, 'host', 1, 8, cancelled ? 'cancelled' : 'performed'), await slot(show.id, openers[n % 4]!, 'opener', 2, 12, cancelled ? 'cancelled' : 'performed'), await slot(show.id, features[n % 4]!, 'feature', 3, 25, cancelled ? 'cancelled' : 'performed')];
    let ticketGross = 0, fees = 0, refunds = 0, fb = 0, shortfall = 0, tips = 0;
    const parties = [[0, 4], [1, 2], [2, 3], [0, 2], [1, 6]];
    for (let p = 0; p < parties.length; p++) {
      const [ti, size] = parties[p]; const tier = tiers[ti];
      const subtotal = tier.priceCents * size, fee = tier.feeCents * size, tax = Math.floor((subtotal * venue.taxBps + 5000) / 10000), total = subtotal + fee + tax;
      const order = await db.ticketOrder.create({ data: { orderNumber: code('CC'), email: `guest${n}${p}@example.invalid`, name: `Guest ${n}-${p + 1}`, showId: show.id, status: cancelled ? 'refunded' : 'paid', subtotalCents: subtotal, feesCents: fee, taxCents: tax, totalCents: total, source: 'online', partySize: size, ageAttested: true, secretKey: hash(code()), lines: { create: [{ tierName: tier.name, unitPriceCents: tier.priceCents, unitFeeCents: tier.feeCents, quantity: size, lineTotalCents: subtotal, taxCents: tax, priceTierId: tier.id }] } }, include: { lines: true } });
      const payment = await db.payment.create({ data: { idempotencyKey: `seed-pay:${order.id}`, amount: total, currencyCode: 'USD', status: cancelled ? 'refunded' : 'succeeded', paymentMethod: 'credit_card', providerPaymentId: `manual_${order.orderNumber}`, processedAt: startsAt, refundedAmount: cancelled ? total : 0, orderId: order.id, paymentProviderId: manual?.id } });
      if (cancelled) { await db.refund.create({ data: { idempotencyKey: `seed-refund:${order.id}`, amount: total, currencyCode: 'USD', status: 'succeeded', reason: 'Show cancelled', paymentId: payment.id, orderId: order.id, processedAt: new Date() } }); refunds += total; }
      for (let k = 0; k < size; k++) {
        const tc = code('T');
        const ticket = await db.ticket.create({ data: { orderId: order.id, showId: show.id, lineId: order.lines[0].id, ticketCode: tc, tokenHash: hash(ticketToken(tc)), holderName: order.name, status: cancelled ? 'refunded' : 'checked_in' } });
        if (!cancelled) await db.checkIn.create({ data: { ticketId: ticket.id, showId: show.id, at: new Date(startsAt.getTime() - 1800000), method: 'scan', result: 'admitted' } });
      }
      if (!cancelled) {
        await db.priceTier.update({ where: { id: tier.id }, data: { sold: { increment: size } } });
        ticketGross += subtotal; fees += fee;
        if (p < 3) { // seated tables with a closed check
          const items = [{ m: drinks[p % drinks.length], q: p === 1 ? 1 : size * 2 }, { m: food[p % food.length], q: 1 }];
          const sub = items.reduce((a, i) => a + i.m.priceCents * i.q, 0);
          const required = size * venue.drinkMinimumItems, have = items[0].q, short = Math.max(0, required - have) * drinks[0].priceCents;
          const total2 = sub + short + Math.floor(((sub + short) * venue.taxBps + 5000) / 10000);
          const seating = await db.seatingAssignment.create({ data: { showId: show.id, ticketOrderId: order.id, partySize: size, status: 'closed', seatedAt: startsAt } });
          const check = await db.check.create({ data: { showId: show.id, seatingAssignmentId: seating.id, status: 'paid', guestCount: size, minimumItemsRequired: required, minimumUnitPriceCents: drinks[0].priceCents, minimumShortfallCents: short, subtotalCents: sub + short, taxBps: venue.taxBps, taxCents: total2 - sub - short, tipCents: Math.round(sub * 0.18), totalCents: total2 + Math.round(sub * 0.18), currencyCode: 'USD' } });
          await db.payment.create({ data: { idempotencyKey: `seed-check:${check.id}`, amount: total2 + Math.round(sub * 0.18), currencyCode: 'USD', status: 'succeeded', paymentMethod: 'credit_card', providerPaymentId: `manual_check_${check.id}`, tipAmount: Math.round(sub * 0.18), processedAt: startsAt, checkId: check.id, paymentProviderId: manual?.id } });
          for (const i of items) await db.checkItem.create({ data: { checkId: check.id, menuItemId: i.m.id, name: i.m.name, priceCents: i.m.priceCents, qty: i.q, countsTowardMinimum: i.m.countsTowardMinimum } });
          fb += sub; shortfall += short; tips += Math.round(sub * 0.18);
        }
      }
    }
    if (cancelled) { await audit(db, context, 'cancelled', 'Show', show.id, null, { status: 'cancelled' }, 'Show cancelled'); continue; }
    let talent = 0;
    for (const s of slots) { const payout = await db.comedianPayout.create({ data: { payoutKey: `${show.id}:${s.comedianId}`, comedianId: s.comedianId, showId: show.id, amountCents: s.feeCents, currencyCode: 'USD', status: 'paid', paidAt: new Date(startsAt.getTime() + 3 * DAY_MS), method: 'check', reference: `CHK-${1000 + n}-${s.comedianId.slice(-4)}`, lineupSlots: { connect: [{ id: s.id }] } } }); talent += payout.amountCents; }
    const net = ticketGross + fees + fb + shortfall - talent - refunds;
    await db.showSettlement.create({ data: { show: { connect: { id: show.id } }, ticketGrossCents: ticketGross, feesCents: fees, discountsCents: 0, refundsCents: refunds, compsCount: 0, foodBeverageGrossCents: fb, minimumShortfallRevenueCents: shortfall, tipsCents: tips, talentCostCents: talent, netCents: net, currencyCode: 'USD', status: 'closed', closedById: context.session.itemId } });
    out.past++;
  }
  void settingsRow;
  const unbalanced = await db.ticketOrder.count({ where: { status: { in: ['paid', 'refunded'] }, payments: { none: {} } } });
  if (unbalanced) throw new Error('Seeded orders must each have a matching payment');
  return out;
}
