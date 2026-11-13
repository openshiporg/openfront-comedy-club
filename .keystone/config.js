"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// features/keystone/access.ts
var permissionNames, isSignedIn, permissions, rules;
var init_access = __esm({
  "features/keystone/access.ts"() {
    "use strict";
    permissionNames = ["canSeeOtherPeople", "canEditOtherPeople", "canManagePeople", "canManageRoles", "canAccessDashboard", "canManageOnboarding", "canManagePayments", "canReadPayments", "canIssueRefunds", "canReadAudit", "canManageShows", "canManageTalent", "canManageDoor", "canManageChecks", "canManagePayouts", "canManageSettings", "canManageOrders"];
    isSignedIn = ({ session }) => Boolean(session);
    permissions = Object.fromEntries(permissionNames.map((name) => [name, ({ session }) => session?.data.role?.[name] === true]));
    rules = {
      canReadPeople: ({ session }) => !session ? false : session.data.role?.canSeeOtherPeople ? true : { id: { equals: session.itemId } },
      canUpdatePeople: ({ session }) => !session ? false : session.data.role?.canEditOtherPeople ? true : { id: { equals: session.itemId } }
    };
  }
});

// features/keystone/lib/capacity.ts
function showCapacity(show) {
  const caps = [show.capacity, show.room?.capacity].filter((n) => Number.isFinite(n) && n >= 0);
  return caps.length ? Math.min(...caps) : 0;
}
var init_capacity = __esm({
  "features/keystone/lib/capacity.ts"() {
    "use strict";
  }
});

// features/keystone/utils/idempotency.ts
function normalize(value) {
  if (value === null || value === void 0) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Idempotency request contains a non-finite number");
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, normalize(entry)])
    );
  }
  throw new Error(`Unsupported idempotency request value: ${typeof value}`);
}
function canonicalIdempotencyParams(params) {
  return normalize(params);
}
function idempotencyFingerprint(params) {
  return import_node_crypto2.default.createHash("sha256").update(JSON.stringify(canonicalIdempotencyParams(params))).digest("hex");
}
function storedFingerprint(requestParams) {
  const params = requestParams && typeof requestParams === "object" ? { ...requestParams } : {};
  const recorded = typeof params._fingerprint === "string" ? params._fingerprint : null;
  delete params._fingerprint;
  const calculated = idempotencyFingerprint(params);
  if (recorded && recorded !== calculated) {
    throw new Error("Stored idempotency request fingerprint is invalid");
  }
  return calculated;
}
function assertIdempotencyRequest(attempt, request) {
  const method = request.requestMethod || "POST";
  const expectedFingerprint = idempotencyFingerprint(request.requestParams);
  if (attempt.requestMethod !== method || attempt.requestPath !== request.requestPath || storedFingerprint(attempt.requestParams) !== expectedFingerprint) {
    throw new Error("Idempotency key was already used with a different request");
  }
}
async function findIdempotencyAttempt(prisma, request) {
  const key = request.key.trim();
  if (!key) throw new Error("Idempotency key is required");
  const existing = await prisma.idempotencyKey.findUnique({ where: { idempotencyKey: key } });
  if (existing) assertIdempotencyRequest(existing, { ...request, key });
  return existing;
}
async function getOrCreateIdempotencyAttempt(prisma, request) {
  const key = request.key.trim();
  if (!key) throw new Error("Idempotency key is required");
  const normalizedParams = canonicalIdempotencyParams(request.requestParams);
  const data = {
    idempotencyKey: key,
    requestMethod: request.requestMethod || "POST",
    requestPath: request.requestPath,
    requestParams: {
      ...normalizedParams,
      _fingerprint: idempotencyFingerprint(request.requestParams)
    },
    recoveryPoint: "started",
    lockedAt: /* @__PURE__ */ new Date()
  };
  const existing = await findIdempotencyAttempt(prisma, { ...request, key });
  if (existing) return { attempt: existing, replay: true };
  try {
    const attempt = await prisma.idempotencyKey.create({ data });
    return { attempt, replay: false };
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    const raced = await prisma.idempotencyKey.findUnique({ where: { idempotencyKey: key } });
    if (!raced) throw error;
    assertIdempotencyRequest(raced, { ...request, key });
    return { attempt: raced, replay: true };
  }
}
async function updateIdempotencyAttempt(prisma, attemptId, recoveryPoint, responseBody, responseCode) {
  await prisma.idempotencyKey.update({
    where: { id: attemptId },
    data: {
      recoveryPoint,
      responseBody,
      responseCode,
      lockedAt: ["completed", "failed"].includes(recoveryPoint) ? null : /* @__PURE__ */ new Date()
    }
  });
}
var import_node_crypto2;
var init_idempotency = __esm({
  "features/keystone/utils/idempotency.ts"() {
    "use strict";
    import_node_crypto2 = __toESM(require("node:crypto"));
  }
});

// features/keystone/lib/commands.ts
function requirePermission(context, permission) {
  if (!context.session?.itemId || !permissions[permission]({ session: context.session })) throw new Error("Not authorized");
}
async function lockTransactionKey(tx, key) {
  const result = await tx.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key},0))) AS acquired`;
  if (result instanceof Error) throw result;
}
async function audit(tx, context, action, targetList, targetId, before, after, reason = "") {
  return tx.auditEvent.create({ data: { eventKey: import_node_crypto3.default.randomUUID(), actorId: context.session?.itemId || null, action, targetList, targetId, before: before ? JSON.parse(JSON.stringify(before)) : void 0, after: after ? JSON.parse(JSON.stringify(after)) : void 0, reason, requestId: import_node_crypto3.default.randomUUID() } });
}
async function command(context, name, input, operation, lockKey) {
  if (!input.idempotencyKey?.trim()) throw new Error("Idempotency key required");
  return context.prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, "command:" + input.idempotencyKey);
    if (lockKey) await lockTransactionKey(tx, lockKey);
    const { attempt, replay } = await getOrCreateIdempotencyAttempt(tx, { key: input.idempotencyKey, requestPath: name, requestParams: { ...input, actorId: context.session?.itemId || null } });
    if (replay && attempt.recoveryPoint === "completed") return attempt.responseBody;
    const result = await operation(tx);
    const value = JSON.parse(JSON.stringify(result));
    await updateIdempotencyAttempt(tx, attempt.id, "completed", value, 200);
    return value;
  }, { timeout: 2e4 });
}
function prove(record, token, field = "cartToken") {
  if (!record || !token || hash(token) !== record[field]) throw new Error("Not found");
}
async function transition(tx, context, model, id2, next, allowed) {
  const before = await tx[model].findUnique({ where: { id: id2 } });
  if (!before || !allowed[before.status]?.includes(next)) throw new Error("Invalid state transition");
  const changed = await tx[model].updateMany({ where: { id: id2, status: before.status }, data: { status: next } });
  if (changed.count !== 1) throw new Error("State changed");
  const after = await tx[model].findUnique({ where: { id: id2 } });
  await audit(tx, context, next, model, id2, before, after);
  return after;
}
var import_node_crypto3, code, hash;
var init_commands = __esm({
  "features/keystone/lib/commands.ts"() {
    "use strict";
    import_node_crypto3 = __toESM(require("node:crypto"));
    init_access();
    init_idempotency();
    code = (prefix = "") => prefix + import_node_crypto3.default.randomBytes(10).toString("hex").toUpperCase();
    hash = (token) => import_node_crypto3.default.createHash("sha256").update(token).digest("hex");
  }
});

// features/keystone/lib/saleWindow.ts
function saleState(tier, now = /* @__PURE__ */ new Date()) {
  if (tier.status === "paused") return "paused";
  if (tier.status && tier.status !== "on_sale") return "closed";
  const start = ms(tier.salesStartAt), end = ms(tier.salesEndAt), t = now.getTime();
  if (start !== null && t < start) return "scheduled";
  if (end !== null && t >= end) return "ended";
  return "open";
}
function assertValidWindow(start, end, showStartsAt) {
  if (start && Number.isNaN(start.getTime())) throw new Error("Invalid on-sale time");
  if (end && Number.isNaN(end.getTime())) throw new Error("Invalid off-sale time");
  if (start && end && end <= start) throw new Error("Off-sale must be after on-sale");
  if (end && end > showStartsAt) throw new Error("Sales cannot end after the show starts");
  if (start && start >= showStartsAt) throw new Error("Sales must start before the show");
}
var ms;
var init_saleWindow = __esm({
  "features/keystone/lib/saleWindow.ts"() {
    "use strict";
    ms = (v) => v ? new Date(v).getTime() : null;
  }
});

// features/keystone/lib/waitlist.ts
function offerExpiry(now, showStartsAt, minutes = OFFER_MINUTES) {
  const at = new Date(Math.min(now.getTime() + minutes * 6e4, showStartsAt.getTime()));
  return at.getTime() > now.getTime() ? at : null;
}
function tierFor(size, tiers, showRemaining, now) {
  if (size > showRemaining) return null;
  return [...tiers].sort((a, b) => a.priceCents - b.priceCents).find((t) => !t.isTableTier && t.status === "on_sale" && saleState({ salesStartAt: t.salesStartAt, salesEndAt: t.salesEndAt }, now) === "open" && t.sold + t.held + size <= t.capacity) || null;
}
function planOffers(entries, tiers, showRemaining, now) {
  const offers = [];
  const live = tiers.map((t) => ({ ...t }));
  let left = showRemaining;
  for (const e of [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))) {
    const t = tierFor(e.partySize, live, left, now);
    if (!t) continue;
    t.held += e.partySize;
    left -= e.partySize;
    offers.push({ entryId: e.id, tierId: t.id, quantity: e.partySize });
  }
  return offers;
}
var OFFER_MINUTES;
var init_waitlist = __esm({
  "features/keystone/lib/waitlist.ts"() {
    "use strict";
    init_saleWindow();
    OFFER_MINUTES = 120;
  }
});

// features/keystone/mutations/waitlistCore.ts
async function offerFreedSeats(tx, context, showId) {
  const now = /* @__PURE__ */ new Date();
  const synced = await tx.waitlistEntry.findMany({ where: { showId, status: "offered" }, include: { hold: true } });
  for (const e of synced) {
    const next = e.hold?.status === "converted" ? "converted" : !e.hold || ["expired", "released"].includes(e.hold.status) ? "expired" : null;
    if (!next) continue;
    const moved = await tx.waitlistEntry.updateMany({ where: { id: e.id, status: "offered" }, data: { status: next } });
    if (moved.count === 1) await audit(tx, context, next, "WaitlistEntry", e.id, { status: "offered" }, { status: next });
  }
  const show = await tx.show.findUnique({ where: { id: showId }, include: { room: true } });
  if (!show || !["on_sale", "sold_out"].includes(show.status) || show.startsAt <= now) return [];
  const tiers = await tx.priceTier.findMany({ where: { showId } });
  const totals2 = await tx.priceTier.aggregate({ where: { showId }, _sum: { sold: true, held: true } });
  const remaining = showCapacity(show) - (totals2._sum.sold || 0) - (totals2._sum.held || 0);
  if (show.status === "sold_out" && remaining > 0) await tx.show.update({ where: { id: showId }, data: { status: "on_sale" } });
  const waiting = await tx.waitlistEntry.findMany({ where: { showId, status: "waiting" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  if (!waiting.length) return [];
  const expiresAt = offerExpiry(now, show.startsAt);
  if (!expiresAt || remaining < 1) return [];
  const plan2 = planOffers(waiting.map((w) => ({ id: w.id, partySize: w.partySize, createdAt: w.createdAt })), tiers, remaining, now);
  const made = [];
  for (const o of plan2) {
    const entry = waiting.find((w) => w.id === o.entryId);
    const claimed = await tx.waitlistEntry.updateMany({ where: { id: entry.id, status: "waiting" }, data: { status: "offered", offeredAt: now, offerExpiresAt: expiresAt } });
    if (claimed.count !== 1) continue;
    const token = import_node_crypto4.default.randomBytes(32).toString("hex");
    const hold = await tx.inventoryHold.create({ data: { holdKey: code("H"), showId, priceTierId: o.tierId, quantity: o.quantity, cartToken: hash(token), status: "active", expiresAt, waitlistEntryId: entry.id } });
    await tx.priceTier.update({ where: { id: o.tierId }, data: { held: { increment: o.quantity } } });
    await audit(tx, context, "offered", "WaitlistEntry", entry.id, { status: "waiting" }, { status: "offered", holdKey: hold.holdKey, quantity: o.quantity, expiresAt });
    made.push(entry.id);
  }
  return made;
}
var import_node_crypto4;
var init_waitlistCore = __esm({
  "features/keystone/mutations/waitlistCore.ts"() {
    "use strict";
    init_capacity();
    import_node_crypto4 = __toESM(require("node:crypto"));
    init_commands();
    init_waitlist();
  }
});

// features/keystone/lib/money.ts
function cents(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Non-negative integer cents required");
  return value;
}
function basisPoints(amount, bps) {
  cents(amount);
  cents(bps);
  return Math.floor((amount * bps + 5e3) / 1e4);
}
function quote(input) {
  for (const n of [input.priceCents, input.feeCents, input.quantity, input.serviceFeeBps, input.taxBps, input.discountValue || 0]) cents(n);
  if (input.quantity < 1) throw new Error("Quantity required");
  const subtotalCents = cents(input.priceCents * input.quantity);
  const feesCents = cents(input.feeCents * input.quantity + basisPoints(subtotalCents, input.serviceFeeBps));
  const value = input.discountValue || 0;
  if (input.perOrderLimit !== void 0 && (!Number.isSafeInteger(input.perOrderLimit) || input.perOrderLimit < 1)) throw new Error("Positive promotion limit required");
  const eligibleCents = cents(input.priceCents * Math.min(input.quantity, input.perOrderLimit ?? input.quantity));
  const discountCents = Math.min(eligibleCents, input.discountType === "comp" ? eligibleCents : input.discountType === "percent_bps" ? basisPoints(eligibleCents, value) : input.discountType === "amount_cents" ? value : 0);
  const taxCents = basisPoints(subtotalCents - discountCents, input.taxBps);
  return { subtotalCents, feesCents, discountCents, taxCents, totalCents: cents(subtotalCents + feesCents - discountCents + taxCents) };
}
function minimum(input) {
  for (const n of [input.requiredItems, input.qualifyingItems, input.cheapestCents, input.floorCents || 0, input.qualifyingCents || 0]) cents(n);
  return input.waived ? 0 : Math.max(Math.max(0, input.requiredItems - input.qualifyingItems) * input.cheapestCents, Math.max(0, (input.floorCents || 0) - (input.qualifyingCents || 0)));
}
function checkBill(input) {
  const live = input.items.filter((i) => !i.voided);
  const q = live.filter((i) => i.countsTowardMinimum);
  const shortfall = minimum({ requiredItems: input.requiredItems, qualifyingItems: q.reduce((n, i) => n + i.qty, 0), cheapestCents: input.cheapestCents, floorCents: input.floorCents || 0, qualifyingCents: q.reduce((n, i) => n + i.qty * i.priceCents, 0), waived: input.waived });
  const subtotal = cents(live.reduce((n, i) => n + cents(i.qty) * cents(i.priceCents), 0) + shortfall);
  const tax = basisPoints(subtotal, input.taxBps);
  const tip = input.tipCents && Number.isSafeInteger(input.tipCents) && input.tipCents > 0 ? input.tipCents : 0;
  return { minimumShortfallCents: shortfall, subtotalCents: subtotal, taxCents: tax, tipCents: tip, totalCents: subtotal + tax + tip };
}
function payout(slots, runFeeCents = 0) {
  cents(runFeeCents);
  return cents((runFeeCents || slots.reduce((sum, s) => sum + cents(s.feeCents), 0)) + slots.reduce((sum, s) => sum + cents(s.bonusCents), 0));
}
function settlement(input) {
  Object.values(input).forEach(cents);
  return input.ticketGrossCents + input.feesCents - input.discountsCents - input.refundsCents + input.foodBeverageGrossCents + input.minimumShortfallRevenueCents - input.talentCostCents;
}
function selfRefundAllowed(startsAt, windowHours, now = /* @__PURE__ */ new Date()) {
  cents(windowHours);
  return startsAt.getTime() - now.getTime() >= windowHours * 36e5;
}
function runClosePlan(input) {
  cents(input.runFeeCents);
  if (input.runStatus === "closed") return { ok: false, reason: "Run already closed" };
  if (!input.showStatuses.length) return { ok: false, reason: "Run has no shows" };
  const open = input.showStatuses.filter((s) => !["settled", "cancelled"].includes(s)).length;
  if (open) return { ok: false, reason: `${open} show${open === 1 ? "" : "s"} in the run not settled or cancelled yet` };
  if (!Number.isInteger(input.headlinerPerformedShows) || input.headlinerPerformedShows < 0) throw new Error("Invalid performed count");
  if (input.headlinerPerformedShows === 0) return { ok: true, createPayout: false, payoutCents: 0, note: "Headliner performed none of the run shows; no run payout" };
  if (input.runFeeCents === 0) return { ok: true, createPayout: false, payoutCents: 0, note: "Run fee is zero; no run payout" };
  return { ok: true, createPayout: true, payoutCents: input.runFeeCents, note: "Run fee for the headliner" };
}
var init_money = __esm({
  "features/keystone/lib/money.ts"() {
    "use strict";
  }
});

// features/keystone/lib/groupHold.ts
function normalizeLines(input) {
  if (Array.isArray(input.lines) && input.lines.length) return input.lines.map((l) => ({ tierId: String(l.tierId), quantity: l.quantity, tableIds: l.tableIds }));
  return [{ tierId: String(input.tierId), quantity: input.quantity, tableIds: input.tableIds }];
}
function checkLines(lines) {
  if (!lines.length) throw new Error("Choose tickets");
  if (lines.length > MAX_GROUP_LINES) throw new Error(`Choose at most ${MAX_GROUP_LINES} ticket types`);
  if (new Set(lines.map((l) => l.tierId)).size !== lines.length) throw new Error("Each ticket type can appear once");
  for (const l of lines) if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new Error("Choose at least one ticket of each type");
  const total = lines.reduce((n, l) => n + l.quantity, 0);
  if (lines.length === 1 ? total > MAX_SINGLE_HOLD : total > MAX_GROUP_HOLD) throw new Error(lines.length === 1 ? "Choose 1\u201320 tickets" : `A group hold is limited to ${MAX_GROUP_HOLD} tickets`);
  return { total };
}
function checkCapacity(lines, tiers, showId, showRemaining) {
  for (const l of lines) {
    const t = tiers.find((x) => x.id === l.tierId);
    if (!t || t.showId !== showId || t.status !== "on_sale") throw new Error("Tickets unavailable");
    if (t.sold + t.held + l.quantity > t.capacity) throw new Error(`Not enough capacity in ${t.name || "that ticket type"}`);
  }
  const total = lines.reduce((n, l) => n + l.quantity, 0);
  if (total > showRemaining) throw new Error("Not enough capacity");
}
function allocate(total, weights, caps) {
  cents(total);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || sum === 0) return weights.map(() => 0);
  const out = weights.map((w, i) => Math.min(caps[i], Math.floor(total * w / sum)));
  let left = total - out.reduce((a, b) => a + b, 0);
  for (let i = out.length - 1; i >= 0 && left > 0; i--) {
    const room = Math.min(left, caps[i] - out[i]);
    out[i] += room;
    left -= room;
  }
  if (left !== 0) throw new Error("Discount could not be allocated");
  return out;
}
function quoteGroup(lines, serviceFeeBps, taxBps, promo) {
  if (!lines.length) throw new Error("Quantity required");
  if (lines.length === 1) {
    const q = quote({ ...lines[0], serviceFeeBps, taxBps, discountType: promo?.discountType, discountValue: promo?.discountValue, perOrderLimit: promo?.perOrderLimit });
    return { ...q, lines: [{ subtotalCents: q.subtotalCents, discountCents: q.discountCents, taxCents: q.taxCents }] };
  }
  for (const l of lines) {
    cents(l.priceCents);
    cents(l.feeCents);
    if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new Error("Quantity required");
  }
  const subs = lines.map((l) => l.priceCents * l.quantity);
  const subtotalCents = cents(subs.reduce((n, v) => n + v, 0));
  const feesCents = cents(lines.reduce((n, l) => n + l.feeCents * l.quantity, 0) + basisPoints(subtotalCents, serviceFeeBps));
  const units = lines.flatMap((l) => Array(l.quantity).fill(l.priceCents)).sort((a, b) => a - b);
  const limit = promo?.perOrderLimit;
  if (limit !== void 0 && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error("Positive promotion limit required");
  const eligibleCents = promo ? cents(units.slice(0, Math.min(units.length, limit ?? units.length)).reduce((a, b) => a + b, 0)) : 0;
  const value = promo?.discountValue || 0;
  cents(value);
  const discountCents = !promo ? 0 : Math.min(eligibleCents, promo.discountType === "comp" ? eligibleCents : promo.discountType === "percent_bps" ? basisPoints(eligibleCents, value) : promo.discountType === "amount_cents" ? value : 0);
  const discounts = allocate(discountCents, subs, subs);
  const taxCents = basisPoints(subtotalCents - discountCents, taxBps);
  const nets = subs.map((v, i) => v - discounts[i]);
  const taxes = allocate(taxCents, nets, nets.map(() => taxCents));
  return { subtotalCents, feesCents, discountCents, taxCents, totalCents: cents(subtotalCents + feesCents - discountCents + taxCents), lines: subs.map((v, i) => ({ subtotalCents: v, discountCents: discounts[i], taxCents: taxes[i] })) };
}
function heldByTier(hold, lines) {
  if (lines.length) return lines.map((l) => ({ tierId: l.priceTierId, quantity: l.quantity || 0 }));
  return hold.priceTierId ? [{ tierId: hold.priceTierId, quantity: hold.quantity || 0 }] : [];
}
function refundShare(totalCents, chosen, all) {
  const weight = (xs) => xs.reduce((n, x) => n + x.priceCents, 0);
  const denom = weight(all);
  if (!all.length) return 0;
  if (denom <= 0) return Math.floor(totalCents * chosen.length / all.length);
  return Math.floor(totalCents * weight(chosen) / denom);
}
var MAX_SINGLE_HOLD, MAX_GROUP_HOLD, MAX_GROUP_LINES, ticketWeight;
var init_groupHold = __esm({
  "features/keystone/lib/groupHold.ts"() {
    "use strict";
    init_money();
    MAX_SINGLE_HOLD = 20;
    MAX_GROUP_HOLD = 40;
    MAX_GROUP_LINES = 6;
    ticketWeight = (line) => !line ? 0 : (line.quantity ? Math.round(((line.lineTotalCents ?? 0) - (line.discountCents ?? 0)) * 1e3 / line.quantity) : (line.unitPriceCents ?? 0) * 1e3) + (line.unitFeeCents ?? 0) * 1e3;
  }
});

// features/keystone/lib/holds.ts
async function holdSeats(tx, hold) {
  const lines = Array.isArray(hold.lines) ? hold.lines : await tx.inventoryHoldLine.findMany({ where: { hold: { id: hold.id } } });
  return heldByTier(hold, lines.map((l) => ({ priceTierId: l.priceTierId ?? l.priceTier?.id ?? null, quantity: l.quantity })));
}
async function releaseHoldSeats(tx, hold) {
  for (const s of await holdSeats(tx, hold)) await tx.priceTier.update({ where: { id: s.tierId }, data: { held: { decrement: s.quantity } } });
}
var init_holds = __esm({
  "features/keystone/lib/holds.ts"() {
    "use strict";
    init_groupHold();
  }
});

// features/keystone/utils/managerApproval.ts
function normalizedRequest(input) {
  return canonicalIdempotencyParams({
    actionType: input.actionType,
    targetId: input.targetId,
    reason: input.reason.trim(),
    amount: input.amount ?? null
  });
}
function canRequestAction(context, actionType) {
  if (!["void_item", "void_check", "comp_tickets", "waive_minimum", "refund_payment"].includes(actionType)) return false;
  const s = { session: context.session };
  if (actionType === "refund_payment") return permissions.canIssueRefunds(s);
  if (actionType === "comp_tickets") return permissions.canManageOrders(s);
  return permissions.canManageChecks(s);
}
async function matchingManagerApproval(_root, input, context) {
  if (!context.session?.itemId || !canRequestAction(context, input.actionType)) throw new Error("Not authorized");
  const fingerprint = idempotencyFingerprint(normalizedRequest(input));
  const row = await context.prisma.managerApproval.findFirst({ where: {
    requestedById: context.session.itemId,
    actionType: input.actionType,
    targetId: input.targetId,
    requestFingerprint: fingerprint,
    status: "approved",
    expiresAt: { gt: /* @__PURE__ */ new Date() },
    approvedById: { not: context.session.itemId }
  }, select: { id: true } });
  return row;
}
async function requestManagerApproval(_root, input, context) {
  const requesterId = context.session?.itemId;
  if (!requesterId || !canRequestAction(context, input.actionType)) {
    throw new Error("Not authorized to request this manager approval");
  }
  if (!input.targetId?.trim()) throw new Error("Approval target is required");
  if (!input.reason?.trim()) throw new Error("Approval reason is required");
  const requestPayload = normalizedRequest(input);
  return context.prisma.managerApproval.create({
    data: {
      actionType: input.actionType,
      targetId: input.targetId.trim(),
      reason: input.reason.trim(),
      amount: input.amount ?? null,
      requestPayload,
      requestFingerprint: idempotencyFingerprint(requestPayload),
      status: "pending",
      requestedById: requesterId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1e3)
    }
  });
}
async function approveManagerApproval(_root, { approvalId }, context) {
  const approverId = context.session?.itemId;
  if (!approverId) throw new Error("Not authorized to approve manager actions");
  const prisma = context.prisma;
  const outcome = await prisma.$transaction(async (tx) => {
    const approval = await tx.managerApproval.findUnique({ where: { id: approvalId } });
    if (!approval) throw new Error("Manager approval request not found");
    if (!(canRequestAction(context, approval.actionType) && permissions.canManageSettings({ session: context.session }))) {
      throw new Error("Not authorized to approve this manager action");
    }
    if (approval.requestedById === approverId) {
      throw new Error("A manager cannot approve their own correction request");
    }
    if (approval.status !== "pending") throw new Error(`Manager approval is already ${approval.status}`);
    if (new Date(approval.expiresAt) <= /* @__PURE__ */ new Date()) {
      const expired = await tx.managerApproval.update({ where: { id: approval.id }, data: { status: "expired" } });
      return { expired };
    }
    const updated = await tx.managerApproval.updateMany({
      where: { id: approval.id, status: "pending", requestedById: { not: approverId } },
      data: { status: "approved", approvedById: approverId, approvedAt: /* @__PURE__ */ new Date() }
    });
    if (updated.count !== 1) throw new Error("Manager approval changed concurrently");
    return { approval: await tx.managerApproval.findUnique({ where: { id: approval.id } }) };
  }, { isolationLevel: "Serializable" });
  if (outcome.expired) throw new Error("Manager approval request has expired");
  return outcome.approval;
}
async function consumeManagerApproval(tx, input) {
  if (!input.approvalId) throw new Error("Independent manager approval is required");
  if (!input.actorId) throw new Error("Authenticated correction actor is required");
  const approval = await tx.managerApproval.findUnique({ where: { id: input.approvalId } });
  if (!approval) throw new Error("Manager approval request not found");
  const requestPayload = normalizedRequest(input);
  if (approval.requestFingerprint !== idempotencyFingerprint(approval.requestPayload || {}) || approval.requestFingerprint !== idempotencyFingerprint(requestPayload) || approval.requestedById !== input.actorId) {
    throw new Error("Manager approval does not match this correction request");
  }
  if (!approval.approvedById || approval.approvedById === input.actorId) {
    throw new Error("Correction requires approval by a different manager");
  }
  if (approval.status !== "approved") throw new Error(`Manager approval is ${approval.status}`);
  if (new Date(approval.expiresAt) <= /* @__PURE__ */ new Date()) throw new Error("Manager approval has expired");
  const consumed = await tx.managerApproval.updateMany({
    where: {
      id: approval.id,
      status: "approved",
      requestedById: input.actorId,
      approvedById: { not: input.actorId },
      expiresAt: { gt: /* @__PURE__ */ new Date() }
    },
    data: {
      status: "consumed",
      consumedAt: /* @__PURE__ */ new Date(),
      consumedEntityType: input.entityType,
      consumedEntityId: input.entityId
    }
  });
  if (consumed.count !== 1) throw new Error("Manager approval was already consumed or expired");
  return approval;
}
var init_managerApproval = __esm({
  "features/keystone/utils/managerApproval.ts"() {
    "use strict";
    init_access();
    init_idempotency();
  }
});

// features/keystone/utils/paymentState.ts
function nextPaymentStatus(current, observed) {
  if (["refunded", "partially_refunded"].includes(current)) return current;
  if (current === "succeeded") return current;
  if (observed === "succeeded") return observed;
  if (["failed", "cancelled"].includes(current)) return current;
  if (current === "authorized" && ["pending", "processing"].includes(observed)) return current;
  return observed;
}
function refundOutcome(status) {
  if (status === "succeeded" || status === "refunded") return "succeeded";
  if (status === "failed" || status === "canceled") return "failed";
  return "unknown";
}
function stripeRefundReference(id2) {
  if (id2.startsWith("pi_")) return { payment_intent: id2 };
  if (id2.startsWith("ch_")) return { charge: id2 };
  throw new Error("Stripe refund requires a payment intent or charge reference");
}
var init_paymentState = __esm({
  "features/keystone/utils/paymentState.ts"() {
    "use strict";
  }
});

// features/integrations/payment/stripe.ts
var stripe_exports = {};
__export(stripe_exports, {
  cancelPaymentFunction: () => cancelPaymentFunction,
  capturePaymentFunction: () => capturePaymentFunction,
  createPaymentFunction: () => createPaymentFunction,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction,
  getPaymentStatusFunction: () => getPaymentStatusFunction,
  handleWebhookFunction: () => handleWebhookFunction,
  refundPaymentFunction: () => refundPaymentFunction
});
async function createPaymentFunction({ order, amount, currency: currency22, idempotencyKey }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount,
      currency: currency22.toLowerCase(),
      // a check is paid with a card keyed at the table: no bank debit or Link
      ...order?.checkPaymentId ? { payment_method_types: ["card"] } : { automatic_payment_methods: { enabled: true } },
      metadata: {
        orderId: order?.id || "",
        orderNumber: order?.orderNumber || "",
        ...order?.checkPaymentId ? { checkPaymentId: order.checkPaymentId } : {}
      }
    },
    idempotencyKey ? { idempotencyKey } : void 0
  );
  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id
  };
}
async function capturePaymentFunction({ paymentId, amount, idempotencyKey }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.capture(paymentId, {
    ...amount == null ? {} : { amount_to_capture: amount }
  }, idempotencyKey ? { idempotencyKey } : void 0);
  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount_received,
    currencyCode: paymentIntent.currency.toUpperCase(),
    data: paymentIntent
  };
}
async function refundPaymentFunction({ paymentId, amount, idempotencyKey, refundId }) {
  const stripe = getStripeClient();
  const refund = refundId ? await stripe.refunds.retrieve(refundId) : await stripe.refunds.create(
    { ...stripeRefundReference(paymentId), amount, ...idempotencyKey ? { metadata: { restaurantRefundKey: idempotencyKey } } : {} },
    idempotencyKey ? { idempotencyKey } : void 0
  );
  return {
    id: refund.id,
    refundId: refund.id,
    status: refund.status,
    amount: refund.amount,
    data: refund
  };
}
async function getPaymentStatusFunction({ paymentId }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
  const refunds = [];
  let refundsComplete = true;
  for await (const refund of stripe.refunds.list({ payment_intent: paymentId, limit: 100 })) {
    if (refunds.length >= 1e3) {
      refundsComplete = false;
      break;
    }
    refunds.push(refund);
  }
  return {
    status: paymentIntent.status,
    amount: paymentIntent.status === "succeeded" ? paymentIntent.amount_received : paymentIntent.amount,
    currencyCode: paymentIntent.currency.toUpperCase(),
    refunds,
    refundsComplete,
    data: paymentIntent
  };
}
async function generatePaymentLinkFunction({ paymentId }) {
  return `https://dashboard.stripe.com/payments/${paymentId}`;
}
async function handleWebhookFunction({ event, headers, rawBody }) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("Stripe webhook secret is not configured");
  }
  const stripe = getStripeClient();
  try {
    if (!rawBody) throw new Error("Stripe webhook raw body is required");
    const stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      headers["stripe-signature"],
      webhookSecret
    );
    return {
      isValid: true,
      event: stripeEvent,
      type: stripeEvent.type,
      resource: stripeEvent.data.object
    };
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err?.message || "Unknown error"}`);
  }
}
async function cancelPaymentFunction({ paymentId, idempotencyKey }) {
  const stripe = getStripeClient();
  const current = await stripe.paymentIntents.retrieve(paymentId);
  if (current.status === "canceled") return { status: "cancelled" };
  if (current.status === "succeeded") return { status: "succeeded" };
  const cancelled = await stripe.paymentIntents.cancel(paymentId, {}, idempotencyKey ? { idempotencyKey } : void 0);
  return { status: cancelled.status === "canceled" ? "cancelled" : cancelled.status };
}
var import_stripe, getStripeClient;
var init_stripe = __esm({
  "features/integrations/payment/stripe.ts"() {
    "use strict";
    import_stripe = __toESM(require("stripe"));
    init_paymentState();
    getStripeClient = () => {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        throw new Error("Stripe secret key not configured");
      }
      return new import_stripe.default(stripeKey);
    };
  }
});

// features/integrations/payment/manual.ts
var manual_exports = {};
__export(manual_exports, {
  cancelPaymentFunction: () => cancelPaymentFunction2,
  capturePaymentFunction: () => capturePaymentFunction2,
  createPaymentFunction: () => createPaymentFunction2,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction2,
  getPaymentStatusFunction: () => getPaymentStatusFunction2,
  handleWebhookFunction: () => handleWebhookFunction2,
  refundPaymentFunction: () => refundPaymentFunction2
});
async function handleWebhookFunction2({ event, headers }) {
  return {
    isValid: true,
    event,
    type: event.type,
    resource: event.data
  };
}
async function createPaymentFunction2({ order, amount, currency: currency22 }) {
  return {
    status: "pending",
    data: {
      status: "pending",
      amount,
      currency: currency22.toLowerCase(),
      orderId: order?.id
    }
  };
}
async function capturePaymentFunction2({ paymentId, amount }) {
  return {
    status: "captured",
    amount,
    data: {
      status: "captured",
      amount,
      captured_at: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
async function refundPaymentFunction2({ paymentId, amount }) {
  return {
    status: "refunded",
    amount,
    data: {
      status: "refunded",
      amount,
      refunded_at: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
async function getPaymentStatusFunction2({ paymentId }) {
  return {
    status: "succeeded",
    data: {
      status: "succeeded"
    }
  };
}
async function generatePaymentLinkFunction2({ paymentId }) {
  return null;
}
async function cancelPaymentFunction2() {
  return { status: "cancelled" };
}
var init_manual = __esm({
  "features/integrations/payment/manual.ts"() {
    "use strict";
  }
});

// features/integrations/payment/index.ts
var paymentProviderAdapters;
var init_payment = __esm({
  "features/integrations/payment/index.ts"() {
    "use strict";
    paymentProviderAdapters = {
      stripe: () => Promise.resolve().then(() => (init_stripe(), stripe_exports)),
      manual: () => Promise.resolve().then(() => (init_manual(), manual_exports))
    };
  }
});

// features/keystone/utils/paymentProviderAdapter.ts
function paymentAdapterPayload(provider, args) {
  const projectedProvider = { id: provider.id, code: provider.code, credentials: provider.credentials || {} };
  const input = {};
  for (const key of ["cart", "order", "amount", "currency", "idempotencyKey", "paymentId", "refundId", "event", "headers", "rawBody"]) {
    if (args?.[key] !== void 0) input[key] = args[key];
  }
  for (const key of ["cart", "order"]) {
    const record = input[key];
    if (record && typeof record === "object") {
      input[key] = Object.fromEntries(["id", "orderNumber", "orderType", "currencyCode", "subtotal", "tax", "tip", "discount", "total", "customerName", "customerEmail", "email", "checkPaymentId"].filter((field) => record[field] !== void 0).map((field) => [field, record[field]]));
    }
  }
  if (input.headers && typeof input.headers === "object") {
    input.headers = Object.fromEntries(Object.entries(input.headers).filter(([key]) => key.toLowerCase() === "stripe-signature" || key.toLowerCase().startsWith("paypal-")));
  }
  return { ...input, provider: projectedProvider };
}
async function executeAdapterFunction({ provider, functionName, args }) {
  if (!ADAPTER_OPERATIONS.has(functionName)) throw new Error("Unknown payment adapter operation");
  const functionPath = provider?.[functionName];
  if (typeof functionPath !== "string") throw new Error("Payment adapter is not configured");
  const payload = paymentAdapterPayload(provider, args);
  if (/^https?:/i.test(functionPath)) {
    const endpoint2 = functionPath;
    try {
      const response = await fetch(endpoint2, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(3e4),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Payment adapter rejected request");
      return await response.json();
    } catch {
      throw new Error("External payment adapter request failed; reconcile the original attempt before retrying");
    }
  }
  if (!ADAPTERS.has(functionPath)) throw new Error("Unknown registered payment adapter");
  const adapter = await paymentProviderAdapters[functionPath]();
  const fn = adapter[functionName];
  if (typeof fn !== "function") throw new Error("Payment adapter operation is unavailable");
  try {
    return await fn(payload);
  } catch {
    throw new Error(`Payment adapter ${functionName} failed; reconcile the original attempt before retrying`);
  }
}
async function createPayment({ provider, cart, order, amount, currency: currency22, idempotencyKey }) {
  return executeAdapterFunction({
    provider,
    functionName: "createPaymentFunction",
    args: { cart, order, amount, currency: currency22, idempotencyKey }
  });
}
async function refundPayment({ provider, paymentId, amount, currency: currency22, idempotencyKey, refundId }) {
  return executeAdapterFunction({
    provider,
    functionName: "refundPaymentFunction",
    args: { paymentId, amount, currency: currency22, idempotencyKey, refundId }
  });
}
async function getPaymentStatus({ provider, paymentId }) {
  return executeAdapterFunction({
    provider,
    functionName: "getPaymentStatusFunction",
    args: { paymentId }
  });
}
async function cancelPayment({ provider, paymentId, idempotencyKey }) {
  const selector = provider.getPaymentStatusFunction;
  if (!["stripe", "manual"].includes(selector)) throw new Error("External payment adapter cancellation contract is not configured");
  return executeAdapterFunction({ provider: { ...provider, cancelPaymentFunction: selector }, functionName: "cancelPaymentFunction", args: { paymentId, idempotencyKey } });
}
var ADAPTERS, ADAPTER_OPERATIONS;
var init_paymentProviderAdapter = __esm({
  "features/keystone/utils/paymentProviderAdapter.ts"() {
    "use strict";
    init_payment();
    ADAPTERS = new Set(Object.keys(paymentProviderAdapters));
    ADAPTER_OPERATIONS = /* @__PURE__ */ new Set(["createPaymentFunction", "capturePaymentFunction", "refundPaymentFunction", "getPaymentStatusFunction", "generatePaymentLinkFunction", "handleWebhookFunction", "cancelPaymentFunction"]);
  }
});

// features/keystone/utils/checkoutProviderObservation.ts
function currencyCode(value) {
  return String(value || "").toUpperCase();
}
function assertAmount(value, expected, label) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount !== expected) {
    throw new Error(`${label} amount does not match the reserved checkout quote`);
  }
  return amount;
}
function assertCheckoutProviderObservation(observation, expectedAmount, expectedCurrencyCode) {
  if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0) {
    throw new Error("Reserved checkout amount is invalid");
  }
  const observedCurrency = currencyCode(observation?.currencyCode ?? observation?.currency);
  if (!/^[A-Z]{3}$/.test(observedCurrency) || observedCurrency !== currencyCode(expectedCurrencyCode)) {
    throw new Error("Provider currency does not match the reserved checkout quote");
  }
  const amount = assertAmount(observation?.amount, expectedAmount, "Provider");
  if (observation.status === "requires_capture") {
    if (Array.isArray(observation.refunds) && observation.refunds.length > 0) {
      throw new Error("Uncaptured checkout unexpectedly contains refund evidence");
    }
    return;
  }
  if (observation.status !== "succeeded") {
    throw new Error(`Payment not successful. Status: ${String(observation.status || "unknown")}`);
  }
  if (observation.refundsComplete !== true || !Array.isArray(observation.refunds)) {
    throw new Error("Provider refund history is incomplete; operator reconciliation required");
  }
  let refundedAmount = 0;
  for (const refund of observation.refunds) {
    if (refund.status === "failed") continue;
    if (refund.status !== "succeeded") {
      throw new Error("Provider has an unresolved refund; operator reconciliation required");
    }
    const refundCurrency = currencyCode(refund.currencyCode ?? refund.currency);
    const refundAmount = Number(refund.amount);
    if (!/^[A-Z]{3}$/.test(refundCurrency) || refundCurrency !== observedCurrency || !Number.isSafeInteger(refundAmount) || refundAmount <= 0) {
      throw new Error("Provider refund evidence has invalid amount or currency");
    }
    refundedAmount += refundAmount;
    if (!Number.isSafeInteger(refundedAmount)) {
      throw new Error("Provider refund total exceeds the supported amount range");
    }
  }
  if (amount - refundedAmount !== expectedAmount) {
    throw new Error("Provider net captured amount does not match the reserved checkout quote");
  }
}
var init_checkoutProviderObservation = __esm({
  "features/keystone/utils/checkoutProviderObservation.ts"() {
    "use strict";
  }
});

// features/keystone/mutations/checkout.ts
var checkout_exports = {};
__export(checkout_exports, {
  abandonTicketCheckout: () => abandonTicketCheckout,
  cancelMyTicketOrder: () => cancelMyTicketOrder,
  completeTicketCheckout: () => completeTicketCheckout,
  finalizePaidOrder: () => finalizePaidOrder,
  refundOrderInternal: () => refundOrderInternal,
  refundTicketOrder: () => refundTicketOrder,
  settleStalePendingCheckouts: () => settleStalePendingCheckouts,
  startTicketCheckout: () => startTicketCheckout,
  ticketOrderConfirmation: () => ticketOrderConfirmation,
  ticketToken: () => ticketToken,
  verifyAndFinalize: () => verifyAndFinalize
});
async function startTicketCheckout(_, input, context) {
  const lookup = await context.prisma.inventoryHold.findUnique({ where: { holdKey: input.holdKey } });
  prove(lookup, input.cartToken);
  const customer = input.customer || {};
  const email = String(customer.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email) || !String(customer.name || "").trim()) throw new Error("Name and email required");
  const secret25 = import_node_crypto5.default.randomBytes(24).toString("hex");
  const local = await command(context, "startTicketCheckout", { ...input, cartToken: hash(input.cartToken) }, async (tx) => {
    const hold = await tx.inventoryHold.findUnique({ where: { id: lookup.id }, include: { show: { include: { room: { include: { venue: true } } } }, lines: { include: { priceTier: true } }, priceTier: true, tables: true, redemption: { include: { promoCode: true } } } });
    prove(hold, input.cartToken);
    if (hold.status !== "active" || hold.expiresAt <= /* @__PURE__ */ new Date() || hold.show.status !== "on_sale") throw new Error("Hold expired");
    if (await tx.ticketOrder.count({ where: { hold: { id: hold.id } } })) throw new Error("Checkout already started");
    if (hold.show.ageRestriction !== "all" && input.ageAttested !== true) throw new Error("Age confirmation required");
    const venue = hold.show.room.venue;
    const promo = hold.redemption?.status === "reserved" ? hold.redemption.promoCode : null;
    const hl = hold.lines.length ? hold.lines.map((l) => ({ tier: l.priceTier, quantity: l.quantity })) : [{ tier: hold.priceTier, quantity: hold.quantity }];
    const priced = hl.map((l) => ({ priceCents: l.tier.priceCents, feeCents: l.tier.feeCents, quantity: l.quantity }));
    const q = quoteGroup(priced, venue.serviceFeeBps, venue.taxBps, promo ? { discountType: promo.discountType, discountValue: promo.value, perOrderLimit: promo.perOrderLimit } : null);
    const parts = q.lines;
    if (q.totalCents < 1) throw new Error("Payment is not required for this order; contact the venue");
    const order = await tx.ticketOrder.create({ data: {
      orderNumber: code("CC"),
      customerId: context.session?.itemId || null,
      email,
      name: String(customer.name).trim(),
      phone: String(customer.phone || ""),
      showId: hold.showId,
      status: "pending_payment",
      ...q,
      currencyCode: "USD",
      source: "online",
      partySize: hold.quantity,
      seatingRequest: String(input.seatingRequest || "").slice(0, 500),
      birthdayOrOccasion: String(input.occasion || "").slice(0, 200),
      ageAttested: input.ageAttested === true,
      secretKey: hash(secret25),
      holdId: void 0,
      hold: { connect: { id: hold.id } },
      lines: { create: hl.map((l, i) => ({ tierName: l.tier.name, unitPriceCents: l.tier.priceCents, unitFeeCents: l.tier.feeCents, quantity: l.quantity, lineTotalCents: parts[i].subtotalCents, discountCents: parts[i].discountCents, taxCents: parts[i].taxCents, currencyCode: "USD", priceTierId: l.tier.id })) }
    } });
    if (hold.redemption) await tx.promoRedemption.update({ where: { id: hold.redemption.id }, data: { orderId: order.id, amountCents: q.discountCents } });
    await audit(tx, context, "checkout_started", "TicketOrder", order.id, null, { totalCents: q.totalCents });
    return { orderId: order.id, orderNumber: order.orderNumber, totalCents: q.totalCents, currencyCode: "USD", expiresAt: hold.expiresAt };
  }, "show:" + lookup.showId);
  const provider = await providerFor(context);
  const attemptKey = hash("payment:" + local.orderId);
  let session = await context.prisma.paymentSession.findUnique({ where: { idempotencyKey: attemptKey } });
  if (!session) {
    const created = await createPayment({ provider, order: { id: local.orderId, orderNumber: local.orderNumber, currencyCode: "USD" }, amount: local.totalCents, currency: "USD", idempotencyKey: attemptKey });
    const collection = await context.prisma.paymentCollection.create({ data: { amount: local.totalCents, description: "default", order: { connect: { id: local.orderId } } } });
    session = await context.prisma.paymentSession.create({ data: { idempotencyKey: attemptKey, amount: local.totalCents, isSelected: true, isInitiated: true, paymentCollection: { connect: { id: collection.id } }, paymentProvider: { connect: { id: provider.id } }, data: { paymentIntentId: created.paymentIntentId, clientSecret: created.clientSecret, state: "ready" } } });
  }
  return { orderNumber: local.orderNumber, orderSecret: secret25, totalCents: local.totalCents, currencyCode: "USD", clientSecret: session.data?.clientSecret, publishableKey: process.env.NEXT_PUBLIC_STRIPE_KEY || "", expiresAt: local.expiresAt };
}
async function finalizePaidOrder(tx, context, orderId, provider, providerPaymentId, card = {}) {
  const order = await tx.ticketOrder.findUnique({ where: { id: orderId }, include: { hold: { include: { redemption: true } }, lines: true, paymentCollection: true, show: true } });
  if (!order) throw new Error("Order not found");
  if (order.status === "paid") return order;
  if (order.status !== "pending_payment" || !order.hold || order.hold.status !== "active") throw new Error("Order cannot be completed; operator reconciliation required");
  const soldTiers = [];
  for (const line of order.lines) {
    for (let i = 0; i < line.quantity; i++) {
      const ticketCode = code("T");
      await tx.ticket.create({ data: { orderId: order.id, showId: order.showId, lineId: line.id, ticketCode, tokenHash: hash(ticketToken(ticketCode)), holderName: order.name, status: "valid" } });
    }
    soldTiers.push(await tx.priceTier.update({ where: { id: line.priceTierId }, data: { sold: { increment: line.quantity }, held: { decrement: line.quantity } } }));
  }
  await tx.inventoryHold.update({ where: { id: order.hold.id }, data: { status: "converted" } });
  if (order.hold.redemption) {
    await tx.promoRedemption.update({ where: { id: order.hold.redemption.id }, data: { status: "committed" } });
    await tx.promoCode.update({ where: { id: order.hold.redemption.promoCodeId }, data: { usedCount: { increment: 1 } } });
  }
  await tx.payment.create({ data: { idempotencyKey: "pay:" + order.id, amount: order.totalCents, currencyCode: order.currencyCode, status: "succeeded", paymentMethod: "credit_card", cardBrand: card.brand || "", cardLast4: card.last4 || "", providerPaymentId, processedAt: /* @__PURE__ */ new Date(), orderId: order.id, paymentProviderId: provider.id, paymentCollectionId: order.paymentCollection?.id || null } });
  await tx.ticketOrder.update({ where: { id: order.id }, data: { status: "paid" } });
  const totals2 = await tx.priceTier.aggregate({ where: { showId: order.showId }, _sum: { sold: true, held: true } });
  for (const tier of soldTiers) if (tier.sold >= tier.capacity) await tx.priceTier.updateMany({ where: { id: tier.id, status: "on_sale" }, data: { status: "sold_out" } });
  if (order.show.status === "on_sale" && (totals2._sum.sold || 0) + (totals2._sum.held || 0) >= order.show.capacity) await tx.show.update({ where: { id: order.showId }, data: { status: "sold_out" } });
  await audit(tx, context, "paid", "TicketOrder", order.id, { status: "pending_payment" }, { status: "paid" });
  return order;
}
async function cardOf(provider, observed) {
  try {
    const intent = observed?.data;
    const ch = intent?.latest_charge;
    const details = (typeof ch === "object" ? ch?.payment_method_details?.card : null) || null;
    if (details) return { brand: details.brand, last4: details.last4 };
    if (typeof ch === "string" && provider?.code === "pp_stripe") {
      const { default: Stripe2 } = await import("stripe");
      const charge = await new Stripe2(String(process.env.STRIPE_SECRET_KEY)).charges.retrieve(ch);
      const d = charge.payment_method_details?.card;
      return { brand: d?.brand || void 0, last4: d?.last4 || void 0 };
    }
  } catch {
  }
  return {};
}
async function verifyAndFinalize(context, order) {
  const session = order.paymentCollection?.paymentSessions?.find((s) => s.isSelected);
  const intent = session?.data?.paymentIntentId;
  if (!intent) throw new Error("Payment not started");
  const provider = await providerFor(context);
  let observed;
  try {
    observed = await getPaymentStatus({ provider, paymentId: intent });
  } catch {
    return { status: "unknown" };
  }
  if (["canceled", "requires_payment_method"].includes(observed.status)) return { status: "failed" };
  if (observed.status !== "succeeded") return { status: "pending" };
  assertCheckoutProviderObservation(observed, order.totalCents, order.currencyCode);
  const card = await cardOf(provider, observed);
  await context.prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, "show:" + order.showId);
    await finalizePaidOrder(tx, context, order.id, provider, intent, card);
  }, { timeout: 2e4 });
  const showNow = await context.prisma.show.findUnique({ where: { id: order.showId }, select: { status: true } });
  if (showNow?.status === "cancelled") {
    try {
      await refundOrderInternal(context, { orderId: order.id, reason: "Show cancelled", idempotencyKey: `cancel:${order.showId}:${order.id}`, actorId: null, threshold: Number.MAX_SAFE_INTEGER, includeCheckedIn: true });
    } catch {
    }
  }
  return { status: "paid" };
}
async function completeTicketCheckout(_, input, context) {
  const order = await orderForProof(context, input.orderNumber, input.orderSecret);
  if (order.status === "paid") return { status: "paid", orderNumber: order.orderNumber };
  if (order.status !== "pending_payment") return { status: order.status, orderNumber: order.orderNumber };
  const result = await verifyAndFinalize(context, order);
  return { ...result, orderNumber: order.orderNumber };
}
async function abandonPending(context, order) {
  const intent = order.paymentCollection?.paymentSessions?.[0]?.data?.paymentIntentId;
  const provider = await providerFor(context);
  const observed = intent ? await getPaymentStatus({ provider, paymentId: intent }) : { status: "canceled" };
  if (observed.status === "succeeded") {
    await verifyAndFinalize(context, order);
    return "paid";
  }
  if (!["canceled", "requires_payment_method"].includes(observed.status)) return "pending";
  await context.prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, "show:" + order.showId);
    const fresh = await tx.ticketOrder.updateMany({ where: { id: order.id, status: "pending_payment" }, data: { status: "cancelled" } });
    if (fresh.count !== 1) return;
    const hold = await tx.inventoryHold.findFirst({ where: { order: { id: order.id }, status: "active" }, include: { redemption: true } });
    if (hold) {
      await tx.inventoryHold.update({ where: { id: hold.id }, data: { status: "released" } });
      await releaseHoldSeats(tx, hold);
      await tx.tableOccupancy.updateMany({ where: { holdId: hold.id }, data: { occupancyKey: null } });
      if (hold.redemption) await tx.promoRedemption.update({ where: { id: hold.redemption.id }, data: { status: "released" } });
    }
    await offerFreedSeats(tx, context, order.showId);
    await audit(tx, context, "cancelled", "TicketOrder", order.id, { status: "pending_payment" }, { status: "cancelled" }, "payment did not complete");
  });
  return "cancelled";
}
async function abandonTicketCheckout(_, input, context) {
  const order = await orderForProof(context, input.orderNumber, input.orderSecret);
  if (order.status !== "pending_payment") return { status: order.status };
  return { status: await abandonPending(context, order) };
}
async function settleStalePendingCheckouts(context, showId) {
  const orders = await context.prisma.ticketOrder.findMany({ where: { status: "pending_payment", ...showId ? { showId } : {}, hold: { expiresAt: { lt: new Date(Date.now() - 5 * 6e4) } } }, include: { paymentCollection: { include: { paymentSessions: true } } }, take: 5 });
  for (const order of orders) {
    try {
      await abandonPending(context, order);
    } catch {
    }
  }
  return orders.length;
}
async function ticketOrderConfirmation(_, input, context) {
  const order = await orderForProof(context, input.orderNumber, input.orderSecret);
  const full = await context.prisma.ticketOrder.findUnique({ where: { id: order.id }, select: { orderNumber: true, status: true, name: true, totalCents: true, subtotalCents: true, feesCents: true, taxCents: true, discountCents: true, currencyCode: true, partySize: true, show: { select: { title: true, startsAt: true, doorsAt: true, ageRestriction: true, room: { select: { name: true } } } }, lines: { select: { tierName: true, quantity: true, unitPriceCents: true, lineTotalCents: true } }, tickets: { orderBy: { createdAt: "asc" }, select: { ticketCode: true, status: true, holderName: true, transferredFromCode: true } } } });
  return { ...full, tickets: full.tickets.map((t) => ({ ...t, token: ticketToken(t.ticketCode) })) };
}
async function refundOrderInternal(context, a) {
  const live = a.includeCheckedIn ? ["valid", "checked_in"] : ["valid"];
  const prisma = context.prisma;
  const reserved = await command(context, "refundTicketOrder", { ...a }, async (tx) => {
    const order = await tx.ticketOrder.findUnique({ where: { id: a.orderId }, include: { payments: true, tickets: { include: { line: true } } } });
    if (!order || !["paid", "partially_refunded"].includes(order.status)) throw new Error("Order is not refundable");
    if (await tx.refund.count({ where: { orderId: order.id, status: { in: ["processing", "unknown"] } } })) throw new Error("A refund on this order is still being confirmed. Wait for it or retry that refund first");
    const payment = order.payments.find((p2) => ["succeeded", "partially_refunded"].includes(p2.status));
    if (!payment) throw new Error("No captured payment");
    const tickets = a.ticketIds?.length ? order.tickets.filter((t) => a.ticketIds.includes(t.id)) : order.tickets.filter((t) => live.includes(t.status));
    if (!tickets.length || tickets.some((t) => !live.includes(t.status))) throw new Error("Only valid tickets can be refunded");
    const remaining = payment.amount - payment.refundedAmount;
    const full = tickets.length === order.tickets.filter((t) => live.includes(t.status)).length;
    const kept = order.tickets.filter((t) => !order.tickets.some((x) => x.transferredFromCode === t.ticketCode));
    const price = (t) => ({ priceCents: ticketWeight(t.line) });
    const amount = a.amountCents ?? (full ? remaining : refundShare(order.totalCents, tickets.map(price), kept.map(price)));
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > remaining) throw new Error("Invalid refund amount");
    if (a.actorId && amount > a.threshold) await consumeManagerApproval(tx, { approvalId: a.approvalId, actorId: a.actorId, actionType: "refund_payment", targetId: order.id, reason: a.reason, amount, entityType: "TicketOrder", entityId: order.id });
    const refund = await tx.refund.create({ data: { idempotencyKey: "refund:" + a.idempotencyKey, amount, currencyCode: payment.currencyCode, status: "processing", reason: a.reason, paymentId: payment.id, orderId: order.id, requestedById: a.actorId } });
    return { refundId: refund.id, paymentId: payment.id, providerPaymentId: payment.providerPaymentId, providerId: payment.paymentProviderId, amount, currencyCode: payment.currencyCode, ticketIds: tickets.map((t) => t.id), showId: order.showId };
  }, "order:" + a.orderId);
  const provider = await prisma.paymentProvider.findUnique({ where: { id: reserved.providerId } });
  let result;
  let finalStatus = "unknown";
  try {
    result = await refundPayment({ provider, paymentId: reserved.providerPaymentId, amount: reserved.amount, currency: reserved.currencyCode, idempotencyKey: "refund:" + a.idempotencyKey });
    finalStatus = refundOutcome(result.status);
  } catch {
    finalStatus = "unknown";
  }
  await prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, "show:" + reserved.showId);
    const moved = await tx.refund.updateMany({ where: { id: reserved.refundId, status: { in: ["processing", "unknown"] } }, data: { status: finalStatus, providerRefundId: result?.refundId || result?.id || "", processedAt: finalStatus === "succeeded" ? /* @__PURE__ */ new Date() : null } });
    if (moved.count !== 1 || finalStatus !== "succeeded") return;
    const payment = await tx.payment.update({ where: { id: reserved.paymentId }, data: { refundedAmount: { increment: reserved.amount } } });
    const fullyRefunded = payment.refundedAmount >= payment.amount;
    await tx.payment.update({ where: { id: payment.id }, data: { status: nextPaymentStatus("succeeded", fullyRefunded ? "refunded" : "partially_refunded") === "succeeded" ? fullyRefunded ? "refunded" : "partially_refunded" : "refunded" } });
    const voided = await tx.ticket.findMany({ where: { id: { in: reserved.ticketIds }, status: { in: live } }, include: { line: true } });
    await tx.ticket.updateMany({ where: { id: { in: voided.map((t) => t.id) } }, data: { status: "refunded" } });
    const byTier = /* @__PURE__ */ new Map();
    for (const t of voided) byTier.set(t.line.priceTierId, (byTier.get(t.line.priceTierId) || 0) + 1);
    for (const [tierId, n] of byTier) {
      await tx.priceTier.update({ where: { id: tierId }, data: { sold: { decrement: n } } });
      await tx.priceTier.updateMany({ where: { id: tierId, status: "sold_out" }, data: { status: "on_sale" } });
    }
    const remainingValid = await tx.ticket.count({ where: { orderId: a.orderId, status: { in: ["valid", "checked_in"] } } });
    await tx.ticketOrder.update({ where: { id: a.orderId }, data: { status: remainingValid ? "partially_refunded" : "refunded" } });
    await tx.show.updateMany({ where: { id: reserved.showId, status: "sold_out" }, data: { status: "on_sale" } });
    await audit(tx, { session: { itemId: a.actorId } }, "refunded", "TicketOrder", a.orderId, null, { amount: reserved.amount, tickets: voided.length }, a.reason);
    await offerFreedSeats(tx, { session: { itemId: a.actorId } }, reserved.showId);
  }, { timeout: 2e4 });
  return { refundId: reserved.refundId, status: finalStatus, amountCents: reserved.amount };
}
async function refundTicketOrder(_, a, context) {
  requirePermission(context, "canIssueRefunds");
  const settings = await context.prisma.venueSettings.findFirst();
  return refundOrderInternal(context, { orderId: a.orderId, amountCents: a.amountCents, ticketIds: a.ticketIds, reason: String(a.reason || "").trim() || (() => {
    throw new Error("Reason required");
  })(), idempotencyKey: a.idempotencyKey, approvalId: a.approvalId, actorId: context.session.itemId, threshold: settings?.approvalThresholdCents ?? 1e4 });
}
async function cancelMyTicketOrder(_, a, context) {
  const order = await context.prisma.ticketOrder.findUnique({ where: { orderNumber: a.orderNumber }, include: { show: true } });
  if (!order || order.email.toLowerCase() !== String(a.email).trim().toLowerCase()) throw new Error("Order not found");
  const settings = await context.prisma.venueSettings.findFirst();
  if (!selfRefundAllowed(order.show.startsAt, settings?.refundWindowHours ?? 24)) throw new Error("The self-cancel window has closed; contact the venue");
  return refundOrderInternal(context, { orderId: order.id, reason: "Customer cancelled within window", idempotencyKey: a.idempotencyKey, actorId: null, threshold: Number.MAX_SAFE_INTEGER });
}
var import_node_crypto5, PROVIDER_CODE, ticketToken, providerFor, orderForProof;
var init_checkout = __esm({
  "features/keystone/mutations/checkout.ts"() {
    "use strict";
    init_waitlistCore();
    import_node_crypto5 = __toESM(require("node:crypto"));
    init_commands();
    init_money();
    init_groupHold();
    init_holds();
    init_managerApproval();
    init_paymentProviderAdapter();
    init_checkoutProviderObservation();
    init_paymentState();
    PROVIDER_CODE = "pp_stripe";
    ticketToken = (ticketCode) => import_node_crypto5.default.createHmac("sha256", process.env.SESSION_SECRET || "").update("ticket\0" + ticketCode).digest("hex");
    providerFor = async (context, codeValue = PROVIDER_CODE) => {
      const provider = await context.prisma.paymentProvider.findUnique({ where: { code: codeValue } });
      if (!provider?.isInstalled) throw new Error("Payment provider unavailable");
      return provider;
    };
    orderForProof = async (context, orderNumber, secret25) => {
      const order = await context.prisma.ticketOrder.findUnique({ where: { orderNumber }, include: { paymentCollection: { include: { paymentSessions: true } } } });
      prove(order, secret25, "secretKey");
      return order;
    };
  }
});

// keystone.ts
var keystone_exports = {};
__export(keystone_exports, {
  default: () => keystone_default2
});
module.exports = __toCommonJS(keystone_exports);

// features/keystone/index.ts
var import_auth = require("@keystone-6/auth");
var import_core19 = require("@keystone-6/core");
var import_config = require("dotenv/config");

// features/keystone/models/AuditEvent.ts
var import_fields3 = require("@keystone-6/core/fields");

// features/keystone/models/domainFields.ts
var import_core = require("@keystone-6/core");
var import_fields2 = require("@keystone-6/core/fields");
init_access();

// features/keystone/models/trackingFields.ts
var import_fields = require("@keystone-6/core/fields");
var trackingFields = {
  createdAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  }),
  updatedAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    db: { updatedAt: true },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  })
};

// features/keystone/models/domainFields.ts
var money = (defaultValue = 0) => (0, import_fields2.integer)({ defaultValue, validation: { min: 0 } });
var currency = () => (0, import_fields2.text)({ defaultValue: "USD", validation: { match: { regex: /^[A-Z]{3}$/, explanation: "ISO 4217 currency required" } } });
var lifecycle = (values, initial = values[0]) => (0, import_fields2.select)({ type: "enum", options: values.map((value) => ({ label: value.replaceAll("_", " "), value })), defaultValue: initial, access: { create: () => false, update: () => false } });
var choice = (values, initial = values[0]) => (0, import_fields2.select)({ type: values.some((value) => /^\d/.test(value)) ? "string" : "enum", options: values.map((value) => ({ label: value.replaceAll("_", " "), value })), defaultValue: initial });
var unique = () => (0, import_fields2.text)({ isIndexed: "unique", validation: { isRequired: true } });
var secret = () => (0, import_fields2.text)({ access: { read: () => false, create: () => false, update: () => false } });
function domainList(fields, permission, commandOnly = false, singleton = false, hooks) {
  return (0, import_core.list)({ ...hooks ? { hooks } : {}, ...singleton ? { isSingleton: true, graphql: { plural: "VenueSettingsItems" } } : {}, access: { operation: { query: permissions[permission], create: commandOnly ? () => false : permissions[permission], update: commandOnly ? () => false : permissions[permission], delete: () => false } }, fields: { ...fields, ...trackingFields } });
}

// features/keystone/models/AuditEvent.ts
var AuditEvent = domainList({
  actor: (0, import_fields3.relationship)({ ref: "User.auditEvents" }),
  action: (0, import_fields3.text)(),
  targetList: (0, import_fields3.text)(),
  targetId: (0, import_fields3.text)(),
  before: (0, import_fields3.json)(),
  after: (0, import_fields3.json)(),
  reason: (0, import_fields3.text)(),
  requestId: (0, import_fields3.text)(),
  eventKey: unique()
}, "canReadAudit", true);

// features/keystone/models/Check.ts
var import_core2 = require("@keystone-6/core");
var import_fields4 = require("@keystone-6/core/fields");
var Check = domainList({
  minimumItemsMet: (0, import_fields4.virtual)({ field: import_core2.graphql.field({ type: import_core2.graphql.Boolean, async resolve(item, _args, context) {
    const items = await context.prisma.checkItem.findMany({ where: { checkId: item.id, voided: false, countsTowardMinimum: true }, select: { qty: true } });
    return items.reduce((n, i) => n + i.qty, 0) >= Number(item.minimumItemsRequired);
  } }) }),
  show: (0, import_fields4.relationship)({ ref: "Show.checks" }),
  seatingAssignment: (0, import_fields4.relationship)({ ref: "SeatingAssignment.checks" }),
  server: (0, import_fields4.relationship)({ ref: "User.checks" }),
  status: lifecycle(["open", "presented", "paid", "voided"]),
  guestCount: (0, import_fields4.integer)({ defaultValue: 1 }),
  minimumItemsRequired: (0, import_fields4.integer)({ defaultValue: 2 }),
  minimumShortfallCents: money(),
  minimumUnitPriceCents: money(),
  minimumCentsFloor: money(),
  subtotalCents: money(),
  taxBps: (0, import_fields4.integer)({ defaultValue: 0 }),
  taxCents: money(),
  tipCents: money(),
  totalCents: money(),
  currencyCode: currency(),
  items: (0, import_fields4.relationship)({ ref: "CheckItem.check", many: true }),
  payments: (0, import_fields4.relationship)({ ref: "Payment.check", many: true })
}, "canManageChecks", true);

// features/keystone/models/CheckIn.ts
var import_fields5 = require("@keystone-6/core/fields");
var CheckIn = domainList({
  ticket: (0, import_fields5.relationship)({ ref: "Ticket.checkIns" }),
  show: (0, import_fields5.relationship)({ ref: "Show.checkIns" }),
  scannedBy: (0, import_fields5.relationship)({ ref: "User.checkIns" }),
  at: (0, import_fields5.timestamp)(),
  method: choice(["scan", "manual"]),
  result: choice(["admitted", "duplicate", "wrong_show", "void"])
}, "canManageDoor", true);

// features/keystone/models/CheckItem.ts
var import_fields6 = require("@keystone-6/core/fields");
var CheckItem = domainList({
  check: (0, import_fields6.relationship)({ ref: "Check.items" }),
  menuItem: (0, import_fields6.relationship)({ ref: "MenuItem.checkItems" }),
  name: (0, import_fields6.text)(),
  priceCents: money(),
  qty: (0, import_fields6.integer)({ defaultValue: 1 }),
  countsTowardMinimum: (0, import_fields6.checkbox)({ defaultValue: false }),
  voided: (0, import_fields6.checkbox)({ defaultValue: false }),
  voidReason: (0, import_fields6.text)(),
  approval: (0, import_fields6.relationship)({ ref: "ManagerApproval.items" })
}, "canManageChecks", true);

// features/keystone/models/Comedian.ts
var import_fields7 = require("@keystone-6/core/fields");
var Comedian = domainList({
  stageName: (0, import_fields7.text)(),
  legalName: (0, import_fields7.text)(),
  email: (0, import_fields7.text)(),
  phone: (0, import_fields7.text)(),
  bio: (0, import_fields7.text)(),
  headshot: (0, import_fields7.image)({ storage: "my_images" }),
  socials: (0, import_fields7.json)(),
  homeCity: (0, import_fields7.text)(),
  defaultFeeCents: money(),
  notes: (0, import_fields7.text)(),
  payeeDetailsOnFile: (0, import_fields7.checkbox)({ defaultValue: false }),
  status: lifecycle(["active", "inactive"]),
  slots: (0, import_fields7.relationship)({ ref: "LineupSlot.comedian", many: true }),
  runs: (0, import_fields7.relationship)({ ref: "Run.headliner", many: true }),
  signups: (0, import_fields7.relationship)({ ref: "OpenMicSignup.comedian", many: true }),
  payouts: (0, import_fields7.relationship)({ ref: "ComedianPayout.comedian", many: true })
}, "canManageTalent", false);

// features/keystone/models/ComedianPayout.ts
var import_fields8 = require("@keystone-6/core/fields");
var ComedianPayout = domainList({
  comedian: (0, import_fields8.relationship)({ ref: "Comedian.payouts" }),
  show: (0, import_fields8.relationship)({ ref: "Show.payouts" }),
  run: (0, import_fields8.relationship)({ ref: "Run.payouts" }),
  lineupSlots: (0, import_fields8.relationship)({ ref: "LineupSlot.payouts", many: true }),
  amountCents: money(),
  currencyCode: currency(),
  status: lifecycle(["draft", "approved", "paid", "void"]),
  paidAt: (0, import_fields8.timestamp)(),
  method: choice(["check", "ach", "venmo"]),
  reference: (0, import_fields8.text)(),
  payoutKey: unique()
}, "canManagePayouts", true);

// features/keystone/models/Comp.ts
var import_fields9 = require("@keystone-6/core/fields");
var Comp = domainList({
  show: (0, import_fields9.relationship)({ ref: "Show.comps" }),
  issuedBy: (0, import_fields9.relationship)({ ref: "User.issuedComps" }),
  recipientName: (0, import_fields9.text)(),
  recipientEmail: (0, import_fields9.text)(),
  quantity: (0, import_fields9.integer)({ defaultValue: 1 }),
  reason: choice(["industry", "comic_guest", "press", "service_recovery"]),
  approval: (0, import_fields9.relationship)({ ref: "ManagerApproval.comps" })
}, "canManageOrders", true);

// features/keystone/models/IdempotencyKey.ts
var import_core3 = require("@keystone-6/core");
var import_fields10 = require("@keystone-6/core/fields");
var IdempotencyKey = (0, import_core3.list)({
  access: {
    operation: {
      query: () => false,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields10.text)({
      isIndexed: "unique",
      validation: { isRequired: true }
    }),
    requestMethod: (0, import_fields10.text)({ validation: { isRequired: true } }),
    requestParams: (0, import_fields10.json)(),
    requestPath: (0, import_fields10.text)({ validation: { isRequired: true } }),
    responseCode: (0, import_fields10.integer)(),
    responseBody: (0, import_fields10.json)(),
    recoveryPoint: (0, import_fields10.text)({
      defaultValue: "started",
      validation: { isRequired: true }
    }),
    lockedAt: (0, import_fields10.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/InventoryHold.ts
var import_fields11 = require("@keystone-6/core/fields");
var InventoryHold = domainList({
  holdKey: unique(),
  show: (0, import_fields11.relationship)({ ref: "Show.holds" }),
  priceTier: (0, import_fields11.relationship)({ ref: "PriceTier.holds" }),
  quantity: (0, import_fields11.integer)({ defaultValue: 1 }),
  lines: (0, import_fields11.relationship)({ ref: "InventoryHoldLine.hold", many: true }),
  tables: (0, import_fields11.relationship)({ ref: "Table.holds", many: true }),
  status: lifecycle(["active", "converted", "released", "expired"]),
  expiresAt: (0, import_fields11.timestamp)(),
  cartToken: secret(),
  quote: (0, import_fields11.json)(),
  promo: (0, import_fields11.relationship)({ ref: "PromoCode.holds" }),
  redemption: (0, import_fields11.relationship)({ ref: "PromoRedemption.hold" }),
  order: (0, import_fields11.relationship)({ ref: "TicketOrder.hold" }),
  waitlistEntry: (0, import_fields11.relationship)({ ref: "WaitlistEntry.hold" }),
  occupancies: (0, import_fields11.relationship)({ ref: "TableOccupancy.hold", many: true })
}, "canManageOrders", true);

// features/keystone/models/InventoryHoldLine.ts
var import_fields12 = require("@keystone-6/core/fields");
var InventoryHoldLine = domainList({
  hold: (0, import_fields12.relationship)({ ref: "InventoryHold.lines" }),
  priceTier: (0, import_fields12.relationship)({ ref: "PriceTier.holdLines" }),
  quantity: (0, import_fields12.integer)({ defaultValue: 1 })
}, "canManageOrders", true);

// features/keystone/models/LineupSlot.ts
var import_fields13 = require("@keystone-6/core/fields");
var LineupSlot = domainList({
  show: (0, import_fields13.relationship)({ ref: "Show.lineup" }),
  comedian: (0, import_fields13.relationship)({ ref: "Comedian.slots" }),
  role: choice(["host", "opener", "guest_set", "feature", "headliner", "bringer"]),
  position: (0, import_fields13.integer)({ defaultValue: 0 }),
  setMinutes: (0, import_fields13.integer)({ defaultValue: 10 }),
  feeCents: money(),
  bonusCents: money(),
  status: lifecycle(["offered", "confirmed", "declined", "cancelled", "performed", "no_show"]),
  confirmedAt: (0, import_fields13.timestamp)(),
  responseTokenHash: secret(),
  responseTokenExpiresAt: (0, import_fields13.timestamp)(),
  payouts: (0, import_fields13.relationship)({ ref: "ComedianPayout.lineupSlots", many: true })
}, "canManageTalent", true);

// features/keystone/models/ManagerApproval.ts
var import_core4 = require("@keystone-6/core");
var import_fields14 = require("@keystone-6/core/fields");
init_access();
var ManagerApproval = (0, import_core4.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canManageOrders({ session }) || permissions.canManageChecks({ session }) || permissions.canIssueRefunds({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    actionType: (0, import_fields14.select)({
      type: "string",
      options: [
        { label: "Void check item", value: "void_item" },
        { label: "Void check", value: "void_check" },
        { label: "Comp tickets", value: "comp_tickets" },
        { label: "Waive minimum", value: "waive_minimum" },
        { label: "Refund payment", value: "refund_payment" }
      ],
      validation: { isRequired: true },
      isIndexed: true
    }),
    targetId: (0, import_fields14.text)({ validation: { isRequired: true }, isIndexed: true }),
    reason: (0, import_fields14.text)({ validation: { isRequired: true }, ui: { displayMode: "textarea" } }),
    amount: (0, import_fields14.integer)(),
    requestFingerprint: (0, import_fields14.text)({ validation: { isRequired: true } }),
    requestPayload: (0, import_fields14.json)(),
    status: (0, import_fields14.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Approved", value: "approved" },
        { label: "Rejected", value: "rejected" },
        { label: "Consumed", value: "consumed" },
        { label: "Expired", value: "expired" }
      ],
      defaultValue: "pending",
      validation: { isRequired: true },
      isIndexed: true
    }),
    requestedAt: (0, import_fields14.timestamp)({ defaultValue: { kind: "now" }, isIndexed: true }),
    approvedAt: (0, import_fields14.timestamp)(),
    consumedAt: (0, import_fields14.timestamp)(),
    expiresAt: (0, import_fields14.timestamp)({ validation: { isRequired: true }, isIndexed: true }),
    consumedEntityType: (0, import_fields14.text)(),
    consumedEntityId: (0, import_fields14.text)(),
    requestedBy: (0, import_fields14.relationship)({ ref: "User" }),
    approvedBy: (0, import_fields14.relationship)({ ref: "User" }),
    comps: (0, import_fields14.relationship)({ ref: "Comp.approval", many: true }),
    items: (0, import_fields14.relationship)({ ref: "CheckItem.approval", many: true }),
    ...trackingFields
  },
  ui: { isHidden: true }
});

// features/keystone/models/MenuItem.ts
var import_fields15 = require("@keystone-6/core/fields");
var MenuItem = domainList({
  name: (0, import_fields15.text)(),
  category: choice(["drink", "food", "na"]),
  priceCents: money(),
  countsTowardMinimum: (0, import_fields15.checkbox)({ defaultValue: false }),
  active: (0, import_fields15.checkbox)({ defaultValue: false }),
  image: (0, import_fields15.image)({ storage: "my_images" }),
  checkItems: (0, import_fields15.relationship)({ ref: "CheckItem.menuItem", many: true })
}, "canManageChecks", false);

// features/keystone/models/OAuthApp.ts
var import_core5 = require("@keystone-6/core");
var import_fields16 = require("@keystone-6/core/fields");
init_access();

// features/keystone/mcp-oauth/core.ts
var import_node_crypto = __toESM(require("node:crypto"));
var MCP_SCOPES = ["mcp:read", "mcp:write"];
var MCP_ACCESS_PREFIX = "mcp_at_";
var ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
var REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
var AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1e3;
var CONSENT_TICKET_TTL_MS = 10 * 60 * 1e3;
var DEVELOPMENT_SECRET = "this secret should only be used in testing";
function secret10() {
  return process.env.SESSION_SECRET || DEVELOPMENT_SECRET;
}
function randomToken(prefix, bytes = 32) {
  return `${prefix}${import_node_crypto.default.randomBytes(bytes).toString("base64url")}`;
}
function digestToken(token, purpose = "mcp-oauth-token") {
  return import_node_crypto.default.createHmac("sha256", secret10()).update(`${purpose}\0${token}`, "utf8").digest("hex");
}
function bearerToken(header) {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(value);
  return match ? match[1] : null;
}
function isMcpAccessToken(token) {
  return typeof token === "string" && token.startsWith(MCP_ACCESS_PREFIX) && token.length > MCP_ACCESS_PREFIX.length;
}
function storedScopes(value) {
  return Array.isArray(value) ? MCP_SCOPES.filter((scope) => value.includes(scope)) : [];
}

// features/keystone/models/OAuthApp.ts
var OAuthApp = (0, import_core5.list)({
  access: {
    operation: {
      query: permissions.canManagePeople,
      create: permissions.canManagePeople,
      update: permissions.canManagePeople,
      delete: permissions.canManagePeople
    }
  },
  fields: {
    name: (0, import_fields16.text)({
      validation: {
        isRequired: true
      }
    }),
    clientId: (0, import_fields16.text)({
      isIndexed: "unique",
      hooks: {
        resolveInput: ({ operation, resolvedData }) => {
          if (operation === "create" && !resolvedData.clientId) {
            return randomToken("mcp_cl_", 18);
          }
          return resolvedData.clientId;
        }
      },
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" },
        description: "Auto-generated unique identifier for your application."
      }
    }),
    clientSecret: (0, import_fields16.text)({
      access: {
        read: () => false
      },
      hooks: {
        resolveInput: ({ resolvedData }) => {
          if (resolvedData.clientSecret) {
            return digestToken(resolvedData.clientSecret, "oauth-client-secret");
          }
          return void 0;
        }
      },
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "hidden" },
        description: "Stored only as a digest. Public MCP clients have no secret."
      }
    }),
    tokenEndpointAuthMethod: (0, import_fields16.select)({
      options: [
        { label: "Client secret (POST)", value: "client_secret_post" },
        { label: "Client secret (Basic)", value: "client_secret_basic" },
        { label: "None (public PKCE client)", value: "none" }
      ],
      defaultValue: "client_secret_post",
      ui: {
        description: "How the app authenticates at the token endpoint. MCP clients are public (none)."
      }
    }),
    redirectUris: (0, import_fields16.json)({
      defaultValue: [],
      ui: {
        description: "Array of allowed redirect URIs for OAuth callbacks"
      }
    }),
    scopes: (0, import_fields16.json)({
      defaultValue: [...MCP_SCOPES],
      ui: {
        description: "Array of allowed OAuth scopes. MCP scopes only narrow the signed-in user's own access."
      }
    }),
    webhookUrl: (0, import_fields16.text)({
      ui: {
        description: "URL to receive webhook notifications"
      }
    }),
    status: (0, import_fields16.select)({
      options: [
        { label: "Active", value: "active" },
        { label: "Suspended", value: "suspended" },
        { label: "Pending", value: "pending" }
      ],
      defaultValue: "active"
    }),
    installUrl: (0, import_fields16.text)({
      ui: {
        description: "URL where users can install this app"
      }
    }),
    uninstallUrl: (0, import_fields16.text)({
      ui: {
        description: "URL to handle app uninstallation"
      }
    }),
    description: (0, import_fields16.text)({
      ui: {
        displayMode: "textarea"
      }
    }),
    metadata: (0, import_fields16.json)({
      defaultValue: {},
      ui: {
        description: "Additional app-specific configuration and settings"
      }
    }),
    developerEmail: (0, import_fields16.text)(),
    privacyPolicyUrl: (0, import_fields16.text)(),
    termsOfServiceUrl: (0, import_fields16.text)(),
    supportUrl: (0, import_fields16.text)(),
    ...trackingFields
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "clientId", "status", "createdAt"]
    }
  }
});

// features/keystone/models/OAuthToken.ts
var import_core7 = require("@keystone-6/core");
var import_fields17 = require("@keystone-6/core/fields");
init_access();
var digestTokenInput = {
  resolveInput: ({ resolvedData, fieldKey }) => resolvedData[fieldKey] ? digestToken(resolvedData[fieldKey]) : resolvedData[fieldKey]
};
var OAuthToken = (0, import_core7.list)({
  access: {
    operation: {
      query: permissions.canManagePeople,
      create: permissions.canManagePeople,
      update: permissions.canManagePeople,
      delete: permissions.canManagePeople
    }
  },
  fields: {
    tokenType: (0, import_fields17.select)({
      options: [
        { label: "Authorization Code", value: "authorization_code" },
        { label: "Access Token", value: "access_token" },
        { label: "Refresh Token", value: "refresh_token" }
      ],
      validation: {
        isRequired: true
      }
    }),
    token: (0, import_fields17.text)({
      access: { read: () => false },
      validation: {
        isRequired: true
      },
      isIndexed: "unique",
      hooks: digestTokenInput
    }),
    clientId: (0, import_fields17.text)({
      validation: {
        isRequired: true
      },
      isIndexed: true
    }),
    user: (0, import_fields17.relationship)({
      ref: "User",
      ui: {
        description: "The user who authorized this token"
      }
    }),
    scopes: (0, import_fields17.json)({
      defaultValue: [],
      ui: {
        description: "Array of granted scopes"
      }
    }),
    redirectUri: (0, import_fields17.text)({
      ui: {
        description: "The redirect URI used during authorization"
      }
    }),
    resource: (0, import_fields17.text)({
      ui: {
        description: "The MCP endpoint (RFC 8707 resource) this grant is for"
      }
    }),
    expiresAt: (0, import_fields17.timestamp)({
      ui: {
        description: "When this token expires"
      }
    }),
    isRevoked: (0, import_fields17.select)({
      options: [
        { label: "Active", value: "false" },
        { label: "Revoked", value: "true" }
      ],
      defaultValue: "false"
    }),
    authorizationCode: (0, import_fields17.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "The authorization code that was exchanged for this token (for access tokens)"
      }
    }),
    refreshToken: (0, import_fields17.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "Associated refresh token (for access tokens)"
      }
    }),
    accessToken: (0, import_fields17.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "Associated access token (for refresh tokens)"
      }
    }),
    state: (0, import_fields17.text)({
      ui: {
        description: "OAuth state parameter for CSRF protection"
      }
    }),
    codeChallenge: (0, import_fields17.text)({
      ui: {
        description: "PKCE code challenge"
      }
    }),
    codeChallengeMethod: (0, import_fields17.select)({
      options: [
        { label: "Plain", value: "plain" },
        { label: "SHA256", value: "S256" }
      ],
      ui: {
        description: "PKCE code challenge method"
      }
    }),
    ...trackingFields
  },
  ui: {
    labelField: "clientId",
    listView: {
      initialColumns: ["tokenType", "clientId", "user", "scopes", "expiresAt", "isRevoked"]
    }
  }
});

// features/keystone/models/OpenMicSignup.ts
var import_fields18 = require("@keystone-6/core/fields");
var OpenMicSignup = domainList({
  signupKey: unique(),
  show: (0, import_fields18.relationship)({ ref: "Show.signups" }),
  comedian: (0, import_fields18.relationship)({ ref: "Comedian.signups" }),
  name: (0, import_fields18.text)(),
  email: (0, import_fields18.text)(),
  method: choice(["online_list", "bucket", "bringer"]),
  lotteryNumber: (0, import_fields18.integer)({ defaultValue: 0 }),
  status: lifecycle(["waiting", "called", "performed", "skipped", "withdrawn"]),
  bringerGuestsRequired: (0, import_fields18.integer)({ defaultValue: 0 }),
  bringerGuestsArrived: (0, import_fields18.integer)({ defaultValue: 0 })
}, "canManageTalent", true);

// features/keystone/models/Payment.ts
var import_core9 = require("@keystone-6/core");
var import_fields19 = require("@keystone-6/core/fields");
init_access();
var Payment = (0, import_core9.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadPayments({ session }) || permissions.canManagePayments({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  ui: {
    listView: {
      initialColumns: ["amount", "status", "paymentMethod", "order", "createdAt"]
    }
  },
  fields: {
    idempotencyKey: (0, import_fields19.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    reservedAt: (0, import_fields19.timestamp)(),
    refundedAmount: (0, import_fields19.integer)({ defaultValue: 0, validation: { min: 0 } }),
    amount: (0, import_fields19.integer)({
      validation: { isRequired: true },
      ui: {
        description: "Payment amount in cents"
      }
    }),
    data: (0, import_fields19.json)({
      ui: {
        description: "Payment provider data (clientSecret, paymentIntentId, orderId, etc.)"
      }
    }),
    currencyCode: (0, import_fields19.text)({
      defaultValue: "USD",
      ui: { description: "ISO 4217 currency code for this payment" }
    }),
    status: (0, import_fields19.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Processing", value: "processing" },
        { label: "Authorized", value: "authorized" },
        { label: "Unknown", value: "unknown" },
        { label: "Succeeded", value: "succeeded" },
        { label: "Failed", value: "failed" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Refunded", value: "refunded" },
        { label: "Partially Refunded", value: "partially_refunded" }
      ],
      defaultValue: "pending",
      validation: { isRequired: true }
    }),
    paymentMethod: (0, import_fields19.select)({
      type: "string",
      options: [
        { label: "Credit Card", value: "credit_card" },
        { label: "Debit Card", value: "debit_card" },
        { label: "Cash", value: "cash" },
        { label: "Gift Card", value: "gift_card" },
        { label: "PayPal", value: "paypal" },
        { label: "Apple Pay", value: "apple_pay" },
        { label: "Google Pay", value: "google_pay" }
      ],
      defaultValue: "credit_card"
    }),
    paymentProvider: (0, import_fields19.relationship)({
      ref: "PaymentProvider",
      ui: {
        displayMode: "select",
        description: "Optional provider backing this payment"
      }
    }),
    providerPaymentId: (0, import_fields19.text)({
      ui: {
        description: "Provider payment identifier (Stripe/PayPal/etc.)"
      }
    }),
    // Card details (last 4 digits for reference)
    cardLast4: (0, import_fields19.text)({
      ui: {
        description: "Last 4 digits of card"
      }
    }),
    cardBrand: (0, import_fields19.text)({
      ui: {
        description: "Card brand (visa, mastercard, etc.)"
      }
    }),
    // Tip handling
    tipAmount: (0, import_fields19.integer)({
      defaultValue: 0,
      ui: {
        description: "Tip amount included in payment in cents"
      }
    }),
    // Split payment support
    isSplitPayment: (0, import_fields19.checkbox)({
      defaultValue: false,
      ui: {
        description: "Whether this payment is part of a split bill"
      }
    }),
    splitPaymentIndex: (0, import_fields19.integer)({
      ui: {
        description: "Index of this payment in split (1, 2, 3, etc.)"
      }
    }),
    splitTotal: (0, import_fields19.integer)({
      ui: {
        description: "Total number of split payments for this order"
      }
    }),
    processedAt: (0, import_fields19.timestamp)({
      ui: {
        description: "When payment was successfully processed"
      }
    }),
    // Metadata for errors or additional info
    errorMessage: (0, import_fields19.text)({
      ui: {
        description: "Error message if payment failed"
      }
    }),
    notes: (0, import_fields19.text)({
      ui: {
        displayMode: "textarea",
        description: "Internal notes about this payment"
      }
    }),
    // Relationships
    order: (0, import_fields19.relationship)({
      ref: "TicketOrder.payments",
      ui: {
        displayMode: "select"
      }
    }),
    paymentCollection: (0, import_fields19.relationship)({
      ref: "PaymentCollection.payments",
      ui: {
        displayMode: "select",
        description: "Payment collection this payment belongs to"
      }
    }),
    check: (0, import_fields19.relationship)({ ref: "Check.payments" }),
    processedBy: (0, import_fields19.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        description: "Staff member who processed payment"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentCollection.ts
var import_core10 = require("@keystone-6/core");
var import_fields20 = require("@keystone-6/core/fields");
init_access();
var PaymentCollection = (0, import_core10.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canManageOrders({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    description: (0, import_fields20.select)({
      type: "enum",
      options: [
        { label: "Default", value: "default" },
        { label: "Refund", value: "refund" }
      ],
      defaultValue: "default"
    }),
    amount: (0, import_fields20.integer)({
      validation: { isRequired: true }
    }),
    authorizedAmount: (0, import_fields20.integer)({
      defaultValue: 0
    }),
    refundedAmount: (0, import_fields20.integer)({
      defaultValue: 0
    }),
    metadata: (0, import_fields20.json)(),
    paymentSessions: (0, import_fields20.relationship)({
      ref: "PaymentSession.paymentCollection",
      many: true
    }),
    payments: (0, import_fields20.relationship)({
      ref: "Payment.paymentCollection",
      many: true
    }),
    order: (0, import_fields20.relationship)({
      ref: "TicketOrder.paymentCollection"
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentProvider.ts
var import_core11 = require("@keystone-6/core");
var import_fields21 = require("@keystone-6/core/fields");
init_access();
var canConfigureProvider = (args) => isSignedIn(args) && permissions.canManagePayments(args);
var PaymentProvider = (0, import_core11.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadPayments({ session }) || permissions.canManagePayments({ session }),
      create: canConfigureProvider,
      update: canConfigureProvider,
      delete: canConfigureProvider
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "code", "isInstalled"]
    }
  },
  fields: {
    name: (0, import_fields21.text)({
      validation: { isRequired: true }
    }),
    code: (0, import_fields21.text)({
      isIndexed: "unique",
      validation: {
        isRequired: true,
        match: {
          regex: /^pp_[a-zA-Z0-9-_]+$/,
          explanation: 'Payment provider code must start with "pp_" followed by alphanumeric characters, hyphens or underscores'
        }
      }
    }),
    isInstalled: (0, import_fields21.checkbox)({
      defaultValue: true
    }),
    credentials: (0, import_fields21.json)({
      access: { read: () => false, create: canConfigureProvider, update: canConfigureProvider },
      defaultValue: {}
    }),
    metadata: (0, import_fields21.json)({
      defaultValue: {}
    }),
    createPaymentFunction: (0, import_fields21.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to create payments"
      }
    }),
    capturePaymentFunction: (0, import_fields21.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to capture payments"
      }
    }),
    refundPaymentFunction: (0, import_fields21.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to refund payments"
      }
    }),
    getPaymentStatusFunction: (0, import_fields21.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to check payment status"
      }
    }),
    generatePaymentLinkFunction: (0, import_fields21.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to generate payment dashboard links"
      }
    }),
    handleWebhookFunction: (0, import_fields21.text)({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to handle provider webhooks"
      }
    }),
    sessions: (0, import_fields21.relationship)({
      ref: "PaymentSession.paymentProvider",
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentSession.ts
var import_core12 = require("@keystone-6/core");
var import_fields22 = require("@keystone-6/core/fields");
init_access();
var PaymentSession = (0, import_core12.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canManageOrders({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    isSelected: (0, import_fields22.checkbox)({
      defaultValue: false
    }),
    isInitiated: (0, import_fields22.checkbox)({
      defaultValue: false
    }),
    amount: (0, import_fields22.integer)({
      validation: { isRequired: true }
    }),
    data: (0, import_fields22.json)({
      defaultValue: {}
    }),
    idempotencyKey: (0, import_fields22.text)({
      validation: { isRequired: true },
      isIndexed: "unique"
    }),
    paymentCollection: (0, import_fields22.relationship)({
      ref: "PaymentCollection.paymentSessions"
    }),
    paymentProvider: (0, import_fields22.relationship)({
      ref: "PaymentProvider.sessions",
      many: false
    }),
    paymentAuthorizedAt: (0, import_fields22.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/PaymentWebhookEvent.ts
var import_core13 = require("@keystone-6/core");
var import_fields23 = require("@keystone-6/core/fields");
init_access();
var PaymentWebhookEvent = (0, import_core13.list)({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    eventKey: (0, import_fields23.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    providerCode: (0, import_fields23.text)({ validation: { isRequired: true }, isIndexed: true }),
    providerEventId: (0, import_fields23.text)({ isIndexed: true }),
    eventType: (0, import_fields23.text)({ isIndexed: true }),
    status: (0, import_fields23.select)({
      type: "string",
      options: [
        { label: "Received", value: "received" },
        { label: "Processed", value: "processed" },
        { label: "Ignored", value: "ignored" },
        { label: "Failed", value: "failed" }
      ],
      defaultValue: "received"
    }),
    payload: (0, import_fields23.json)(),
    rawBody: (0, import_fields23.text)({ ui: { displayMode: "textarea" } }),
    error: (0, import_fields23.text)({ ui: { displayMode: "textarea" } }),
    attempts: (0, import_fields23.integer)({ defaultValue: 0 }),
    receivedAt: (0, import_fields23.timestamp)({ defaultValue: { kind: "now" }, isIndexed: true }),
    processedAt: (0, import_fields23.timestamp)(),
    payment: (0, import_fields23.relationship)({ ref: "Payment" }),
    ...trackingFields
  }
});

// features/keystone/models/PriceTier.ts
var import_fields24 = require("@keystone-6/core/fields");
var PriceTier = domainList({
  show: (0, import_fields24.relationship)({ ref: "Show.tiers" }),
  name: (0, import_fields24.text)(),
  priceCents: money(),
  feeCents: money(),
  capacity: (0, import_fields24.integer)({ defaultValue: 180 }),
  sold: (0, import_fields24.integer)({ defaultValue: 0 }),
  held: (0, import_fields24.integer)({ defaultValue: 0 }),
  isTableTier: (0, import_fields24.checkbox)({ defaultValue: false }),
  seatsPerUnit: (0, import_fields24.integer)({ defaultValue: 1 }),
  salesStartAt: (0, import_fields24.timestamp)(),
  salesEndAt: (0, import_fields24.timestamp)(),
  status: lifecycle(["on_sale", "paused", "sold_out", "closed"]),
  sections: (0, import_fields24.relationship)({ ref: "Section.priceTier", many: true }),
  templates: (0, import_fields24.relationship)({ ref: "ShowTemplate.defaultPriceTiers", many: true }),
  holds: (0, import_fields24.relationship)({ ref: "InventoryHold.priceTier", many: true }),
  holdLines: (0, import_fields24.relationship)({ ref: "InventoryHoldLine.priceTier", many: true })
}, "canManageShows", true);

// features/keystone/models/PromoCode.ts
var import_fields25 = require("@keystone-6/core/fields");
var PromoCode = domainList({
  code: unique(),
  discountType: choice(["percent_bps", "amount_cents", "comp"]),
  value: (0, import_fields25.integer)({ defaultValue: 0, validation: { min: 0 } }),
  maxUses: (0, import_fields25.integer)({ db: { isNullable: true }, validation: { min: 1 } }),
  usedCount: (0, import_fields25.integer)({ defaultValue: 0, access: { create: () => false, update: () => false } }),
  perOrderLimit: (0, import_fields25.integer)({ defaultValue: 1, validation: { min: 1 } }),
  startsAt: (0, import_fields25.timestamp)(),
  endsAt: (0, import_fields25.timestamp)(),
  status: choice(["active", "paused", "expired"]),
  show: (0, import_fields25.relationship)({ ref: "Show.promos" }),
  template: (0, import_fields25.relationship)({ ref: "ShowTemplate.promos" }),
  holds: (0, import_fields25.relationship)({ ref: "InventoryHold.promo", many: true }),
  redemptions: (0, import_fields25.relationship)({ ref: "PromoRedemption.promoCode", many: true })
}, "canManageOrders", false);

// features/keystone/models/PromoRedemption.ts
var import_fields26 = require("@keystone-6/core/fields");
var PromoRedemption = domainList({
  promoCode: (0, import_fields26.relationship)({ ref: "PromoCode.redemptions" }),
  hold: (0, import_fields26.relationship)({ ref: "InventoryHold.redemption" }),
  order: (0, import_fields26.relationship)({ ref: "TicketOrder.redemptions" }),
  amountCents: money(),
  status: lifecycle(["reserved", "committed", "released"])
}, "canManageOrders", true);

// features/keystone/models/Refund.ts
var import_core14 = require("@keystone-6/core");
var import_fields27 = require("@keystone-6/core/fields");
init_access();
var Refund = (0, import_core14.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadPayments({ session }) || permissions.canManagePayments({ session }),
      create: () => false,
      update: () => false,
      delete: () => false
    }
  },
  fields: {
    idempotencyKey: (0, import_fields27.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    amount: (0, import_fields27.integer)({ validation: { isRequired: true, min: 1 } }),
    currencyCode: (0, import_fields27.text)({ validation: { isRequired: true } }),
    status: (0, import_fields27.select)({
      type: "string",
      options: [
        { label: "Processing", value: "processing" },
        { label: "Succeeded", value: "succeeded" },
        { label: "Failed", value: "failed" },
        { label: "Unknown", value: "unknown" }
      ],
      defaultValue: "processing",
      validation: { isRequired: true }
    }),
    reason: (0, import_fields27.text)({ validation: { isRequired: true }, ui: { displayMode: "textarea" } }),
    providerRefundId: (0, import_fields27.text)(),
    providerData: (0, import_fields27.json)(),
    processedAt: (0, import_fields27.timestamp)(),
    payment: (0, import_fields27.relationship)({ ref: "Payment" }),
    order: (0, import_fields27.relationship)({ ref: "TicketOrder.refunds" }),
    requestedBy: (0, import_fields27.relationship)({ ref: "User" }),
    approvedBy: (0, import_fields27.relationship)({ ref: "User" }),
    ...trackingFields
  }
});

// features/keystone/models/WaitlistEntry.ts
var import_fields28 = require("@keystone-6/core/fields");
var WaitlistEntry = domainList({
  entryKey: unique(),
  show: (0, import_fields28.relationship)({ ref: "Show.waitlist" }),
  name: (0, import_fields28.text)(),
  email: (0, import_fields28.text)(),
  partySize: (0, import_fields28.integer)({ defaultValue: 1 }),
  status: lifecycle(["waiting", "offered", "converted", "expired", "cancelled"]),
  hold: (0, import_fields28.relationship)({ ref: "InventoryHold.waitlistEntry" }),
  offeredAt: (0, import_fields28.timestamp)(),
  offerExpiresAt: (0, import_fields28.timestamp)()
}, "canManageOrders", true);

// features/keystone/models/Role.ts
var import_core15 = require("@keystone-6/core");
var import_access11 = require("@keystone-6/core/access");
var import_fields29 = require("@keystone-6/core/fields");
init_access();
var Role = (0, import_core15.list)({
  access: {
    operation: {
      ...(0, import_access11.allOperations)(permissions.canManageRoles),
      query: isSignedIn
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManageRoles(args),
    hideDelete: (args) => !permissions.canManageRoles(args),
    listView: {
      initialColumns: ["name", "assignedTo"]
    },
    itemView: {
      defaultFieldMode: (args) => permissions.canManageRoles(args) ? "edit" : "read"
    }
  },
  fields: {
    name: (0, import_fields29.text)({ validation: { isRequired: true } }),
    ...Object.fromEntries(permissionNames.map((name) => [name, (0, import_fields29.checkbox)({ defaultValue: false })])),
    ...trackingFields,
    assignedTo: (0, import_fields29.relationship)({
      ref: "User.role",
      many: true,
      ui: {
        itemView: { fieldMode: "read" }
      }
    })
  }
});

// features/keystone/models/Room.ts
var import_fields30 = require("@keystone-6/core/fields");
var Room = domainList({
  venue: (0, import_fields30.relationship)({ ref: "Venue.rooms" }),
  name: (0, import_fields30.text)(),
  capacity: (0, import_fields30.integer)({ defaultValue: 180 }),
  seatingMode: choice(["tables", "ga"]),
  active: (0, import_fields30.checkbox)({ defaultValue: false }),
  sections: (0, import_fields30.relationship)({ ref: "Section.room", many: true }),
  shows: (0, import_fields30.relationship)({ ref: "Show.room", many: true }),
  templates: (0, import_fields30.relationship)({ ref: "ShowTemplate.room", many: true })
}, "canManageSettings", false);

// features/keystone/models/Run.ts
var import_fields31 = require("@keystone-6/core/fields");
var Run = domainList({
  headliner: (0, import_fields31.relationship)({ ref: "Comedian.runs" }),
  status: lifecycle(["scheduled", "in_progress", "closed"]),
  closedAt: (0, import_fields31.timestamp)({ access: { create: () => false, update: () => false } }),
  startAt: (0, import_fields31.timestamp)(),
  endAt: (0, import_fields31.timestamp)(),
  runFeeCents: money(),
  notes: (0, import_fields31.text)(),
  shows: (0, import_fields31.relationship)({ ref: "Show.run", many: true }),
  payouts: (0, import_fields31.relationship)({ ref: "ComedianPayout.run", many: true })
}, "canManageTalent", false);

// features/keystone/models/SeatingAssignment.ts
var import_fields32 = require("@keystone-6/core/fields");
var SeatingAssignment = domainList({
  show: (0, import_fields32.relationship)({ ref: "Show.assignments" }),
  ticketOrder: (0, import_fields32.relationship)({ ref: "TicketOrder.tableAssignment" }),
  tables: (0, import_fields32.relationship)({ ref: "Table.assignments", many: true }),
  partySize: (0, import_fields32.integer)({ defaultValue: 1 }),
  status: lifecycle(["unseated", "seated", "closed"]),
  seatedAt: (0, import_fields32.timestamp)(),
  server: (0, import_fields32.relationship)({ ref: "User.seatings" }),
  checks: (0, import_fields32.relationship)({ ref: "Check.seatingAssignment", many: true }),
  occupancies: (0, import_fields32.relationship)({ ref: "TableOccupancy.assignment", many: true })
}, "canManageDoor", true);

// features/keystone/models/Section.ts
var import_fields33 = require("@keystone-6/core/fields");
var Section = domainList({
  room: (0, import_fields33.relationship)({ ref: "Room.sections" }),
  name: (0, import_fields33.text)(),
  priceTier: (0, import_fields33.relationship)({ ref: "PriceTier.sections" }),
  sort: (0, import_fields33.integer)({ defaultValue: 0 }),
  tables: (0, import_fields33.relationship)({ ref: "Table.section", many: true })
}, "canManageSettings", false);

// features/keystone/models/Show.ts
var import_core16 = require("@keystone-6/core");
var import_fields34 = require("@keystone-6/core/fields");
var Show = domainList({
  soldCount: (0, import_fields34.virtual)({ field: import_core16.graphql.field({ type: import_core16.graphql.Int, async resolve(item, _args, context) {
    return context.prisma.ticket.count({ where: { showId: item.id, status: { in: ["valid", "checked_in"] } } });
  } }) }),
  heldCount: (0, import_fields34.virtual)({ field: import_core16.graphql.field({ type: import_core16.graphql.Int, async resolve(item, _args, context) {
    const result = await context.prisma.inventoryHold.aggregate({ where: { showId: item.id, status: "active", expiresAt: { gt: /* @__PURE__ */ new Date() } }, _sum: { quantity: true } });
    return result._sum.quantity || 0;
  } }) }),
  checkedInCount: (0, import_fields34.virtual)({ field: import_core16.graphql.field({ type: import_core16.graphql.Int, async resolve(item, _args, context) {
    return context.prisma.ticket.count({ where: { showId: item.id, status: "checked_in" } });
  } }) }),
  remaining: (0, import_fields34.virtual)({ field: import_core16.graphql.field({ type: import_core16.graphql.Int, async resolve(item, _args, context) {
    const tiers = await context.prisma.priceTier.findMany({ where: { showId: item.id }, select: { sold: true, held: true } });
    return Math.max(0, Number(item.capacity) - tiers.reduce((n, t) => n + t.sold + t.held, 0));
  } }) }),
  room: (0, import_fields34.relationship)({ ref: "Room.shows" }),
  template: (0, import_fields34.relationship)({ ref: "ShowTemplate.shows" }),
  run: (0, import_fields34.relationship)({ ref: "Run.shows" }),
  group: (0, import_fields34.relationship)({ ref: "ShowGroup.shows" }),
  groupSources: (0, import_fields34.relationship)({ ref: "ShowGroup.sourceShow", many: true }),
  title: (0, import_fields34.text)(),
  occurrenceKey: unique(),
  startsAt: (0, import_fields34.timestamp)(),
  doorsAt: (0, import_fields34.timestamp)(),
  endsAt: (0, import_fields34.timestamp)(),
  signupOpensAt: (0, import_fields34.timestamp)(),
  ageRestriction: choice(["all", "18", "21"]),
  capacity: (0, import_fields34.integer)({ defaultValue: 180 }),
  status: lifecycle(["draft", "on_sale", "sold_out", "doors_open", "in_progress", "completed", "settled", "cancelled"]),
  isOpenMic: (0, import_fields34.checkbox)({ defaultValue: false }),
  publicNote: (0, import_fields34.text)(),
  lineup: (0, import_fields34.relationship)({ ref: "LineupSlot.show", many: true }),
  signups: (0, import_fields34.relationship)({ ref: "OpenMicSignup.show", many: true }),
  waitlist: (0, import_fields34.relationship)({ ref: "WaitlistEntry.show", many: true }),
  tiers: (0, import_fields34.relationship)({ ref: "PriceTier.show", many: true }),
  holds: (0, import_fields34.relationship)({ ref: "InventoryHold.show", many: true }),
  orders: (0, import_fields34.relationship)({ ref: "TicketOrder.show", many: true }),
  tickets: (0, import_fields34.relationship)({ ref: "Ticket.show", many: true }),
  comps: (0, import_fields34.relationship)({ ref: "Comp.show", many: true }),
  assignments: (0, import_fields34.relationship)({ ref: "SeatingAssignment.show", many: true }),
  checks: (0, import_fields34.relationship)({ ref: "Check.show", many: true }),
  checkIns: (0, import_fields34.relationship)({ ref: "CheckIn.show", many: true }),
  payouts: (0, import_fields34.relationship)({ ref: "ComedianPayout.show", many: true }),
  settlement: (0, import_fields34.relationship)({ ref: "ShowSettlement.show" }),
  promos: (0, import_fields34.relationship)({ ref: "PromoCode.show", many: true }),
  occupancies: (0, import_fields34.relationship)({ ref: "TableOccupancy.show", many: true })
}, "canManageShows", false, false, {
  validate: {
    // A new show needs a room for seating and capacity. Older rows without one still work: showCapacity falls back to the show's own cap.
    async create({ resolvedData, addValidationError }) {
      if (!resolvedData.room?.connect?.id) addValidationError("A show needs a room");
    },
    async update({ resolvedData, item, addValidationError }) {
      if (resolvedData.room?.disconnect && !resolvedData.room?.connect) addValidationError("A show needs a room");
    }
  }
});

// features/keystone/models/ShowSettlement.ts
var import_fields35 = require("@keystone-6/core/fields");
var ShowSettlement = domainList({
  show: (0, import_fields35.relationship)({ ref: "Show.settlement" }),
  ticketGrossCents: money(),
  feesCents: money(),
  discountsCents: money(),
  refundsCents: money(),
  compsCount: (0, import_fields35.integer)({ defaultValue: 0 }),
  foodBeverageGrossCents: money(),
  minimumShortfallRevenueCents: money(),
  tipsCents: money(),
  talentCostCents: money(),
  netCents: (0, import_fields35.integer)({ defaultValue: 0 }),
  currencyCode: currency(),
  status: lifecycle(["open", "closed"]),
  closedBy: (0, import_fields35.relationship)({ ref: "User.settlements" })
}, "canManagePayouts", true);

// features/keystone/models/ShowTemplate.ts
var import_fields36 = require("@keystone-6/core/fields");
var ShowTemplate = domainList({
  room: (0, import_fields36.relationship)({ ref: "Room.templates" }),
  title: (0, import_fields36.text)(),
  recurrenceRule: (0, import_fields36.text)(),
  startTime: (0, import_fields36.text)(),
  duration: (0, import_fields36.integer)({ defaultValue: 90 }),
  defaultPriceTiers: (0, import_fields36.relationship)({ ref: "PriceTier.templates", many: true }),
  defaultAgeRestriction: choice(["all", "18", "21"]),
  isOpenMic: (0, import_fields36.checkbox)({ defaultValue: false }),
  shows: (0, import_fields36.relationship)({ ref: "Show.template", many: true }),
  promos: (0, import_fields36.relationship)({ ref: "PromoCode.template", many: true })
}, "canManageShows", false);

// features/keystone/models/ShowGroup.ts
var import_fields37 = require("@keystone-6/core/fields");
var ShowGroup = domainList({
  name: (0, import_fields37.text)(),
  groupKey: unique(),
  sourceShow: (0, import_fields37.relationship)({ ref: "Show.groupSources" }),
  shows: (0, import_fields37.relationship)({ ref: "Show.group", many: true }),
  // Cancel intent: recorded once, then every show in cancelShowIds is finished by the UI loop or the Continue button.
  cancelRequestedAt: (0, import_fields37.timestamp)(),
  cancelRequestedBy: (0, import_fields37.relationship)({ ref: "User" }),
  cancelReason: (0, import_fields37.text)(),
  cancelShowIds: (0, import_fields37.json)(),
  cancelCompletedAt: (0, import_fields37.timestamp)()
}, "canManageShows", true);

// features/keystone/models/Table.ts
var import_fields38 = require("@keystone-6/core/fields");
var Table = domainList({
  section: (0, import_fields38.relationship)({ ref: "Section.tables" }),
  label: (0, import_fields38.text)(),
  seats: (0, import_fields38.integer)({ defaultValue: 4 }),
  combinableWith: (0, import_fields38.relationship)({ ref: "Table.combinedBy", many: true }),
  combinedBy: (0, import_fields38.relationship)({ ref: "Table.combinableWith", many: true }),
  x: (0, import_fields38.integer)({ defaultValue: 0 }),
  y: (0, import_fields38.integer)({ defaultValue: 0 }),
  shape: choice(["round", "square", "rectangle"]),
  holds: (0, import_fields38.relationship)({ ref: "InventoryHold.tables", many: true }),
  assignments: (0, import_fields38.relationship)({ ref: "SeatingAssignment.tables", many: true }),
  occupancies: (0, import_fields38.relationship)({ ref: "TableOccupancy.table", many: true })
}, "canManageSettings", false, false, {
  validate: {
    async create({ resolvedData, context, addValidationError }) {
      await uniqueLabel(context, resolvedData, null, addValidationError);
    },
    async update({ resolvedData, item, context, addValidationError }) {
      await uniqueLabel(context, resolvedData, item, addValidationError);
    }
  }
});
async function uniqueLabel(context, data, item, addValidationError) {
  const label = String(data.label ?? item?.label ?? "").trim();
  if (!label) return addValidationError("Table label is required");
  const sectionId = data.section?.connect?.id ?? item?.sectionId;
  if (!sectionId) return;
  const section = await context.prisma.section.findUnique({ where: { id: sectionId }, select: { roomId: true } });
  if (!section) return;
  const clash = await context.prisma.table.findFirst({ where: { label: { equals: label, mode: "insensitive" }, section: { roomId: section.roomId }, ...item ? { id: { not: item.id } } : {} }, select: { id: true } });
  if (clash) addValidationError(`Table label ${label} is already used in this room`);
}

// features/keystone/models/TableOccupancy.ts
var import_fields39 = require("@keystone-6/core/fields");
var TableOccupancy = domainList({
  occupancyKey: (0, import_fields39.text)({ isIndexed: "unique", db: { isNullable: true } }),
  show: (0, import_fields39.relationship)({ ref: "Show.occupancies" }),
  table: (0, import_fields39.relationship)({ ref: "Table.occupancies" }),
  hold: (0, import_fields39.relationship)({ ref: "InventoryHold.occupancies" }),
  assignment: (0, import_fields39.relationship)({ ref: "SeatingAssignment.occupancies" })
}, "canManageDoor", true);

// features/keystone/models/Ticket.ts
var import_fields40 = require("@keystone-6/core/fields");
var Ticket = domainList({
  order: (0, import_fields40.relationship)({ ref: "TicketOrder.tickets" }),
  show: (0, import_fields40.relationship)({ ref: "Show.tickets" }),
  line: (0, import_fields40.relationship)({ ref: "TicketOrderLine.tickets" }),
  ticketCode: unique(),
  tokenHash: secret(),
  holderName: (0, import_fields40.text)(),
  holderEmail: (0, import_fields40.text)(),
  transferredFromCode: (0, import_fields40.text)(),
  status: lifecycle(["valid", "checked_in", "void", "refunded"]),
  checkIns: (0, import_fields40.relationship)({ ref: "CheckIn.ticket", many: true })
}, "canManageDoor", true);

// features/keystone/models/TicketOrder.ts
var import_fields41 = require("@keystone-6/core/fields");
var TicketOrder = domainList({
  orderNumber: unique(),
  customer: (0, import_fields41.relationship)({ ref: "User.ticketOrders" }),
  email: (0, import_fields41.text)(),
  name: (0, import_fields41.text)(),
  phone: (0, import_fields41.text)(),
  show: (0, import_fields41.relationship)({ ref: "Show.orders" }),
  status: lifecycle(["pending_payment", "paid", "partially_refunded", "refunded", "cancelled", "comp"]),
  subtotalCents: money(),
  feesCents: money(),
  discountCents: money(),
  taxCents: money(),
  totalCents: money(),
  currencyCode: currency(),
  source: choice(["online", "box_office", "comp", "bringer"]),
  partySize: (0, import_fields41.integer)({ defaultValue: 1 }),
  seatingRequest: (0, import_fields41.text)(),
  birthdayOrOccasion: (0, import_fields41.text)(),
  ageAttested: (0, import_fields41.checkbox)({ defaultValue: false }),
  paymentCollection: (0, import_fields41.relationship)({ ref: "PaymentCollection.order" }),
  secretKey: secret(),
  lines: (0, import_fields41.relationship)({ ref: "TicketOrderLine.order", many: true }),
  tickets: (0, import_fields41.relationship)({ ref: "Ticket.order", many: true }),
  tableAssignment: (0, import_fields41.relationship)({ ref: "SeatingAssignment.ticketOrder" }),
  hold: (0, import_fields41.relationship)({ ref: "InventoryHold.order" }),
  payments: (0, import_fields41.relationship)({ ref: "Payment.order", many: true }),
  redemptions: (0, import_fields41.relationship)({ ref: "PromoRedemption.order", many: true }),
  refunds: (0, import_fields41.relationship)({ ref: "Refund.order", many: true })
}, "canManageOrders", true);

// features/keystone/models/TicketOrderLine.ts
var import_fields42 = require("@keystone-6/core/fields");
var TicketOrderLine = domainList({
  order: (0, import_fields42.relationship)({ ref: "TicketOrder.lines" }),
  tierName: (0, import_fields42.text)(),
  unitPriceCents: money(),
  unitFeeCents: money(),
  quantity: (0, import_fields42.integer)({ defaultValue: 1 }),
  lineTotalCents: money(),
  discountCents: money(),
  taxCents: money(),
  currencyCode: currency(),
  priceTierId: (0, import_fields42.text)(),
  tickets: (0, import_fields42.relationship)({ ref: "Ticket.line", many: true })
}, "canManageOrders", true);

// features/keystone/models/User.ts
var import_core17 = require("@keystone-6/core");
var import_access13 = require("@keystone-6/core/access");
var import_fields43 = require("@keystone-6/core/fields");
init_access();
var User = (0, import_core17.list)({
  access: {
    operation: {
      ...(0, import_access13.allOperations)(isSignedIn),
      create: (args) => {
        if (process.env.PUBLIC_SIGNUPS_ALLOWED === "true") {
          return true;
        }
        return permissions.canManagePeople(args);
      },
      delete: permissions.canManagePeople
    },
    filter: {
      query: rules.canReadPeople,
      update: rules.canUpdatePeople
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManagePeople(args),
    hideDelete: (args) => !permissions.canManagePeople(args),
    listView: {
      initialColumns: ["name", "email", "role"]
    },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        if (session?.data.role?.canEditOtherPeople) return "edit";
        if (session?.itemId === item?.id) return "edit";
        return "read";
      }
    }
  },
  fields: {
    name: (0, import_fields43.text)({
      validation: {
        isRequired: true
      }
    }),
    email: (0, import_fields43.text)({
      isFilterable: false,
      isOrderable: false,
      isIndexed: "unique",
      validation: {
        isRequired: true
      }
    }),
    password: (0, import_fields43.password)({
      access: {
        read: import_access13.denyAll,
        update: ({ session, item }) => permissions.canManagePeople({ session }) || session?.itemId === item.id
      },
      validation: { isRequired: true }
    }),
    role: (0, import_fields43.relationship)({
      ref: "Role.assignedTo",
      access: {
        create: permissions.canManagePeople,
        update: permissions.canManagePeople
      },
      ui: {
        itemView: {
          fieldMode: (args) => permissions.canManagePeople(args) ? "edit" : "read"
        }
      }
    }),
    onboardingStatus: (0, import_fields43.select)({ options: ["not_started", "in_progress", "completed", "dismissed"], defaultValue: "not_started" }),
    notificationPreference: (0, import_fields43.checkbox)({ defaultValue: false }),
    ticketOrders: (0, import_fields43.relationship)({ ref: "TicketOrder.customer", many: true, access: { create: () => false, update: () => false } }),
    issuedComps: (0, import_fields43.relationship)({ ref: "Comp.issuedBy", many: true, access: { create: () => false, update: () => false } }),
    seatings: (0, import_fields43.relationship)({ ref: "SeatingAssignment.server", many: true, access: { create: () => false, update: () => false } }),
    checks: (0, import_fields43.relationship)({ ref: "Check.server", many: true, access: { create: () => false, update: () => false } }),
    checkIns: (0, import_fields43.relationship)({ ref: "CheckIn.scannedBy", many: true, access: { create: () => false, update: () => false } }),
    settlements: (0, import_fields43.relationship)({ ref: "ShowSettlement.closedBy", many: true, access: { create: () => false, update: () => false } }),
    auditEvents: (0, import_fields43.relationship)({ ref: "AuditEvent.actor", many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});

// features/keystone/models/Venue.ts
var import_fields44 = require("@keystone-6/core/fields");
var Venue = domainList({
  name: (0, import_fields44.text)(),
  timezone: (0, import_fields44.text)(),
  address: (0, import_fields44.text)(),
  defaultAgeRestriction: choice(["all", "18", "21"]),
  drinkMinimumItems: (0, import_fields44.integer)({ defaultValue: 2 }),
  drinkMinimumCentsFloor: (0, import_fields44.integer)({ defaultValue: 0 }),
  serviceFeeBps: (0, import_fields44.integer)({ defaultValue: 0 }),
  taxBps: (0, import_fields44.integer)({ defaultValue: 0 }),
  policies: (0, import_fields44.text)(),
  rooms: (0, import_fields44.relationship)({ ref: "Room.venue", many: true })
}, "canManageSettings", false);

// features/keystone/models/VenueSettings.ts
var import_fields46 = require("@keystone-6/core/fields");

// features/keystone/models/storeLogoFields.ts
var import_fields45 = require("@keystone-6/core/fields");

// features/platform/store-settings/lib/icon-registry.ts
var LOGO_ICONS = [
  {
    id: "3portals",
    name: "3Portals",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill-rule="evenodd"><path d="m34.5868 8.40061-9.6868-2.59556c-.6687-.17919-1.2108.23679-1.2108.92911v10.02854c0 .6923.5421 1.3988 1.2108 1.578l9.6868 2.5955c.6687.1792 1.2109-.2368 1.2109-.9291v-10.02848c0-.69232-.5422-1.39882-1.2109-1.57801zm-9.6868-6.35625c-2.6749-.71674-4.8434.94718-4.8434 3.71647v10.02847c0 2.7693 2.1685 5.5953 4.8434 6.312l9.6868 2.5956c2.6749.7168 4.8434-.9472 4.8434-3.7165v-10.0284c0-2.76934-2.1685-5.59533-4.8434-6.31207z" fill="#8098f9"/><path d="m26.9812 16.5707-12.1085-3.2444c-.6687-.1792-1.2109.2368-1.2109.9291v12.5356c0 .6923.5422 1.3988 1.2109 1.578l12.1085 3.2445c.6687.1792 1.2108-.2368 1.2108-.9291v-12.5356c0-.6924-.5421-1.3989-1.2108-1.5781zm-12.1085-7.0051c-2.6749-.71674-4.8434.9472-4.8434 3.7165v12.5356c0 2.7693 2.1685 5.5953 4.8434 6.312l12.1085 3.2445c2.6749.7167 4.8433-.9472 4.8433-3.7165v-12.5356c0-2.7693-2.1684-5.5953-4.8433-6.312z" fill="#6172f3"/><path d="m19.3736 24.7409-14.53021-3.8934c-.66873-.1792-1.21085.2368-1.21085.9291v15.0428c0 .6923.54212 1.3988 1.21085 1.578l14.53021 3.8933c.6687.1792 1.2108-.2368 1.2108-.9291v-15.0427c0-.6923-.5421-1.3988-1.2108-1.578zm-14.53021-7.6541c-2.67493-.7167-4.84339.9472-4.84339 3.7165v15.0427c0 2.7693 2.16846 5.5953 4.84339 6.3121l14.53021 3.8933c2.6749.7168 4.8433-.9472 4.8433-3.7164v-15.0428c0-2.7693-2.1684-5.5953-4.8433-6.312z" fill="#444ce7"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#fff" fill-rule="evenodd"><path d="m34.5868 8.40061-9.6868-2.59556c-.6687-.17919-1.2108.23679-1.2108.92911v10.02854c0 .6923.5421 1.3988 1.2108 1.578l9.6868 2.5955c.6687.1792 1.2109-.2368 1.2109-.9291v-10.02848c0-.69232-.5422-1.39882-1.2109-1.57801zm-9.6868-6.35625c-2.6749-.71674-4.8434.94718-4.8434 3.71647v10.02847c0 2.7693 2.1685 5.5953 4.8434 6.312l9.6868 2.5956c2.6749.7168 4.8434-.9472 4.8434-3.7165v-10.0284c0-2.76934-2.1685-5.59533-4.8434-6.31207z" opacity=".5"/><path d="m26.9812 16.5707-12.1085-3.2444c-.6687-.1792-1.2109.2368-1.2109.9291v12.5356c0 .6923.5422 1.3988 1.2109 1.578l12.1085 3.2445c.6687.1792 1.2108-.2368 1.2108-.9291v-12.5356c0-.6924-.5421-1.3989-1.2108-1.5781zm-12.1085-7.0051c-2.6749-.71674-4.8434.9472-4.8434 3.7165v12.5356c0 2.7693 2.1685 5.5953 4.8434 6.312l12.1085 3.2445c2.6749.7167 4.8433-.9472 4.8433-3.7165v-12.5356c0-2.7693-2.1684-5.5953-4.8433-6.312z" opacity=".7"/><path d="m19.3736 24.7409-14.53021-3.8934c-.66873-.1792-1.21085.2368-1.21085.9291v15.0428c0 .6923.54212 1.3988 1.21085 1.578l14.53021 3.8933c.6687.1792 1.2108-.2368 1.2108-.9291v-15.0427c0-.6923-.5421-1.3988-1.2108-1.578zm-14.53021-7.6541c-2.67493-.7167-4.84339.9472-4.84339 3.7165v15.0427c0 2.7693 2.16846 5.5953 4.84339 6.3121l14.53021 3.8933c2.6749.7168 4.8433-.9472 4.8433-3.7164v-15.0428c0-2.7693-2.1684-5.5953-4.8433-6.312z"/></g></svg>`
  },
  {
    id: "45-degrees",
    name: "45 Degrees",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 24 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 15.8981h17.3455l-17.061314 17.0613 2.756374 2.7564 17.06134-17.0613v17.3455h.1104l3.7877-3.7877v-15.9638l-4.2485-4.2485h-15.96596l-3.78553995 3.7855z" fill="#155eef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 24 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 15.8981h17.3455l-17.061314 17.0613 2.756374 2.7564 17.06134-17.0613v17.3455h.1104l3.7877-3.7877v-15.9638l-4.2485-4.2485h-15.96596l-3.78553995 3.7855z" fill="#155eef"/></svg>`
  },
  {
    id: "acme-corp",
    name: "Acme Corp",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m0 24c15.2548 0 24-8.7452 24-24 0 15.2548 8.7452 24 24 24-15.2548 0-24 8.7452-24 24 0-15.2548-8.7452-24-24-24z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m0 24c15.2548 0 24-8.7452 24-24 0 15.2548 8.7452 24 24 24-15.2548 0-24 8.7452-24 24 0-15.2548-8.7452-24-24-24z" fill="#155eef" fill-rule="evenodd"/></svg>`
  },
  {
    id: "alphawave",
    name: "AlphaWave",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 47 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m24.9706 7.03309c-3.1242-3.1242-8.1896-3.1242-11.3137 0l-11.31375 11.31371c-3.124199 3.1242-3.124199 8.1895 0 11.3137l11.31375 11.3137c3.1241 3.1242 8.1895 3.1242 11.3137 0l5.3982-5.3983c-4.4939-1.7337-7.682-6.0944-7.682-11.1997 0-5.3087 3.4472-9.8123 8.2254-11.3943-.0935-.0982-.1884-.1955-.2848-.292z" fill="#155eef"/><path d="m30.3691 35.5798c1.3398.5168 2.7955.8001 4.3174.8001 6.6274 0 12-5.3726 12-12s-5.3726-12-12-12c-1.3185 0-2.5873.2126-3.774.6055 5.9623 6.2681 5.8675 16.1836-.2846 22.3356z" fill="#155eef" opacity=".7"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 47 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m24.9706 7.03309c-3.1242-3.1242-8.1896-3.1242-11.3137 0l-11.31375 11.31371c-3.124199 3.1242-3.124199 8.1895 0 11.3137l11.31375 11.3137c3.1241 3.1242 8.1895 3.1242 11.3137 0l5.3982-5.3983c-4.4939-1.7337-7.682-6.0944-7.682-11.1997 0-5.3087 3.4472-9.8123 8.2254-11.3943-.0935-.0982-.1884-.1955-.2848-.292z" fill="#155eef"/><path d="m30.3691 35.5798c1.3398.5168 2.7955.8001 4.3174.8001 6.6274 0 12-5.3726 12-12s-5.3726-12-12-12c-1.3185 0-2.5873.2126-3.774.6055 5.9623 6.2681 5.8675 16.1836-.2846 22.3356z" fill="#155eef" opacity=".7"/></svg>`
  },
  {
    id: "alt-shift",
    name: "Alt+Shift",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m23.4538 34.7189c-3.1818-1.1818-6.4544-1.3636-9.4544-.5455-2.0909.5455-4.09082 1.6364-5.90897 3l-1.27273 1.0909-.36362.3636.81816.7273c.09091 0 .09092.0909.18183.1818.18181.1818.36364.2727.63636.4545l.54542.3636.54545-.4545c.09091-.0909.27273-.2727.45454-.3636 1.63636-1.3636 3.45446-2.2727 5.36356-2.7272 2.4545-.6364 5.0908-.5455 7.7271.4545 2.1818.8182 6.6363 1.8181 11.9998-.4545l.1818-.091.2728-.2727c0-.0909.0909-.0909.1818-.1818.4545-.5454.9091-1.0909 1.2727-1.7272l1.8181-2.8182-2.909 1.6363c-4.2727 2.3636-8.1817 2.8182-12.0907 1.3637z"/><path d="m10.9998 24.9011c2.4545-.6363 5.0908-.5454 7.7272.4546 2.909 1.0909 10.3634 2.6363 18.7269-4.909l1.8182-1.8182-.1819-.4545c-.0909-.3636-.2727-.8182-.4545-1.2727l-.4545-1.2727-.9091.909c-.0909.1819-.2727.2728-.4546.4546-3.9999 4.0908-10.1816 8.2726-17.2724 5.7272-3.1817-1.1818-6.4544-1.3637-9.4544-.5455-2.909.8182-5.45442 2.3636-7.81801 4.5454v-.0909l-1.363614 1.4545c0 .0909-.090891.0909-.181798.1818l-.27274.2727.090913.3637c.090908.4545.272717.909.363625 1.3636l.545454 1.4545.90907-1.1818c.09091-.1818.27272-.2727.36363-.4545 1.90905-1.7273 4.54538-4.1818 8.27257-5.1818z"/><path d="m2.1818 23.2646c2.09088-2.1818 4.45445-3.5454 6.99987-4.2727 2.45453-.6363 5.09083-.5454 7.72713.4546 8.1817 2.9999 15.2725-1.9091 18.3633-4.5454l1.1818-1.1818.4546-.3636-.3637-.5455c-.2727-.2727-.4545-.6363-.7272-1l-.5455-.7272-.6363.6363c-.0909.0909-.2727.2727-.3637.3637-3.8181 3.6363-9.7271 7.3635-16.4542 4.8181-3.1818-1.1818-6.4544-1.3637-9.4544-.5455-1.90906.5455-3.72721 1.4545-5.54536 2.6363l-1.909065 1.5455c-.181815.1818-.272722.2727-.454537.4545l-.181799.1818v.2727c-.090907.6364-.090918 1.2727-.1818259 1.8182l-.0909131 2.2727 1.54544-1.6364c.18181-.1818.36364-.4545.63636-.6363z"/><path d="m26.0908 40.9007c-.2727-.0909-.4545-.1819-.7272-.2728-3.1818-1.1818-6.4545-1.3636-9.4545-.5454-.6363.1818-1.2726.3636-1.909.6364l-2.1818.9999-.5454.2728 1.8181.6363c.5455.1818 1.0909.3637 1.6364.5455l.2727.0909.2727-.0909c.2727-.0909.5455-.2728.8182-.2728.1818 0 .3636-.0909.5454-.1818 2.1818-.5454 4.5454-.5454 7.0908.2727.2727.091.4546.1819.7273.2728l.4545.1818.2727-.0909c.6364-.1818 1.3636-.3636 1.9091-.6364l2.5454-.909-2.6363-.6364c-.2727-.0909-.6364-.1818-.9091-.2727z"/><path d="m40 22.0829-1.3636 1.3636c-.1818.1818-.3636.3636-.5454.5454-3.7272 3.5454-9.7271 7.3635-16.4543 4.8181-3.1818-1.1818-6.4544-1.3636-9.4544-.5454-2.81811.8182-5.36354 2.2727-7.63623 4.4545l-1.18179 1.2727-.36362.4545.36362.5454c.27273.3637.45455.6364.63637 1l.54542.8182.63636-.8182c.09091-.0909.27272-.2727.36363-.3636 2.18178-2.3636 4.54534-3.8181 7.27264-4.5454 2.4545-.6364 5.0908-.5454 7.7271.4545 2.2727.8182 4.6363 1.0909 6.9999.8182 4.1817-.4545 8.3635-2.8181 11.4543-5.4544.1819-.1818.3636-.2727.5455-.4546l.2727-.2727v-.2727c0-.5455.0909-1.1818.0909-1.7273z"/><path d="m5.45373 13.7196c.54545-.2728 1.18182-.4546 1.72726-.6364 2.45451-.6364 5.09081-.5455 7.72711.4545 1.7273.6364 3.4545.9091 5.3636.9091 3.8181 0 7.6362-1.3636 11.1816-3.9999l1.8181-1.45455-.8181-.63636c-.2727-.27273-.6364-.54544-1-.72725l-.5455-.36363-.4545.36363c-.1818.09091-.2727.27272-.4545.36362-4.8181 3.63634-9.6362 4.63634-14.1816 2.90904-3.2727-1.18178-6.54535-1.45451-9.81802-.4545-.27272.0909-.54544.1818-.90907.2727l-.1818.0909-.27274.2727c0 .0909-.09089.0909-.1818.1818-.36363.5455-.81818 1-1.18181 1.5455l-1.72724 2.6363 2.81814-1.4545c.45453 0 .81815-.1818 1.09087-.2727z"/><path d="m12.9089 7.53769.2727.09091c1.1818.45454 3 .90907 5.2726.90907 2.3636 0 4.6363-.54545 6.909-1.45452l2.8181-1.36361-1.909-.63634c-.5454-.18182-1.0909-.36363-1.7273-.45454h-.2727l-.2727.09089c-.2727.0909-.5455.27274-.8182.36365-2.7272.99998-5.4544 1.1818-8.0907.45454-.2728-.09091-.5455-.18183-.8182-.27274l-.2727-.09091-.2728.09091c-.5454.18181-1.0908.36364-1.6363.63636l-2.09087.90908 2.18177.63633c.1818-.0909.4546.00001.7273.09092z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m23.4538 34.7189c-3.1818-1.1818-6.4544-1.3636-9.4544-.5455-2.0909.5455-4.09082 1.6364-5.90897 3l-1.27273 1.0909-.36362.3636.81816.7273c.09091 0 .09092.0909.18183.1818.18181.1818.36364.2727.63636.4545l.54542.3636.54545-.4545c.09091-.0909.27273-.2727.45454-.3636 1.63636-1.3636 3.45446-2.2727 5.36356-2.7272 2.4545-.6364 5.0908-.5455 7.7271.4545 2.1818.8182 6.6363 1.8181 11.9998-.4545l.1818-.091.2728-.2727c0-.0909.0909-.0909.1818-.1818.4545-.5454.9091-1.0909 1.2727-1.7272l1.8181-2.8182-2.909 1.6363c-4.2727 2.3636-8.1817 2.8182-12.0907 1.3637z"/><path d="m10.9998 24.9011c2.4545-.6363 5.0908-.5454 7.7272.4546 2.909 1.0909 10.3634 2.6363 18.7269-4.909l1.8182-1.8182-.1819-.4545c-.0909-.3636-.2727-.8182-.4545-1.2727l-.4545-1.2727-.9091.909c-.0909.1819-.2727.2728-.4546.4546-3.9999 4.0908-10.1816 8.2726-17.2724 5.7272-3.1817-1.1818-6.4544-1.3637-9.4544-.5455-2.909.8182-5.45442 2.3636-7.81801 4.5454v-.0909l-1.363614 1.4545c0 .0909-.090891.0909-.181798.1818l-.27274.2727.090913.3637c.090908.4545.272717.909.363625 1.3636l.545454 1.4545.90907-1.1818c.09091-.1818.27272-.2727.36363-.4545 1.90905-1.7273 4.54538-4.1818 8.27257-5.1818z"/><path d="m2.1818 23.2646c2.09088-2.1818 4.45445-3.5454 6.99987-4.2727 2.45453-.6363 5.09083-.5454 7.72713.4546 8.1817 2.9999 15.2725-1.9091 18.3633-4.5454l1.1818-1.1818.4546-.3636-.3637-.5455c-.2727-.2727-.4545-.6363-.7272-1l-.5455-.7272-.6363.6363c-.0909.0909-.2727.2727-.3637.3637-3.8181 3.6363-9.7271 7.3635-16.4542 4.8181-3.1818-1.1818-6.4544-1.3637-9.4544-.5455-1.90906.5455-3.72721 1.4545-5.54536 2.6363l-1.909065 1.5455c-.181815.1818-.272722.2727-.454537.4545l-.181799.1818v.2727c-.090907.6364-.090918 1.2727-.1818259 1.8182l-.0909131 2.2727 1.54544-1.6364c.18181-.1818.36364-.4545.63636-.6363z"/><path d="m26.0908 40.9007c-.2727-.0909-.4545-.1819-.7272-.2728-3.1818-1.1818-6.4545-1.3636-9.4545-.5454-.6363.1818-1.2726.3636-1.909.6364l-2.1818.9999-.5454.2728 1.8181.6363c.5455.1818 1.0909.3637 1.6364.5455l.2727.0909.2727-.0909c.2727-.0909.5455-.2728.8182-.2728.1818 0 .3636-.0909.5454-.1818 2.1818-.5454 4.5454-.5454 7.0908.2727.2727.091.4546.1819.7273.2728l.4545.1818.2727-.0909c.6364-.1818 1.3636-.3636 1.9091-.6364l2.5454-.909-2.6363-.6364c-.2727-.0909-.6364-.1818-.9091-.2727z"/><path d="m40 22.0829-1.3636 1.3636c-.1818.1818-.3636.3636-.5454.5454-3.7272 3.5454-9.7271 7.3635-16.4543 4.8181-3.1818-1.1818-6.4544-1.3636-9.4544-.5454-2.81811.8182-5.36354 2.2727-7.63623 4.4545l-1.18179 1.2727-.36362.4545.36362.5454c.27273.3637.45455.6364.63637 1l.54542.8182.63636-.8182c.09091-.0909.27272-.2727.36363-.3636 2.18178-2.3636 4.54534-3.8181 7.27264-4.5454 2.4545-.6364 5.0908-.5454 7.7271.4545 2.2727.8182 4.6363 1.0909 6.9999.8182 4.1817-.4545 8.3635-2.8181 11.4543-5.4544.1819-.1818.3636-.2727.5455-.4546l.2727-.2727v-.2727c0-.5455.0909-1.1818.0909-1.7273z"/><path d="m5.45373 13.7196c.54545-.2728 1.18182-.4546 1.72726-.6364 2.45451-.6364 5.09081-.5455 7.72711.4545 1.7273.6364 3.4545.9091 5.3636.9091 3.8181 0 7.6362-1.3636 11.1816-3.9999l1.8181-1.45455-.8181-.63636c-.2728-.27273-.6364-.54544-1-.72725l-.5455-.36363-.4545.36363c-.1818.09091-.2727.27272-.4545.36362-4.8181 3.63634-9.6362 4.63634-14.1816 2.90904-3.2727-1.18178-6.54535-1.45451-9.81802-.4545-.27272.0909-.54544.1818-.90907.2727l-.1818.0909-.27274.2727c0 .0909-.09089.0909-.1818.1818-.36363.5455-.81818 1-1.18181 1.5455l-1.72724 2.6363 2.81814-1.4545c.45453 0 .81815-.1818 1.09087-.2727z"/><path d="m12.9089 7.53769.2727.09091c1.1818.45454 3 .90907 5.2726.90907 2.3636 0 4.6363-.54545 6.909-1.45452l2.8181-1.36361-1.909-.63634c-.5454-.18182-1.0909-.36363-1.7273-.45454h-.2727l-.2727.09089c-.2727.0909-.5455.27274-.8182.36365-2.7272.99998-5.4544 1.1818-8.0907.45454-.2728-.09091-.5455-.18183-.8182-.27274l-.2727-.09091-.2728.09091c-.5454.18181-1.0908.36364-1.6363.63636l-2.09087.90908 2.18177.63633c.1818-.0909.4546.00001.7273.09092z"/></g></svg>`
  },
  {
    id: "biosynthesis",
    name: "Biosynthesis",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill-rule="evenodd"><path d="m4.29111 28.6025c.90712.9019.9071 2.3641-.00003 3.266l-.04646.0462c-.90713.9019-2.37788.9018-3.284994-.0001-.9071177-.9019-.9071038-2.3641.000031-3.266l.046453-.0462c.90714-.9019 2.37788-.9018 3.285.0001z" fill="#a4bcfd"/><path d="m15.2112 29.298c.9055.9035.9028 2.3658-.006 3.266l-6.43424 6.3741c-.90876.9002-2.3795.8976-3.28499-.0059-.90548-.9035-.90282-2.3658.00594-3.266l6.43429-6.3741c.9088-.9002 2.3795-.8976 3.285.0059z" fill="#6172f3"/><path d="m23.9431 40.2706c.7116-1.0613 2.1538-1.348 3.2212-.6405l.1394.0923c1.0674.7075 1.3558 2.1414.6442 3.2026-.7116 1.0613-2.1538 1.3481-3.2212.6406l-.1394-.0924c-1.0674-.7075-1.3558-2.1414-.6442-3.2026z" fill="#a4bcfd"/><path d="m39.2728 28.4638c.9072.9019.9072 2.3641 0 3.266l-3.159 3.1408c-.9072.9019-2.3779.9019-3.285 0s-.9071-2.3641 0-3.266l3.1591-3.1408c.9071-.9019 2.3778-.9019 3.2849 0z" fill="#6172f3"/><g fill="#444ce7"><path d="m39.3197 16.8473c.9071.9019.9071 2.3642 0 3.266l-23.3446 23.2098c-.9071.9019-2.3779.9019-3.285 0s-.9071-2.3641 0-3.266l23.3446-23.2098c.9071-.9019 2.3778-.9019 3.285 0z"/><path d="m34.905 9.71133c.9072.90187.9072 2.36417 0 3.26607l-13.426 13.3485c-.9071.9019-2.3779.9019-3.285 0s-.9071-2.3642 0-3.2661l13.4261-13.34847c.9071-.90189 2.3778-.90189 3.2849 0z"/><path d="m27.8187 5.18362c.9077.90128.9087 2.36353.0022 3.26603l-17.2588 17.18215c-.90647.9025-2.37721.9035-3.28495.0022-.90773-.9013-.90872-2.3635-.00221-3.266l17.25876-17.18218c.9065-.9025 2.3772-.90348 3.285-.0022z"/></g><path d="m10.7276 10.6841c.9056.9035.9031 2.3657-.0056 3.266l-6.75949 6.6974c-.90869.9003-2.37943.8978-3.28499-.0056-.905563-.9035-.903032-2.3657.005654-3.2661l6.759476-6.6973c.90868-.90034 2.37942-.89783 3.28495.0056z" fill="#6172f3"/><path d="m14.8678 4.00024c1.2828 0 2.3228 1.03397 2.3228 2.30944v.23094c0 1.27546-1.04 2.30943-2.3228 2.30943-1.2829 0-2.3229-1.03397-2.3229-2.30943v-.23094c0-1.27547 1.04-2.30944 2.3229-2.30944z" fill="#a4bcfd"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#fff" fill-rule="evenodd"><path d="m4.29111 28.6025c.90712.9019.9071 2.3641-.00003 3.266l-.04646.0462c-.90713.9019-2.37788.9018-3.284994-.0001-.9071177-.9019-.9071038-2.3641.000031-3.266l.046453-.0462c.90714-.9019 2.37788-.9018 3.285.0001z" opacity=".5"/><path d="m15.2112 29.298c.9055.9035.9028 2.3658-.006 3.266l-6.43424 6.3741c-.90876.9002-2.3795.8976-3.28499-.0059-.90548-.9035-.90282-2.3658.00594-3.266l6.43429-6.3741c.9088-.9002 2.3795-.8976 3.285.0059z" opacity=".7"/><path d="m23.9431 40.2706c.7116-1.0613 2.1538-1.348 3.2212-.6405l.1394.0923c1.0674.7075 1.3558 2.1414.6442 3.2026-.7116 1.0613-2.1538 1.3481-3.2212.6406l-.1394-.0924c-1.0674-.7075-1.3558-2.1414-.6442-3.2026z" opacity=".5"/><path d="m39.2728 28.4638c.9072.9019.9072 2.3641 0 3.266l-3.159 3.1408c-.9072.9019-2.3779.9019-3.285 0s-.9071-2.3641 0-3.266l3.1591-3.1408c.9071-.9019 2.3778-.9019 3.2849 0z" opacity=".7"/><path d="m39.3197 16.8473c.9071.9019.9071 2.3642 0 3.266l-23.3446 23.2098c-.9071.9019-2.3779.9019-3.285 0s-.9071-2.3641 0-3.266l23.3446-23.2098c.9071-.9019 2.3778-.9019 3.285 0z"/><path d="m34.905 9.71133c.9072.90187.9072 2.36417 0 3.26607l-13.426 13.3485c-.9071.9019-2.3779.9019-3.285 0s-.9071-2.3642 0-3.2661l13.4261-13.34847c.9071-.90189 2.3778-.90189 3.2849 0z"/><path d="m27.8187 5.18362c.9077.90128.9087 2.36353.0022 3.26603l-17.2588 17.18215c-.90647.9025-2.37721.9035-3.28495.0022-.90773-.9013-.90872-2.3635-.00221-3.266l17.25876-17.18218c.9065-.9025 2.3772-.90348 3.285-.0022z"/><path d="m10.7276 10.6841c.9056.9035.9031 2.3657-.0056 3.266l-6.75949 6.6974c-.90869.9003-2.37943.8978-3.28499-.0056-.905563-.9035-.903032-2.3657.005654-3.2661l6.759476-6.6973c.90868-.90034 2.37942-.89783 3.28495.0056z" opacity=".7"/><path d="m14.8678 4.00024c1.2828 0 2.3228 1.03397 2.3228 2.30944v.23094c0 1.27546-1.04 2.30943-2.3228 2.30943-1.2829 0-2.3229-1.03397-2.3229-2.30943v-.23094c0-1.27547 1.04-2.30944 2.3229-2.30944z" opacity=".5"/></g></svg>`
  },
  {
    id: "boltshift",
    name: "Boltshift",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m20 44c11.0457 0 20-8.9543 20-20s-8.9543-20-20-20c-11.04572 0-20 8.9543-20 20s8.95428 20 20 20zm6.2393-30.6832c.3037-1.0787-.7432-1.7167-1.6993-1.0355l-13.3469 9.5083c-1.0369.7387-.8738 2.2104.245 2.2104h3.5146v-.0272h6.8498l-5.5813 1.9693-2.4605 8.7411c-.3037 1.0788.7431 1.7167 1.6993 1.0355l13.3469-9.5082c1.0369-.7387.8737-2.2105-.245-2.2105h-5.3298z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m20 44c11.0457 0 20-8.9543 20-20s-8.9543-20-20-20c-11.04572 0-20 8.9543-20 20s8.95428 20 20 20zm6.2393-30.6832c.3037-1.0787-.7432-1.7167-1.6993-1.0355l-13.3469 9.5083c-1.0369.7387-.8738 2.2104.245 2.2104h3.5146v-.0272h6.8498l-5.5813 1.9693-2.4605 8.7411c-.3037 1.0788.7431 1.7167 1.6993 1.0355l13.3469-9.5082c1.0369-.7387.8737-2.2105-.245-2.2105h-5.3298z" fill="#fff" fill-rule="evenodd"/></svg>`
  },
  {
    id: "buildingblocks",
    name: "BuildingBlocks",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 37 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m12.8841 4.30945-6.8842 3.97574 6.8891 3.97661 6.8862-3.97575zm8.8919 7.44025-6.887 3.9762-.0007 7.9532 6.8877-3.9771zm2 11.4164-6.8879 3.9772 6.8889 3.9765 6.8871-3.9763zm8.8879 7.4416-6.8868 3.9761v7.9522l6.8868-3.9761zm-10.8868 11.9287v-7.9525l-6.8891-3.9766v7.9525zm-10.8888-18.8569-6.8883-3.9775v-7.9526l6.889 3.9765zm-.0003 4.6187-9.38814-5.4209c-.928127-.5359-1.49986-1.5262-1.49986-2.598v-11.99368c0-.71444.381106-1.37463.999789-1.73193l10.383811-5.996798c.9281-.5359626 2.0716-.5361538 2.9998-.000505l10.3922 5.996973c.619.3572 1.0004 1.01758 1.0004 1.73226v11.41638l9.888 5.7096c.6188.3573.9999 1.0175.9999 1.732v11.9937c0 1.0718-.5718 2.0621-1.5 2.598l-10.3868 5.9969c-.6187.3572-1.381.3572-1.9998.0001l-10.3891-5.9969c-.9283-.5358-1.5002-1.5263-1.5002-2.5982z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 37 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m12.8841 4.30945-6.8842 3.97574 6.8891 3.97661 6.8862-3.97575zm8.8919 7.44025-6.887 3.9762-.0007 7.9532 6.8877-3.9771zm2 11.4164-6.8879 3.9772 6.8889 3.9765 6.8871-3.9763zm8.8879 7.4416-6.8868 3.9761v7.9522l6.8868-3.9761zm-10.8868 11.9287v-7.9525l-6.8891-3.9766v7.9525zm-10.8888-18.8569-6.8883-3.9775v-7.9526l6.889 3.9765zm-.0003 4.6187-9.38814-5.4209c-.928127-.5359-1.49986-1.5262-1.49986-2.598v-11.99368c0-.71444.381106-1.37463.999789-1.73193l10.383811-5.996798c.9281-.5359626 2.0716-.5361538 2.9998-.000505l10.3922 5.996973c.619.3572 1.0004 1.01758 1.0004 1.73226v11.41638l9.888 5.7096c.6188.3573.9999 1.0175.9999 1.732v11.9937c0 1.0718-.5718 2.0621-1.5 2.598l-10.3868 5.9969c-.6187.3572-1.381.3572-1.9998.0001l-10.3891-5.9969c-.9283-.5358-1.5002-1.5263-1.5002-2.5982z" fill="#155eef" fill-rule="evenodd"/></svg>`
  },
  {
    id: "calescence",
    name: "Calescence",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 36 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#1570ef" fill-rule="evenodd"><path d="m35.3721 14v8.0492h-9.9698v-2.2927z"/><path d="m35.3699 14.0001-9.9698 5.7565-7.3513-4.2436v-11.513z" opacity=".9"/><path d="m18.0512 4v11.513l-7.349 4.2436-9.969778-5.7565z" opacity=".8"/><path d="m10.7002 19.7565v8.4868l-9.969731 5.756v-19.9993z" opacity=".7"/><path d="m18.0492 32.4871v11.5129l-17.318731-10.0006 9.969731-5.756z" opacity=".6"/><path d="m35.3699 33.9994-17.3211 10.0006v-11.5129l7.3513-4.2437z" opacity=".5"/><path d="m35.3721 25.9507v8.0487l-9.9698-5.756v-2.2927z" opacity=".4"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 36 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#fff" fill-rule="evenodd"><path d="m35.3721 14v8.0492h-9.9698v-2.2927z"/><path d="m35.3699 14.0001-9.9698 5.7565-7.3513-4.2436v-11.513z" opacity=".9"/><path d="m18.0512 4v11.513l-7.349 4.2436-9.969778-5.7565z" opacity=".8"/><path d="m10.7002 19.7565v8.4868l-9.969731 5.756v-19.9993z" opacity=".7"/><path d="m18.0492 32.4871v11.5129l-17.318731-10.0006 9.969731-5.756z" opacity=".6"/><path d="m35.3699 33.9994-17.3211 10.0006v-11.5129l7.3513-4.2437z" opacity=".5"/><path d="m35.3721 25.9507v8.0487l-9.9698-5.756v-2.2927z" opacity=".4"/></g></svg>`
  },
  {
    id: "capsule",
    name: "Capsule",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="18" fill="#1570ef" r="14"/><circle cx="26" cy="30" fill="#53b1fd" r="14"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><circle cx="14" cy="18" opacity=".7" r="14"/><circle cx="26" cy="30" opacity=".7" r="14"/></g></svg>`
  },
  {
    id: "constellation",
    name: "Constellation",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m16 8 5.0912 10.9088 10.9088 5.0912-10.9088 5.0912-5.0912 10.9088-5.0912-10.9088-10.9088-5.0912 10.9088-5.0912z"/><path d="m20.0469 31.3286 6.3539-1.0932 3.6 9.7646 3.6-9.7646 10.2565 1.7646-6.6564-8 6.6564-8-10.2565 1.7646-3.6-9.7646-3.6 9.7646-6.3539-1.0932 1.0442 2.2374 10.9088 5.0912-10.9088 5.0912z" opacity=".5"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m16 8 5.0912 10.9088 10.9088 5.0912-10.9088 5.0912-5.0912 10.9088-5.0912-10.9088-10.9088-5.0912 10.9088-5.0912z"/><path d="m20.0469 31.3286 6.3539-1.0932 3.6 9.7646 3.6-9.7646 10.2565 1.7646-6.6564-8 6.6564-8-10.2565 1.7646-3.6-9.7646-3.6 9.7646-6.3539-1.0932 1.0442 2.2374 10.9088 5.0912-10.9088 5.0912z" opacity=".5"/></g></svg>`
  },
  {
    id: "codecraft",
    name: "Codecraft",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 9c0-2.76142 2.23858-5 5-5h10c2.7614 0 5 2.23858 5 5v9.8192c.0002.06.0003.1203.0003.1808 0 2.7575 2.2322 4.9936 4.9881 5h.0116 10c2.7614 0 5 2.2386 5 5v10c0 2.7614-2.2386 5-5 5h-10c-2.7614 0-5-2.2386-5-5v-10c0-.0139.0001-.0277.0002-.0416-.0224-2.7422-2.2523-4.9584-4.9999-4.9584-.0129 0-.0258 0-.0387 0h-9.9616c-2.76142 0-5-2.2386-5-5z" fill="#155eef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 9c0-2.76142 2.23858-5 5-5h10c2.7614 0 5 2.23858 5 5v9.8192c.0002.06.0003.1203.0003.1808 0 2.7575 2.2322 4.9936 4.9881 5h.0116 10c2.7614 0 5 2.2386 5 5v10c0 2.7614-2.2386 5-5 5h-10c-2.7614 0-5-2.2386-5-5v-10c0-.0139.0001-.0277.0002-.0416-.0224-2.7422-2.2523-4.9584-4.9999-4.9584-.0129 0-.0258 0-.0387 0h-9.9616c-2.76142 0-5-2.2386-5-5z" fill="#155eef"/></svg>`
  },
  {
    id: "command-r",
    name: "Command+R",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 32 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m18.6667 30.6667c7.3638 0 13.3333-5.9696 13.3333-13.3334 0-7.36376-5.9695-13.3333-13.3333-13.3333h-18.6667v26.6667z" fill="#155eef"/><path d="m0 4 32 40h-21.3333l-10.6667-13.3333z" fill="#2e90fa"/><path d="m21.1488 30.436c-.8042.1515-1.6339.2307-2.4821.2307h-18.6667v-26.6667z" fill="#53b1fd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 32 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m18.6667 30.6667c7.3638 0 13.3333-5.9696 13.3333-13.3334 0-7.36376-5.9695-13.3333-13.3333-13.3333h-18.6667v26.6667z" opacity=".7"/><path d="m0 4 32 40h-21.3333l-10.6667-13.3333z" opacity=".7"/><path d="m21.1488 30.436c-.8042.1515-1.6339.2307-2.4821.2307h-18.6667v-26.6667z" opacity=".7"/></g></svg>`
  },
  {
    id: "contrast-ai",
    name: "ContrastAI",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m20 4c11.0457 0 20 8.9543 20 20s-8.9543 20-20 20-20-8.9543-20-20 8.9543-20 20-20zm15 20c0 8.2843-6.7157 15-15 15v-30c8.2843 0 15 6.7157 15 15z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m20 4c11.0457 0 20 8.9543 20 20s-8.9543 20-20 20-20-8.9543-20-20 8.9543-20 20-20zm15 20c0 8.2843-6.7157 15-15 15v-30c8.2843 0 15 6.7157 15 15z" fill="#fff" fill-rule="evenodd"/></svg>`
  },
  {
    id: "convergence",
    name: "Convergence",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m22.1017 20.8596 9.8995-9.8994-2.1213-2.12137-7.3389 7.33887v-13.1777h-3v13.1777l-7.3388-7.33887-2.1213 2.12137 9.8995 9.8994 1.0606 1.0607zm2.1207 2.1214 9.8995-9.8995 2.1213 2.1213-7.3388 7.3388h13.0956v3h-13.0956l7.3388 7.3389-2.1213 2.1213-9.8995-9.8995-1.0607-1.0607zm-16.26224 12.0208 9.89944-9.8995 1.0607-1.0607-1.0607-1.0606-9.89944-9.8995-2.12133 2.1213 7.33887 7.3388h-13.17574688v3h13.17574688l-7.33887 7.3389zm12.02024-7.7782-9.8995 9.8995 2.1213 2.1213 7.3388-7.3388v13.0944h3v-13.0944l7.3389 7.3388 2.1213-2.1213-9.8995-9.8995-1.0607-1.0607z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m22.1017 20.8596 9.8995-9.8994-2.1213-2.12137-7.3389 7.33887v-13.1777h-3v13.1777l-7.3388-7.33887-2.1213 2.12137 9.8995 9.8994 1.0606 1.0607zm2.1207 2.1214 9.8995-9.8995 2.1213 2.1213-7.3388 7.3388h13.0956v3h-13.0956l7.3388 7.3389-2.1213 2.1213-9.8995-9.8995-1.0607-1.0607zm-16.26224 12.0208 9.89944-9.8995 1.0607-1.0607-1.0607-1.0606-9.89944-9.8995-2.12133 2.1213 7.33887 7.3388h-13.17574688v3h13.17574688l-7.33887 7.3389zm12.02024-7.7782-9.8995 9.8995 2.1213 2.1213 7.3388-7.3388v13.0944h3v-13.0944l7.3389 7.3388 2.1213-2.1213-9.8995-9.8995-1.0607-1.0607z" fill="#155eef" fill-rule="evenodd"/></svg>`
  },
  {
    id: "core-os",
    name: "CoreOS",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m15.2286 4.99951c-3.2154 0-6.18655 1.71539-7.79425 4.5l-5.7735 9.99999c-1.6076941 2.7846-1.607697 6.2154 0 9l5.7735 10c1.6077 2.7846 4.57885 4.5 7.79425 4.5h11.547c3.2154 0 6.1865-1.7154 7.7942-4.5l5.7735-10c1.6077-2.7846 1.6077-6.2154 0-9l-5.7735-9.99999c-1.6077-2.78461-4.5788-4.5-7.7942-4.5zm11.547 5.99999h-7.2169c-1.1547 0-1.8762 1.2499-1.298 2.2494 1.784 3.0838 3.5722 6.1653 5.3536 9.2506.5359.9282.5359 2.0718 0 3-1.7814 3.0854-3.5696 6.1668-5.3536 9.2506-.5782.9995.1433 2.2494 1.298 2.2494h7.2169c1.0718 0 2.0622-.5718 2.5981-1.5l5.7735-10c.5359-.9282.5359-2.0718 0-3l-5.7735-10c-.5359-.9282-1.5263-1.5-2.5981-1.5z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m15.2286 4.99951c-3.2154 0-6.18655 1.71539-7.79425 4.5l-5.7735 9.99999c-1.6076941 2.7846-1.607697 6.2154 0 9l5.7735 10c1.6077 2.7846 4.57885 4.5 7.79425 4.5h11.547c3.2154 0 6.1865-1.7154 7.7942-4.5l5.7735-10c1.6077-2.7846 1.6077-6.2154 0-9l-5.7735-9.99999c-1.6077-2.78461-4.5788-4.5-7.7942-4.5zm11.547 5.99999h-7.2169c-1.1547 0-1.8762 1.2499-1.298 2.2494 1.784 3.0838 3.5722 6.1653 5.3536 9.2506.5359.9282.5359 2.0718 0 3-1.7814 3.0854-3.5696 6.1668-5.3536 9.2506-.5782.9995.1433 2.2494 1.298 2.2494h7.2169c1.0718 0 2.0622-.5718 2.5981-1.5l5.7735-10c.5359-.9282.5359-2.0718 0-3l-5.7735-10c-.5359-.9282-1.5263-1.5-2.5981-1.5z" fill="#155eef" fill-rule="evenodd"/></svg>`
  },
  {
    id: "cubekit",
    name: "Cubekit",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 14.5264v18.9473l17.8947-12.2437v-18.94741z" fill="#155eef" opacity=".5"/><path d="m0 33.4737v-18.9474l17.8947 12.2438v18.9474z" fill="#1570ef" opacity=".5"/><path d="m40 14.5263v18.9474l-17.8947-12.2438v-18.94737z" fill="#155eef" opacity=".5"/><path d="m40 33.4737v-18.9474l-17.8947 12.2438v18.9474z" fill="#1570ef" opacity=".5"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m0 14.5264v18.9473l17.8947-12.2437v-18.94741z" opacity=".5"/><path d="m0 33.4737v-18.9474l17.8947 12.2438v18.9474z" opacity=".5"/><path d="m40 14.5263v18.9474l-17.8947-12.2438v-18.94737z" opacity=".5"/><path d="m40 33.4737v-18.9474l-17.8947 12.2438v18.9474z" opacity=".5"/></g></svg>`
  },
  {
    id: "europa",
    name: "Europa",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m28.6446 39.168c-.6032 1.3404-1.353 2.6531-2.2519 3.7888 7.4581-2.5137 12.9483-9.3054 13.5527-17.4568h-2.6549c-3.2399 0-5.8424 2.5861-6.369 5.7829-.4855 2.9468-1.2621 5.6301-2.2769 7.8851z"/><path d="m22.7724 25.5c3.3921 0 6.167 2.8299 5.5439 6.1643-1.3533 7.2424-4.5667 12.3357-8.3155 12.3357-4.7435 0-8.6299-8.1549-8.975-18.5z"/><path d="m30.9904 17.1502c.4961 3.2267 3.1106 5.8498 6.3752 5.8498h2.6107c-.4123-8.3729-5.9735-15.39183-13.5836-17.95683.8989 1.13575 1.6487 2.44843 2.2519 3.78878 1.0643 2.36505 1.8666 5.20115 2.3458 8.31825z"/><path d="m28.4165 16.8957c.5674 3.3176-2.1954 6.1043-5.5612 6.1043h-11.8434c.2344-10.5811 4.1693-19 8.9889-19 3.8447 0 7.1263 5.35721 8.4157 12.8957z"/><path d="m8.51131 23c.11359-5.4083 1.14536-10.3894 2.84579-14.16805.6031-1.34035 1.3529-2.65303 2.2519-3.78878-7.61011 2.565-13.171316 9.58393-13.5836094 17.95683z"/><path d="m.0562286 25.5c.6043994 8.1514 6.0946514 14.9431 13.5527714 17.4568-.899-1.1357-1.6488-2.4484-2.2519-3.7888-1.6479-3.6619-2.66781-8.4531-2.83264-13.668z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m28.6446 39.168c-.6032 1.3404-1.353 2.6531-2.2519 3.7888 7.4581-2.5137 12.9483-9.3054 13.5527-17.4568h-2.6549c-3.2399 0-5.8424 2.5861-6.369 5.7829-.4855 2.9468-1.2621 5.6301-2.2769 7.8851z"/><path d="m22.7724 25.5c3.3921 0 6.167 2.8299 5.5439 6.1643-1.3533 7.2424-4.5667 12.3357-8.3155 12.3357-4.7435 0-8.6299-8.1549-8.975-18.5z"/><path d="m30.9904 17.1502c.4961 3.2267 3.1106 5.8498 6.3752 5.8498h2.6107c-.4123-8.3729-5.9735-15.39183-13.5836-17.95683.8989 1.13575 1.6487 2.44843 2.2519 3.78878 1.0643 2.36505 1.8666 5.20115 2.3458 8.31825z"/><path d="m28.4165 16.8957c.5674 3.3176-2.1954 6.1043-5.5612 6.1043h-11.8434c.2344-10.5811 4.1693-19 8.9889-19 3.8447 0 7.1263 5.35721 8.4157 12.8957z"/><path d="m8.51131 23c.11359-5.4083 1.14536-10.3894 2.84579-14.16805.6031-1.34035 1.3529-2.65303 2.2519-3.78878-7.61011 2.565-13.171316 9.58393-13.5836094 17.95683z"/><path d="m.0562286 25.5c.6043994 8.1514 6.0946514 14.9431 13.5527714 17.4568-.899-1.1357-1.6488-2.4484-2.2519-3.7888-1.6479-3.6619-2.66781-8.4531-2.83264-13.668z"/></g></svg>`
  },
  {
    id: "feather-dev",
    name: "FeatherDev",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m36.3068 11.4224c-.4322-.4323-.8644-.8645-1.2967-1.2967-1.2966-1.38311-2.6797-2.76621-4.4086-3.63065-1.9882-1.03733-4.1493-.778-6.3104-.778-3.2849 0-11.4971 0-16.33798 0l3.28488 4.40865h19.6228c1.8153 0 3.3713.3458 4.8409 1.2967.2593.0864.5186.0864.6051 0z" fill="#53b1fd"/><path d="m39.9368 18.511c-.4322-.4322-.8645-.8645-1.2967-1.2967-1.2967-1.3831-2.6797-2.7662-4.4086-3.6306-1.9882-1.0374-4.1494-.778-6.3105-.778-2.8526 0-9.6817 0-14.5226 0l3.2849 4.4086h17.8939c1.8154 0 3.3714.3458 4.8409 1.2967.1729.0864.3458.0864.5187 0z" fill="#2e90fa"/><path d="m44 25.4263c-.4322-.4323-.8645-.8645-1.2967-1.2967-1.2966-1.3831-2.6797-2.7662-4.4086-3.6307-1.9882-1.0373-4.1493-.7779-6.3104-.7779-2.6798 0-8.558 0-13.3124 0l3.2848 4.4086h16.5973c1.8153 0 3.3713.3458 4.8409 1.2967.2593.0864.4322.1729.6051 0z" fill="#1570ef"/><path d="m7.60742 37.0961c.43222.4322.86444.8644 1.29666 1.2966 1.29662 1.3831 2.67972 2.7662 4.40862 3.6307 1.9882 1.0373 4.1493.778 6.3104.778h16.338l-3.2849-4.4087c-5.9646 0-15.3006 0-19.6228 0-1.8153 0-3.37132-.3457-4.84087-1.2966-.25933-.0865-.43222-.0865-.60511 0z" fill="#53b1fd"/><path d="m3.97656 30.0079c.43222.4323.86444.8645 1.29666 1.2967 1.29667 1.3831 2.67976 2.7662 4.40864 3.6307 1.98824 1.0373 4.14934.778 6.31044.778h14.5226l-3.2849-4.4087c-5.8782 0-13.9175 0-17.89391 0-1.81532 0-3.37132-.3458-4.84087-1.2967-.17289-.0864-.34577-.0864-.51866 0z" fill="#2e90fa"/><path d="m0 23.0058c.43222.4322.864441.8644 1.29666 1.2966 1.29666 1.3831 2.67977 2.7662 4.40866 3.6307 1.98821 1.0373 4.1493.778 6.31038.778h13.3124l-3.2849-4.4087c-5.7053 0-12.96657 0-16.59722 0-1.81533 0-3.37132-.3458-4.840874-1.2966-.259332-.0865-.432218-.0865-.605106 0z" fill="#1570ef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m36.3068 11.4224c-.4322-.4323-.8644-.8645-1.2967-1.2967-1.2966-1.38311-2.6797-2.76621-4.4086-3.63065-1.9882-1.03733-4.1493-.778-6.3104-.778-3.2849 0-11.4971 0-16.33798 0l3.28488 4.40865h19.6228c1.8153 0 3.3713.3458 4.8409 1.2967.2593.0864.5186.0864.6051 0z" opacity=".5"/><path d="m39.9368 18.511c-.4322-.4322-.8645-.8645-1.2967-1.2967-1.2967-1.3831-2.6797-2.7662-4.4086-3.6306-1.9882-1.0374-4.1494-.778-6.3105-.778-2.8526 0-9.6817 0-14.5226 0l3.2849 4.4086h17.8939c1.8154 0 3.3714.3458 4.8409 1.2967.1729.0864.3458.0864.5187 0z" opacity=".7"/><path d="m44 25.4263c-.4322-.4323-.8645-.8645-1.2967-1.2967-1.2966-1.3831-2.6797-2.7662-4.4086-3.6307-1.9882-1.0373-4.1493-.7779-6.3104-.7779-2.6798 0-8.558 0-13.3124 0l3.2848 4.4086h16.5973c1.8153 0 3.3713.3458 4.8409 1.2967.2593.0864.4322.1729.6051 0z"/><path d="m7.60742 37.0961c.43222.4322.86444.8644 1.29666 1.2966 1.29662 1.3832 2.67972 2.7662 4.40862 3.6307 1.9882 1.0373 4.1493.778 6.3104.778h16.338l-3.2849-4.4087c-5.9646 0-15.3006 0-19.6228 0-1.8153 0-3.37132-.3457-4.84087-1.2966-.25933-.0865-.43222-.0865-.60511 0z" opacity=".5"/><path d="m3.97656 30.0079c.43222.4323.86444.8645 1.29666 1.2967 1.29667 1.3831 2.67976 2.7662 4.40864 3.6307 1.98824 1.0373 4.14934.778 6.31044.778h14.5226l-3.2849-4.4087c-5.8782 0-13.9175 0-17.89391 0-1.81532 0-3.37132-.3458-4.84087-1.2967-.17289-.0864-.34577-.0864-.51866 0z" opacity=".7"/><path d="m0 23.0058c.43222.4322.864441.8644 1.29666 1.2966 1.29666 1.3831 2.67977 2.7662 4.40866 3.6307 1.98821 1.0373 4.1493.778 6.31038.778h13.3124l-3.2849-4.4087c-5.7053 0-12.96657 0-16.59722 0-1.81533 0-3.37132-.3458-4.840874-1.2966-.259332-.0865-.432218-.0865-.605106 0z"/></g></svg>`
  },
  {
    id: "flora-fauna",
    name: "Flora&Fauna",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m13.7146 4c-2.2564 0-4.4203.89634-6.01579 2.49183l-7.69881 7.69877v3.524c0 2.4897 1.06944 4.7296 2.77401 6.2854-1.70457 1.5558-2.77401 3.7957-2.77401 6.2854v3.524l7.69881 7.6988c1.59549 1.5955 3.75939 2.4918 6.01579 2.4918 2.4897 0 4.7296-1.0694 6.2854-2.774 1.5558 1.7046 3.7957 2.774 6.2854 2.774 2.2564 0 4.4203-.8963 6.0158-2.4918l7.6988-7.6988v-3.524c0-2.4897-1.0694-4.7296-2.774-6.2854 1.7046-1.5558 2.774-3.7957 2.774-6.2854v-3.524l-7.6988-7.69877c-1.5955-1.59549-3.7594-2.49183-6.0158-2.49183-2.4897 0-4.7296 1.06944-6.2854 2.77401-1.5558-1.70457-3.7957-2.77401-6.2854-2.77401zm12.0442 20c-.0959-.0875-.19-.1774-.2822-.2696l-5.4766-5.4766-5.4766 5.4766c-.0922.0922-.1863.1821-.2822.2696.0959.0875.19.1774.2822.2696l5.4766 5.4766 5.4766-5.4766c.0922-.0922.1863-.1821.2822-.2696zm-3.5366 9.8094v1.683c0 2.244 1.8192 4.0632 4.0632 4.0632 1.0776 0 2.1111-.4281 2.8731-1.1901l6.3971-6.3971v-1.683c0-2.244-1.8192-4.0632-4.0632-4.0632-1.0776 0-2.1111.4281-2.8731 1.1901zm-4.4444 0-6.3971-6.3971c-.762-.762-1.79546-1.1901-2.87308-1.1901-2.24403 0-4.06318 1.8192-4.06318 4.0632v1.683l6.39706 6.3971c.762.762 1.7955 1.1901 2.8731 1.1901 2.244 0 4.0632-1.8192 4.0632-4.0632zm0-21.3018v1.683l-6.3971 6.3971c-.762.762-1.79546 1.1901-2.87308 1.1901-2.24403 0-4.06318-1.8192-4.06318-4.0632v-1.683l6.39706-6.39708c.762-.76199 1.7955-1.19007 2.8731-1.19007 2.244 0 4.0632 1.81915 4.0632 4.06315zm10.8415 8.0801-6.3971-6.3971v-1.683c0-2.244 1.8192-4.06315 4.0632-4.06315 1.0776 0 2.1111.42808 2.8731 1.19007l6.3971 6.39708v1.683c0 2.244-1.8192 4.0632-4.0632 4.0632-1.0776 0-2.1111-.4281-2.8731-1.1901z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m13.7146 4c-2.2564 0-4.4203.89634-6.01579 2.49183l-7.69881 7.69877v3.524c0 2.4897 1.06944 4.7296 2.77401 6.2854-1.70457 1.5558-2.77401 3.7957-2.77401 6.2854v3.524l7.69881 7.6988c1.59549 1.5955 3.75939 2.4918 6.01579 2.4918 2.4897 0 4.7296-1.0694 6.2854-2.774 1.5558 1.7046 3.7957 2.774 6.2854 2.774 2.2564 0 4.4203-.8963 6.0158-2.4918l7.6988-7.6988v-3.524c0-2.4897-1.0694-4.7296-2.774-6.2854 1.7046-1.5558 2.774-3.7957 2.774-6.2854v-3.524l-7.6988-7.69877c-1.5955-1.59549-3.7594-2.49183-6.0158-2.49183-2.4897 0-4.7296 1.06944-6.2854 2.77401-1.5558-1.70457-3.7957-2.77401-6.2854-2.77401zm12.0442 20c-.0959-.0875-.19-.1774-.2822-.2696l-5.4766-5.4766-5.4766 5.4766c-.0922.0922-.1863.1821-.2822.2696.0959.0875.19.1774.2822.2696l5.4766 5.4766 5.4766-5.4766c.0922-.0922.1863-.1821.2822-.2696zm-3.5366 9.8094v1.683c0 2.244 1.8192 4.0632 4.0632 4.0632 1.0776 0 2.1111-.4281 2.8731-1.1901l6.3971-6.3971v-1.683c0-2.244-1.8192-4.0632-4.0632-4.0632-1.0776 0-2.1111.4281-2.8731 1.1901zm-4.4444 0-6.3971-6.3971c-.762-.762-1.79546-1.1901-2.87308-1.1901-2.24403 0-4.06318 1.8192-4.06318 4.0632v1.683l6.39706 6.3971c.762.762 1.7955 1.1901 2.8731 1.1901 2.244 0 4.0632-1.8192 4.0632-4.0632zm0-21.3018v1.683l-6.3971 6.3971c-.762.762-1.79546 1.1901-2.87308 1.1901-2.24403 0-4.06318-1.8192-4.06318-4.0632v-1.683l6.39706-6.39708c.762-.76199 1.7955-1.19007 2.8731-1.19007 2.244 0 4.0632 1.81915 4.0632 4.06315zm10.8415 8.0801-6.3971-6.3971v-1.683c0-2.244 1.8192-4.06315 4.0632-4.06315 1.0776 0 2.1111.42808 2.8731 1.19007l6.3971 6.39708v1.683c0 2.244-1.8192 4.0632-4.0632 4.0632-1.0776 0-2.1111-.4281-2.8731-1.1901z" fill="#fff" fill-rule="evenodd"/></svg>`
  },
  {
    id: "focal-point",
    name: "FocalPoint",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m10.7788 6.1817 4.6901 17.5036v-19.24382c.3719-.08679.7478-.16322 1.1273-.22897v19.47459l5.2752-19.6871c.3801.03442.7572.07945 1.1309.13479l-5.3176 19.84571 10.5701-18.30794c.3443.15492.6835.31927 1.0172.49274l-10.6095 18.3763 15.1464-15.1465c.2731.25824.5389.52407.7971.7972l-15.1486 15.1487 18.3784-10.6108c.1734.3337.3377.6729.4926 1.0173l-18.3034 10.5675 19.8403-5.3162c.0553.3737.1003.7508.1347 1.1309l-19.6869 5.2751h19.4741c-.0658.3796-.1422.7554-.229 1.1273h-19.2481l17.507 4.691c-.1798.3443-.3693.6827-.5681 1.0149l-17.2257-4.6156 14.3874 8.3066c-.2723.2801-.5528.5522-.8411.8161l-14.1087-8.1457 10.6759 10.6758c-.3377.1973-.6817.385-1.0316.5628l-10.4426-10.4426 6.8421 11.8508c-.3746.1059-.7537.2012-1.1368.2855l-6.6825-11.5744 3.2219 12.0243c-.2872.0122-.5759.0184-.8661.0184-.0991 0-.198-.0007-.2967-.0022l-3.1483-11.7497v11.4569c-.3795-.0657-.7554-.1421-1.1273-.2289v-11.2261l-2.7759 10.36c-.3541-.1396-.7033-.289-1.0471-.4478l2.7337-10.2024-5.13175 8.8884c-.3177-.2034-.62928-.4156-.9344-.6361l5.09135-8.8186-7.1301 7.1302c-.2731-.2583-.53893-.5241-.79717-.7971l7.12787-7.1279-8.81599 5.0899c-.22059-.3051-.4328-.6167-.6363-.9344l8.89259-5.1341-10.20737 2.735c-.15888-.3438-.3083-.693-.44793-1.047l10.3599-2.776h-11.226124c-.086806-.3719-.163256-.7477-.22903-1.1273h11.452154l-11.74511583-3.1471c-.00145443-.0995-.00218417-.1991-.00218417-.2989 0-.2894.00613487-.5774.0182816-.8639l12.0258184 3.2224-11.57621-6.6836c.084291-.3832.179549-.7623.285427-1.1369l11.855683 6.8449-10.44698-10.447c.17774-.3499.36544-.6939.56273-1.0315l10.68025 10.6802-8.14896-14.1144c.26387-.2882.53605-.56863.81617-.84096l8.30809 14.38996-4.61634-17.22828c.33214-.1988.67064-.38826 1.01484-.56802z" fill="#155eef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m10.7788 6.1817 4.6901 17.5036v-19.24382c.3719-.08679.7478-.16322 1.1273-.22897v19.47459l5.2752-19.6871c.3801.03442.7572.07945 1.1309.13479l-5.3176 19.84571 10.5701-18.30794c.3443.15492.6835.31927 1.0172.49274l-10.6095 18.3763 15.1464-15.1465c.2731.25824.5389.52407.7971.7972l-15.1486 15.1487 18.3784-10.6108c.1734.3337.3377.6729.4926 1.0173l-18.3034 10.5675 19.8403-5.3162c.0553.3737.1003.7508.1347 1.1309l-19.6869 5.2751h19.4741c-.0658.3796-.1422.7554-.229 1.1273h-19.2481l17.507 4.691c-.1798.3443-.3693.6827-.5681 1.0149l-17.2257-4.6156 14.3874 8.3066c-.2723.2801-.5528.5522-.8411.8161l-14.1087-8.1457 10.6759 10.6758c-.3377.1973-.6817.385-1.0316.5628l-10.4426-10.4426 6.8421 11.8508c-.3746.1059-.7537.2012-1.1368.2855l-6.6825-11.5744 3.2219 12.0243c-.2872.0122-.5759.0184-.8661.0184-.0991 0-.198-.0007-.2967-.0022l-3.1483-11.7497v11.4569c-.3795-.0657-.7554-.1421-1.1273-.2289v-11.2261l-2.7759 10.36c-.3541-.1396-.7033-.289-1.0471-.4478l2.7337-10.2024-5.13174 8.8884c-.31771-.2034-.62929-.4156-.93441-.6361l5.09135-8.8186-7.1301 7.1302c-.2731-.2583-.53893-.5241-.79717-.7971l7.12787-7.1279-8.81599 5.0899c-.22059-.3051-.4328-.6167-.6363-.9344l8.89259-5.1341-10.20737 2.735c-.15888-.3438-.3083-.693-.44793-1.047l10.3599-2.776h-11.226124c-.086806-.3719-.163256-.7477-.22903-1.1273h11.452154l-11.74511583-3.1471c-.00145443-.0995-.00218417-.1991-.00218417-.2989 0-.2894.00613486-.5774.0182816-.8639l12.0258184 3.2224-11.57621-6.6836c.084291-.3832.179549-.7623.285427-1.1369l11.855683 6.8449-10.44698-10.447c.17774-.3499.36544-.6939.56273-1.0315l10.68025 10.6802-8.14896-14.1144c.26387-.2882.53605-.56863.81617-.84096l8.30809 14.38996-4.61634-17.22828c.33214-.1988.67064-.38826 1.01484-.56802z" fill="#fff"/></svg>`
  },
  {
    id: "foresight",
    name: "Foresight",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 31 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#444ce7"><path d="m-.00195312 17.8433 30.90545312-17.8433-.8189 12.6994-26.32058 15.1961z"/><path d="m3.76367 27.8951 21.73573-12.5492-.8189 12.6994-17.15086 9.902z" opacity=".5"/><path d="m7.52734 37.9477 12.56596-7.255-.8189 12.6994-7.9811 4.6079z" opacity=".25"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 31 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m-.00195312 17.8433 30.90545312-17.8433-.8189 12.6994-26.32058 15.1961z"/><path d="m3.76367 27.8951 21.73573-12.5492-.8189 12.6994-17.15086 9.902z" opacity=".5"/><path d="m7.52734 37.9477 12.56596-7.255-.8189 12.6994-7.9811 4.6079z" opacity=".25"/></g></svg>`
  },
  {
    id: "galileo",
    name: "Galileo",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m29.5411 6.41772c2.6913 5.27688 4.209 11.25228 4.209 17.58218s-1.5177 12.3054-4.2091 17.5823c6.2304-3.3881 10.4593-9.9914 10.4593-17.5823s-4.2289-14.19404-10.4592-17.58218z" fill="#6172f3"/><path d="m20.5481 5.99826c-.9047-1.28153-2.4457-1.9717-3.9913-1.70349-9.40496 1.63214-16.5568 9.83343-16.5568 19.70503 0 9.8717 7.1518 18.0729 16.5567 19.7051 1.5456.2682 3.0867-.4219 3.9913-1.7035 3.5923-5.0889 5.7025-11.2988 5.7025-18.0016 0-6.7027-2.1101-12.9126-5.7024-18.00154z" fill="#444ce7"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m29.5411 6.41772c2.6913 5.27688 4.209 11.25228 4.209 17.58218s-1.5177 12.3054-4.2091 17.5823c6.2304-3.3881 10.4593-9.9914 10.4593-17.5823s-4.2289-14.19404-10.4592-17.58218z" opacity=".7"/><path d="m20.5481 5.99826c-.9047-1.28153-2.4457-1.9717-3.9913-1.70349-9.40496 1.63214-16.5568 9.83343-16.5568 19.70503 0 9.8717 7.1518 18.0729 16.5567 19.7051 1.5456.2682 3.0867-.4219 3.9913-1.7035 3.5923-5.0889 5.7025-11.2988 5.7025-18.0016 0-6.7027-2.1101-12.9126-5.7024-18.00154z"/></g></svg>`
  },
  {
    id: "global-bank",
    name: "GlobalBank",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m27.6627 4h-15.3253l-12.3374 12.3373v15.3253l12.3374 12.3374h15.3253l12.3373-12.3374v-15.3253zm-13.2049 27.8554-7.90357-7.9036 7.90357-7.9036c2.988-2.988 7.9037-2.988 10.8916 0l7.9036 7.9036-7.9036 7.9036c-2.9879 2.988-7.8072 2.988-10.8916 0z" fill="#444ce7"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m27.6627 4h-15.3253l-12.3374 12.3373v15.3253l12.3374 12.3374h15.3253l12.3373-12.3374v-15.3253zm-13.2049 27.8554-7.90357-7.9036 7.90357-7.9036c2.988-2.988 7.9037-2.988 10.8916 0l7.9036 7.9036-7.9036 7.9036c-2.9879 2.988-7.8072 2.988-10.8916 0z" fill="#fff"/></svg>`
  },
  {
    id: "hexsmith",
    name: "Hexsmith",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m9.72461 41.7983h18.49589c1.2717 0 2.4469-.6785 3.0827-1.7798l4.1102-7.1191h-20.5481z" opacity=".7"/><path d="m25.1445 15.1015h-20.55661l4.11021-7.11909c.63585-1.10133 1.811-1.77977 3.0827-1.77977h18.4959z" opacity=".4"/><path d="m39.5272 25.7801c.6358-1.1014.6358-2.4582 0-3.5596l-4.1102-7.1191-5.1378 8.8989h-20.55068l5.13718 8.8989h20.5481l.0016-.0027.0016.0027z" opacity=".4"/><path d="m14.8634 32.8992-5.13775-8.8988-5.13776 8.8988 5.13776 8.8989z"/><path d="m25.1445 15.1014h-20.55593l-4.108166 7.1192c-.635516 1.1013-.635318 2.458.000521 3.5591l4.111125 7.1195 5.13775-8.8989h20.55l.0013-.0021z" opacity=".7"/><path d="m35.4181 15.1015-5.1378-8.89886-5.1377 8.89886 5.1377 8.8989z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m9.72461 41.7983h18.49589c1.2717 0 2.4469-.6785 3.0827-1.7798l4.1102-7.1191h-20.5481z" opacity=".7"/><path d="m25.1445 15.1015h-20.55661l4.11021-7.11909c.63585-1.10133 1.811-1.77977 3.0827-1.77977h18.4959z" opacity=".4"/><path d="m39.5272 25.7801c.6358-1.1013.6358-2.4582 0-3.5596l-4.1102-7.1191-5.1378 8.8989h-20.55068l5.13718 8.8989h20.5481l.0016-.0027.0016.0027z" opacity=".4"/><path d="m14.8634 32.8992-5.13775-8.8988-5.13776 8.8988 5.13776 8.8989z"/><path d="m25.1445 15.1014h-20.55593l-4.108166 7.1192c-.635516 1.1013-.635318 2.458.000521 3.5591l4.111125 7.1195 5.13775-8.8989h20.55l.0013-.0022z" opacity=".7"/><path d="m35.4181 15.1015-5.1378-8.89886-5.1377 8.89886 5.1377 8.8989z"/></g></svg>`
  },
  {
    id: "hourglass",
    name: "Hourglass",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 30 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 41.2222c0 1.5341 1.24365 2.7778 2.77778 2.7778h24.44442c1.5341 0 2.7778-1.2437 2.7778-2.7778v-7.2222c0-8.2843-6.7157-15-15-15-8.28427 0-15 6.7157-15 15z" fill="#1570ef"/><path d="m0 6.77778c0-1.53413 1.24365-2.77778 2.77778-2.77778h24.44442c1.5341 0 2.7778 1.24365 2.7778 2.77778v7.22222c0 8.2843-6.7157 15-15 15-8.28427 0-15-6.7157-15-15z" fill="#53b1fd" opacity=".5"/></svg>`,
    darkSvg: `<svg width="100%" height="100%" viewBox="0 0 30 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path opacity="0.7" d="M0 41.2222C0 42.7563 1.24365 44 2.77778 44H27.2222C28.7563 44 30 42.7563 30 41.2222V34C30 25.7157 23.2843 19 15 19C6.71573 19 0 25.7157 0 34V41.2222Z" fill="white"/><path opacity="0.7" d="M0 6.77778C0 5.24365 1.24365 4 2.77778 4H27.2222C28.7563 4 30 5.24365 30 6.77778V14C30 22.2843 23.2843 29 15 29C6.71573 29 0 22.2843 0 14V6.77778Z" fill="white"/></svg>`
  },
  {
    id: "kintsugi",
    name: "Kintsugi",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m20 4 4.2861 9.6525 9.856-3.79464-3.7946 9.85604 9.6525 4.2861-9.6525 4.2861 3.7946 9.856-9.856-3.7946-4.2861 9.6525-4.2861-9.6525-9.85604 3.7946 3.79469-9.856-9.65255-4.2861 9.65255-4.2861-3.79469-9.85604 9.85604 3.79464z" fill="#155eef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m20 4 4.2861 9.6525 9.856-3.79464-3.7946 9.85604 9.6525 4.2861-9.6525 4.2861 3.7946 9.856-9.856-3.7946-4.2861 9.6525-4.2861-9.6525-9.85604 3.7946 3.79469-9.856-9.65255-4.2861 9.65255-4.2861-3.79469-9.85604 9.85604 3.79464z" fill="#155eef"/></svg>`
  },
  {
    id: "layers",
    name: "Layers",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m5.03741 15.4637c.7506-2.8008 3.62961-5.67985 6.43049-6.43044l17.4617-4.67957c2.8009-.7506 4.4629.91146 3.7123 3.71231l-4.6795 17.4617c-.7506 2.8009-3.6297 5.6799-6.4305 6.4305l-17.46175 4.6796c-2.80085.7505-4.462904-.9115-3.712306-3.7124z" opacity=".7"/><path d="m12.0355 22.4642c.7506-2.8008 3.6296-5.6799 6.4304-6.4305l17.4617-4.6795c2.8009-.7506 4.4629.9114 3.7123 3.7123l-4.6795 17.4617c-.7506 2.8009-3.6296 5.6799-6.4305 6.4305l-17.4617 4.6795c-2.80085.7506-4.46291-.9114-3.71231-3.7123z" opacity=".7"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m5.03741 15.4637c.7506-2.8008 3.62961-5.67985 6.43049-6.43044l17.4617-4.67957c2.8009-.7506 4.4629.91146 3.7123 3.71231l-4.6795 17.4617c-.7506 2.8009-3.6297 5.6799-6.4305 6.4305l-17.46175 4.6795c-2.80085.7506-4.462904-.9114-3.712306-3.7123z" opacity=".7"/><path d="m12.0355 22.4642c.7506-2.8008 3.6296-5.6799 6.4304-6.4305l17.4617-4.6795c2.8009-.7506 4.4629.9114 3.7123 3.7123l-4.6795 17.4617c-.7506 2.8009-3.6296 5.6799-6.4305 6.4305l-17.4617 4.6795c-2.80085.7506-4.46291-.9114-3.71231-3.7123z" opacity=".7"/></g></svg>`
  },
  {
    id: "lightspeed",
    name: "Lightspeed",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 24c0 6.6274 5.37258 12 12 12v-12c0 6.6274 5.3726 12 12 12v-12c0 6.6274 5.3726 12 12 12s12-5.3726 12-12-5.3726-12-12-12-12 5.3726-12 12v-12c-6.6274 0-12 5.3726-12 12v-12c-6.62742 0-12 5.3726-12 12z" fill="#155eef"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m0 24c0 6.6274 5.37258 12 12 12v-12c0 6.6274 5.3726 12 12 12v-12c0 6.6274 5.3726 12 12 12s12-5.3726 12-12-5.3726-12-12-12-12 5.3726-12 12v-12c-6.6274 0-12 5.3726-12 12v-12c-6.62742 0-12 5.3726-12 12z" fill="#155eef"/></svg>`
  },
  {
    id: "luminescence",
    name: "Luminescence",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m32.3008 36h-.1015c-.0261.0402-.0523.0804-.0787.1204-2.7604 1.8201-6.0668 2.8794-9.6206 2.8794-9.665 0-17.5-7.835-17.5-17.5 0-3.5538 1.05931-6.8602 2.87939-9.6206.04009-.0264.08029-.0527.12061-.0788v-.1017c-.04056.0599-.08077.1201-.12061.1805-4.7469 3.1299-7.87939 8.5094-7.87939 14.6206 0 9.665 7.83502 17.5 17.5 17.5 6.1112 0 11.4907-3.1325 14.6206-7.8794.0603-.0398.1204-.0799.1802-.1204z"/><g opacity=".5"><path d="m40.0003 21.5c0 6.1112-3.1325 11.4907-7.8794 14.6206 1.8201-2.7604 2.8794-6.0668 2.8794-9.6206 0-9.665-7.835-17.5-17.5-17.5-3.5538 0-6.8602 1.0593-9.6206 2.8794 3.1299-4.74691 8.5094-7.8794 14.6206-7.8794 9.665 0 17.5 7.835 17.5 17.5z"/><path d="m32.0003 36.1994c.0403-.0261.0805-.0524.1206-.0788-.0398.0604-.08.1206-.1206.1805z"/><path d="m7.80088 12c.02611-.0403.05238-.0805.07882-.1206-.06043.0398-.12059.08-.18048.1206z"/></g></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m32.3008 36h-.1015c-.0261.0402-.0523.0804-.0787.1204-2.7604 1.8201-6.0668 2.8794-9.6206 2.8794-9.665 0-17.5-7.835-17.5-17.5 0-3.5538 1.05931-6.8602 2.87939-9.6206.04009-.0264.08029-.0527.12061-.0788v-.1017c-.04056.0599-.08077.1201-.12061.1805-4.7469 3.1299-7.87939 8.5094-7.87939 14.6206 0 9.665 7.83502 17.5 17.5 17.5 6.1112 0 11.4907-3.1325 14.6206-7.8794.0603-.0398.1204-.0799.1802-.1204z"/><g opacity=".5"><path d="m40.0003 21.5c0 6.1112-3.1325 11.4907-7.8794 14.6206 1.8201-2.7604 2.8794-6.0668 2.8794-9.6206 0-9.665-7.835-17.5-17.5-17.5-3.5538 0-6.8602 1.0593-9.6206 2.8794 3.1299-4.74691 8.5094-7.8794 14.6206-7.8794 9.665 0 17.5 7.835 17.5 17.5z"/><path d="m32.0003 36.1994c.0403-.0261.0805-.0524.1206-.0788-.0398.0604-.08.1206-.1206.1805z"/><path d="m7.80088 12c.02611-.0403.05238-.0805.07882-.1206-.06043.0398-.12059.08-.18048.1206z"/></g></g></svg>`
  },
  {
    id: "luminous",
    name: "Luminous",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m14.1061 19.6565c5.499-2.6299 9.8025-7.0929 12.2731-12.67168-1.5939-1.67362-3.666-2.86907-5.8975-3.58634l-1.1954-.39848c-.0797.15939-.1594.39849-.1594.55788-1.9127 5.41936-5.8178 9.80262-11.07766 12.27322-3.66599 1.7533-6.37564 4.9412-7.650763 8.7666l-.398477 1.1955c.159391.0797.39848.1593.557871.1593 1.514209.5579 3.028419 1.2752 4.462939 2.1519 1.99238-3.5864 5.18019-6.6148 9.08529-8.4479z"/><path d="m37.2173 19.9753c-2.9487 4.463-7.0132 8.0494-12.034 10.4403-4.0645 1.9127-7.1726 5.499-8.6071 9.8026l-.3985 1.3549c1.5142 1.3548 3.3472 2.3909 5.3396 3.0284l1.1955.3985c.0796-.1594.1593-.3985.1593-.5579 1.9127-5.4193 5.8178-9.8026 11.0777-12.2732 3.666-1.7533 6.4553-4.9412 7.6507-8.7666l.3985-1.1954c-1.6736-.4782-3.2675-1.2752-4.7817-2.2316z" opacity=".6"/><path d="m12.9903 37.4284c1.9924-4.7818 5.6584-8.6869 10.3604-10.9184 4.3035-2.0721 7.8898-5.26 10.3604-9.1651-1.833-1.7533-3.3472-3.7458-4.463-6.1366-2.9487 5.4193-7.571 9.8026-13.2294 12.5123-3.2675 1.5142-5.8974 4.1442-7.49136 7.3321 1.75326 1.6736 3.18786 3.7457 4.30356 6.0569 0 0 .0797.1594.1594.3188z" opacity=".8"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 42 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m14.1061 19.6565c5.499-2.6299 9.8025-7.0929 12.2731-12.67168-1.5939-1.67362-3.666-2.86907-5.8975-3.58634l-1.1954-.39848c-.0797.15939-.1594.39849-.1594.55788-1.9127 5.41936-5.8178 9.80262-11.07766 12.27322-3.66599 1.7533-6.37564 4.9412-7.650763 8.7666l-.398477 1.1955c.159391.0797.39848.1593.557871.1593 1.514209.5579 3.028419 1.2752 4.462939 2.1519 1.99238-3.5864 5.18019-6.6148 9.08529-8.4479z"/><path d="m37.2173 19.9753c-2.9487 4.463-7.0132 8.0494-12.034 10.4403-4.0645 1.9127-7.1726 5.499-8.6071 9.8026l-.3985 1.3549c1.5142 1.3548 3.3472 2.3909 5.3396 3.0284l1.1955.3985c.0796-.1594.1593-.3985.1593-.5579 1.9127-5.4193 5.8178-9.8026 11.0777-12.2732 3.666-1.7533 6.4553-4.9412 7.6507-8.7666l.3985-1.1954c-1.6736-.4782-3.2675-1.2752-4.7817-2.2316z" opacity=".5"/><path d="m12.9903 37.4284c1.9924-4.7818 5.6584-8.6869 10.3604-10.9184 4.3035-2.0721 7.8898-5.26 10.3604-9.1651-1.833-1.7533-3.3472-3.7458-4.463-6.1366-2.9487 5.4193-7.571 9.8026-13.2294 12.5123-3.2675 1.5142-5.8974 4.1442-7.49136 7.3321 1.75326 1.6736 3.18786 3.7457 4.30356 6.0569 0 0 .0797.1594.1594.3188z" opacity=".7"/></g></svg>`
  },
  {
    id: "pollinate",
    name: "Pollinate",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 38 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m25.0008 24c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m25.0008 10c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6c0-3.31371 2.6863-6 6-6s6 2.68629 6 6z"/><path d="m37.125 31c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m37.127 17.0002c0 3.3137-2.6863 6-6 6-3.3138 0-6-2.6863-6-6s2.6862-6 6-6c3.3137 0 6 2.6863 6 6z"/><path d="m25.0008 38c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m12.877 17c0 3.3137-2.6863 6-6.00005 6-3.31371 0-5.999997-2.6863-5.999997-6s2.686287-6 5.999997-6c3.31375 0 6.00005 2.6863 6.00005 6z"/><path d="m12.875 30.9997c0 3.3137-2.6863 6-6 6-3.31371 0-6-2.6863-6-6s2.68629-6 6-6c3.3137 0 6 2.6863 6 6z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 38 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m25.0008 24c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m25.0008 10c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6c0-3.31371 2.6863-6 6-6s6 2.68629 6 6z"/><path d="m37.125 31c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m37.127 17.0002c0 3.3137-2.6863 6-6 6-3.3138 0-6-2.6863-6-6s2.6862-6 6-6c3.3137 0 6 2.6863 6 6z"/><path d="m25.0008 38c0 3.3137-2.6863 6-6 6s-6-2.6863-6-6 2.6863-6 6-6 6 2.6863 6 6z"/><path d="m12.877 17c0 3.3137-2.6863 6-6.00005 6-3.31371 0-5.999997-2.6863-5.999997-6s2.686287-6 5.999997-6c3.31375 0 6.00005 2.6863 6.00005 6z"/><path d="m12.875 30.9997c0 3.3137-2.6863 6-6 6-3.31371 0-6-2.6863-6-6s2.68629-6 6-6c3.3137 0 6 2.6863 6 6z"/></g></svg>`
  },
  {
    id: "polymath",
    name: "Polymath",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 38 48" width="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="19" cy="24" r="16" stroke="#155eef" stroke-width="6"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 38 48" width="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="19" cy="24" r="16" stroke="#fff" stroke-width="6"/></svg>`
  },
  {
    id: "prometheus",
    name: "Prometheus",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m10.4993 16.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h19c2.2091 0 4-1.7909 4-4v-3h-22.5c-3.0376 0-5.5 2.46243-5.5 5.5 0 3.0376-2.4631 5.5-5.5007 5.5z"/><path d="m10.4993 26.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h13c2.2091 0 4-1.7909 4-4v-3h-16.5c-3.0376 0-5.5 2.4624-5.5 5.5s-2.4631 5.5-5.5007 5.5z" opacity=".7"/><path d="m10.4993 36.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h7.8c1.7673 0 3.2-1.4327 3.2-3.2v-3.8h-10.5c-3.0376 0-5.5 2.4624-5.5 5.5s-2.4631 5.5-5.5007 5.5z" opacity=".5"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m10.4993 16.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h19c2.2091 0 4-1.7909 4-4v-3h-22.5c-3.0376 0-5.5 2.46243-5.5 5.5 0 3.0376-2.4631 5.5-5.5007 5.5z"/><path d="m10.4993 26.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h13c2.2091 0 4-1.7909 4-4v-3h-16.5c-3.0376 0-5.5 2.4624-5.5 5.5s-2.4631 5.5-5.5007 5.5z" opacity=".75"/><path d="m10.4993 36.5h-7.29875c-1.76731 0-3.20055 1.4327-3.20055 3.2v2.8h11c2.7614 0 5-2.2386 5-5s2.2386-5 5-5h7.8c1.7673 0 3.2-1.4327 3.2-3.2v-3.8h-10.5c-3.0376 0-5.5 2.4624-5.5 5.5s-2.4631 5.5-5.5007 5.5z" opacity=".5"/></g></svg>`
  },
  {
    id: "quantum",
    name: "Quantum",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 39 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m9 23c0-5.5228 4.4772-10 10-10 5.5229 0 10 4.4772 10 10h9c0-10.4934-8.5066-19-19-19-10.49341 0-18.99999908 8.5066-19 19s8.50659 19 19 19v-9c-5.5228 0-10-4.4771-10-10z"/><path d="m29 23c0 5.5228 4.4772 10 10 10v9c-10.4934 0-19-8.5066-19-19z" opacity=".5"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 39 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m9 23c0-5.5228 4.4772-10 10-10 5.5229 0 10 4.4772 10 10h9c0-10.4934-8.5066-19-19-19-10.49341 0-18.99999908 8.5066-19 19s8.50659 19 19 19v-9c-5.5228 0-10-4.4771-10-10z"/><path d="m29 23c0 5.5228 4.4772 10 10 10v9c-10.4934 0-19-8.5066-19-19z" opacity=".5"/></g></svg>`
  },
  {
    id: "quartz-ai",
    name: "QuartzAI",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m17.6264 6.5h14.8017l11.4661 18.6661-15.7786 15.9489-22.68835-4.0459-5.157719-19.2098zm.5273 4.9692-6.816 15.105 6.4504 5.3411 8.8246-3.7975zm12.3276 15.3 9.2139-2.7073-7.1983-11.7184zm-.6163-17.2692h-9.3468l7.3309 14.4284zm6.9795 18.5263-6.779 1.9919-.5448 5.4109zm-10.5005 9.008.5824-5.7856-6.0573 2.6067zm-6.8394-.5022-10.91261-1.9459 1.64741-5.0264 6.438 5.3308zm-11.69782-9.1824-2.7037-3.0571 1.66868 6.215zm-3.53432-8.5248 4.81433 5.4437 5.50351-12.1963z" fill="#155eef" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 44 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m17.6264 6.5h14.8017l11.4661 18.6661-15.7786 15.9489-22.68835-4.0459-5.157719-19.2098zm.5273 4.9692-6.816 15.105 6.4504 5.3411 8.8246-3.7975zm12.3276 15.3 9.2139-2.7073-7.1983-11.7184zm-.6163-17.2692h-9.3468l7.3309 14.4284zm6.9795 18.5263-6.779 1.9919-.5448 5.4109zm-10.5005 9.008.5824-5.7856-6.0573 2.6067zm-6.8394-.5022-10.91261-1.9459 1.64741-5.0264 6.438 5.3308zm-11.69782-9.1824-2.7037-3.0571 1.66868 6.215zm-3.53432-8.5248 4.81433 5.4437 5.50351-12.1963z" fill="#fff" fill-rule="evenodd"/></svg>`
  },
  {
    id: "radius",
    name: "Radius",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#155eef" fill-rule="evenodd"><path d="m18.5 19v-15h3v15z"/><path d="m18.5 44v-15h3v15z"/><path d="m22.4754 19.404 10.6066-10.60664 2.1214 2.12134-8.4853 8.4853z"/><path d="m4.79776 37.0816 10.60664-10.6066 2.1213 2.1214-10.60662 10.6066z"/><path d="m26.7178 28.5963 8.4853 8.4852-2.1213 2.1214-10.6066-10.6066z"/><path d="m6.91885 8.79727 10.60665 10.60663-2.1214 2.1213-10.60657-10.6066z"/><path d="m18.5 22.5h21.5v3h-21.5z"/><path d="m.00000026 22.5h14.99999974v3h-15z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g clip-rule="evenodd" fill="#155eef" fill-rule="evenodd"><path d="m18.5 19v-15h3v15z"/><path d="m18.5 44v-15h3v15z"/><path d="m22.4754 19.404 10.6066-10.60664 2.1214 2.12134-8.4853 8.4853z"/><path d="m4.79776 37.0816 10.60664-10.6066 2.1213 2.1214-10.60662 10.6066z"/><path d="m26.7178 28.5963 8.4853 8.4852-2.1213 2.1214-10.6066-10.6066z"/><path d="m6.91885 8.79727 10.60665 10.60663-2.1214 2.1213-10.60657-10.6066z"/><path d="m18.5 22.5h21.5v3h-21.5z"/><path d="m.00000026 22.5h14.99999974v3h-15z"/></g></svg>`
  },
  {
    id: "railspeed",
    name: "Railspeed",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 36 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m0 7.5h28.8c2.5202 0 3.7804 0 4.743.49047.8467.43143 1.5351 1.11984 1.9665 1.96657.4905.96256.4905 2.22276.4905 4.74296v1.8h-28.8c-2.52024 0-3.78035 0-4.74296-.4905-.84673-.4314-1.535139-1.1198-1.966569-1.9665-.490471-.9626-.490471-2.2228-.490471-4.743z"/><path d="m0 28.5h28.8c2.5202 0 3.7804 0 4.743-.4905.8467-.4314 1.5351-1.1198 1.9665-1.9665.4905-.9626.4905-2.2228.4905-4.743v-1.8h-28.8c-2.52024 0-3.78035 0-4.74296.4905-.84673.4314-1.535139 1.1198-1.966569 1.9665-.490471.9626-.490471 2.2228-.490471 4.743z"/><path d="m14 31.5h14.8c2.5202 0 3.7804 0 4.743.4905.8467.4314 1.5351 1.1198 1.9665 1.9665.4905.9626.4905 2.2228.4905 4.743v1.8h-14.8c-2.5202 0-3.7804 0-4.743-.4905-.8467-.4314-1.5351-1.1198-1.9665-1.9665-.4905-.9626-.4905-2.2228-.4905-4.743z"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 36 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m0 7.5h28.8c2.5202 0 3.7804 0 4.743.49047.8467.43143 1.5351 1.11984 1.9665 1.96657.4905.96256.4905 2.22276.4905 4.74296v1.8h-28.8c-2.52024 0-3.78035 0-4.74296-.4905-.84673-.4314-1.535139-1.1198-1.966569-1.9665-.490471-.9626-.490471-2.2228-.490471-4.743z"/><path d="m0 28.5h28.8c2.5202 0 3.7804 0 4.743-.4905.8467-.4314 1.5351-1.1198 1.9665-1.9665.4905-.9626.4905-2.2228.4905-4.743v-1.8h-28.8c-2.52024 0-3.78035 0-4.74296.4905-.84673.4314-1.535139 1.1198-1.966569 1.9665-.490471.9626-.490471 2.2228-.490471 4.743z"/><path d="m14 31.5h14.8c2.5202 0 3.7804 0 4.743.4905.8467.4314 1.5351 1.1198 1.9665 1.9665.4905.9626.4905 2.2228.4905 4.743v1.8h-14.8c-2.5202 0-3.7804 0-4.743-.4905-.8467-.4314-1.5351-1.1198-1.9665-1.9665-.4905-.9626-.4905-2.2228-.4905-4.743z"/></g></svg>`
  },
  {
    id: "refractional",
    name: "Refractional",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m48 11h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z" fill="#444ce7"/><path d="m46 19h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z" fill="#155eef"/><path d="m44 27h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z" fill="#8098f9"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m48 11h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z"/><path d="m46 19h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z"/><path d="m44 27h-17.0775c-1.2151 0-2.3644.5524-3.1235 1.5012l-1.598 1.9976c-.7591.9488-1.9084 1.5012-3.1235 1.5012h-15.0775l-4 5h17.0775c1.2151 0 2.3644-.5524 3.1235-1.5012l1.598-1.9976c.7591-.9488 1.9084-1.5012 3.1235-1.5012h15.0775z"/></g></svg>`
  },
  {
    id: "renaissance",
    name: "Renaissance",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 35 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m12.7018 5c1.841 0 3.4172 1.31967 3.7408 3.13199l.4648 2.60271c.3236 1.8123 1.8998 3.132 3.7408 3.132h3.1518c4.8969 0 8.8667 3.9697 8.8667 8.8666 0 2.9333-1.4244 5.5339-3.6191 7.1479.92.3126 1.6466.809 2.1799 1.461.549.7191.9411 1.7411 1.1764 3.028.0392.3406.0883.6718.1373 1.003s.098.6624.1372 1.003c.0408.3538.0709.6566.096.9083.0232.233.042.4223.0609.5679.0784 1.0598.1961 1.9303.3529 2.5738.1655.9048.4994 1.7867.9727 2.5738h-6.6982c-.3137-.6056-.5098-1.3248-.6666-2.1196-.1349-.6836-.2408-1.5352-.3676-2.5548-.0207-.1659-.0418-.3362-.0638-.5111l-.2353-1.7411c-.1961-1.3247-.4314-2.271-.6667-2.8766-.2745-.5677-.7058-.9841-1.2941-1.2112-.6274-.2271-1.5686-.3856-2.9019-.3856h-.3018c-1.841 0-3.4172-1.3197-3.7408-3.132l-.4648-2.6027c-.3236-1.8123-1.8998-3.132-3.7408-3.132h-5.68517v10.1334h-6.33333v-27.8667zm13.6315 17.7333c0 1.3992-1.1342 2.5334-2.5333 2.5334h-3.1518c-1.841 0-3.4172-1.3197-3.7408-3.132l-.4648-2.6027c-.3236-1.8123-1.8998-3.132-3.7408-3.132h-5.36847v-5.0667h5.68517c1.841 0 3.4172 1.3197 3.7408 3.132l.4647 2.6027c.3237 1.8123 1.8999 3.132 3.7409 3.132h2.8351c1.3991 0 2.5333 1.1342 2.5333 2.5333z" fill="#1849a9" fill-rule="evenodd"/></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 35 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m12.7018 5c1.841 0 3.4172 1.31967 3.7408 3.13199l.4648 2.60271c.3236 1.8123 1.8998 3.132 3.7408 3.132h3.1518c4.8969 0 8.8667 3.9697 8.8667 8.8666 0 2.9333-1.4244 5.5339-3.6191 7.1479.92.3126 1.6466.809 2.1799 1.461.549.7191.9411 1.7411 1.1764 3.028.0392.3406.0883.6718.1373 1.003s.098.6624.1372 1.003c.0408.3538.0709.6566.096.9083.0232.233.042.4223.0609.5679.0784 1.0598.1961 1.9303.3529 2.5738.1655.9048.4994 1.7867.9727 2.5738h-6.6982c-.3137-.6056-.5098-1.3247-.6666-2.1196-.1349-.6836-.2408-1.5352-.3676-2.5548-.0207-.1659-.0418-.3362-.0638-.5111l-.2353-1.7411c-.1961-1.3247-.4314-2.271-.6667-2.8766-.2745-.5677-.7058-.9841-1.2941-1.2112-.6274-.2271-1.5686-.3856-2.9019-.3856h-.3018c-1.841 0-3.4172-1.3197-3.7408-3.132l-.4648-2.6027c-.3236-1.8123-1.8998-3.132-3.7408-3.132h-5.68517v10.1334h-6.33333v-27.8667zm13.6315 17.7333c0 1.3992-1.1342 2.5334-2.5333 2.5334h-3.1518c-1.841 0-3.4172-1.3197-3.7408-3.132l-.4648-2.6027c-.3236-1.8123-1.8998-3.132-3.7408-3.132h-5.36847v-5.0667h5.68517c1.841 0 3.4172 1.3197 3.7408 3.132l.4647 2.6027c.3237 1.8123 1.8999 3.132 3.7409 3.132h2.8351c1.3991 0 2.5333 1.1342 2.5333 2.5333z" fill="#fff" fill-rule="evenodd"/></svg>`
  },
  {
    id: "sisyphus",
    name: "Sisyphus",
    lightSvg: `<svg fill="none" height="100%" viewBox="0 0 32 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m.599609 19.2002h9.59998v9.59999h-9.59998z"/><path d="m31.4004 28.7998h9.6v9.59999h-9.6z" transform="matrix(-1 0 -0 -1 62.8008 57.5996)"/><path d="m10.1992 19.2001 11.6-9.6v9.6l-11.6 9.6z" opacity=".2"/><path d="m21.7988 28.7999-11.6 9.6v-9.6l11.6-9.6z" opacity=".5"/><path d="m.599609 19.2 21.199991-19.2v9.59999l-11.6 9.60001z" opacity=".6"/><path d="m31.4004 28.8-21.2 19.2v-9.6l11.6-9.6z" opacity=".7"/></g></svg>`,
    darkSvg: `<svg fill="none" height="100%" viewBox="0 0 32 48" width="100%" xmlns="http://www.w3.org/2000/svg"><g fill="#155eef"><path d="m.599609 19.2002h9.59998v9.59999h-9.59998z"/><path d="m31.4004 28.7998h9.6v9.59999h-9.6z" transform="matrix(-1 0 -0 -1 62.8008 57.5996)"/><path d="m10.1992 19.2001 11.6-9.6v9.6l-11.6 9.6z" opacity=".2"/><path d="m21.7988 28.7999-11.6 9.6v-9.6l11.6-9.6z" opacity=".5"/><path d="m.599609 19.2 21.199991-19.2v9.59999l-11.6 9.60001z" opacity=".6"/><path d="m31.4004 28.8-21.2 19.2v-9.6l11.6-9.6z" opacity=".7"/></g></svg>`
  },
  {
    id: "solaris-energy",
    name: "Solaris Energy",
    lightSvg: `<svg width="100%" height="100%" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 4V16.3604C20 19.087 16.6569 20.3998 14.8016 18.4017L7 10M40 24H27.6396C24.913 24 23.6002 20.6569 25.5983 18.8016L34 11M20 44V31.6396C20 28.913 23.3431 27.6002 25.1984 29.5983L33 38M0 24L12.3604 24C15.087 24 16.3998 27.3431 14.4017 29.1984L6 37" stroke="#175CD3" stroke-width="4"/></svg>`,
    darkSvg: `<svg width="100%" height="100%" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 4V16.3604C20 19.087 16.6569 20.3998 14.8016 18.4017L7 10M40 24H27.6396C24.913 24 23.6002 20.6569 25.5983 18.8016L34 11M20 44V31.6396C20 28.913 23.3431 27.6002 25.1984 29.5983L33 38M0 24L12.3604 24C15.087 24 16.3998 27.3431 14.4017 29.1984L6 37" stroke="white" stroke-width="4"/></svg>`
  }
];

// features/platform/store-settings/lib/store-logo.ts
var DEFAULT_STORE_LOGO_ICON = LOGO_ICONS.find((icon) => icon.id === "contrast-ai").lightSvg;
var DEFAULT_STORE_LOGO_COLOR = "330";
function normalizeStoreLogoColor(value) {
  const numeric = Number.parseFloat(String(value ?? DEFAULT_STORE_LOGO_COLOR));
  if (!Number.isFinite(numeric)) return DEFAULT_STORE_LOGO_COLOR;
  return String((numeric % 360 + 360) % 360);
}

// features/keystone/utils/storeLogo.ts
var ALLOWED_ELEMENTS = /* @__PURE__ */ new Set([
  "svg",
  "g",
  "path",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "title",
  "desc"
]);
var ALLOWED_ATTRIBUTES = /* @__PURE__ */ new Set([
  "xmlns",
  "fill",
  "fill-rule",
  "clip-rule",
  "height",
  "width",
  "viewbox",
  "d",
  "clip-path",
  "id",
  "x1",
  "x2",
  "y1",
  "y2",
  "gradientunits",
  "gradienttransform",
  "offset",
  "stop-color",
  "stop-opacity",
  "opacity",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "transform",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "points",
  "role",
  "aria-hidden",
  "aria-label",
  "preserveaspectratio"
]);
var ATTRIBUTE_PATTERN = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g;
var TAG_PATTERN = /<\/?\s*([A-Za-z][\w:-]*)([^<>]*)>/g;
function sanitizeStoreLogoSvg(svg) {
  const source = svg.trim();
  if (!source.startsWith("<svg") || !source.endsWith("</svg>") || source.length > 1e5) {
    return "";
  }
  if (/<!|<\?|\b(?:javascript|data|vbscript):|\bon[a-z]+\s*=|\b(?:href|src|style)\s*=/i.test(source)) {
    return "";
  }
  let tagCount = 0;
  let match;
  TAG_PATTERN.lastIndex = 0;
  while (match = TAG_PATTERN.exec(source)) {
    tagCount += 1;
    const element = match[1].toLowerCase();
    if (!ALLOWED_ELEMENTS.has(element)) return "";
    if (match[0].startsWith("</")) continue;
    const attributes = match[2];
    let consumed = "";
    ATTRIBUTE_PATTERN.lastIndex = 0;
    let attributeMatch;
    while (attributeMatch = ATTRIBUTE_PATTERN.exec(attributes)) {
      consumed += attributeMatch[0];
      const attribute = attributeMatch[1].toLowerCase();
      const value = attributeMatch[2].slice(1, -1);
      if (!ALLOWED_ATTRIBUTES.has(attribute)) return "";
      if (attribute === "id" && !/^[A-Za-z_][\w:.-]*$/.test(value)) return "";
      if (/url\(/i.test(value) && !/^url\(#[A-Za-z_][\w:.-]*\)$/.test(value)) return "";
    }
    const remainder = attributes.replace(consumed, "").replace(/\//g, "").trim();
    if (remainder) return "";
  }
  TAG_PATTERN.lastIndex = 0;
  if (tagCount === 0 || source.replace(TAG_PATTERN, "").trim()) return "";
  return source;
}

// features/keystone/models/storeLogoFields.ts
var storeLogoFields = {
  logoIcon: (0, import_fields45.text)({
    defaultValue: DEFAULT_STORE_LOGO_ICON,
    hooks: {
      resolveInput: ({ resolvedData, fieldKey }) => {
        const value = resolvedData[fieldKey];
        if (value === void 0 || value === null || value === "") return value;
        return typeof value === "string" ? sanitizeStoreLogoSvg(value) : "";
      },
      validate: ({ inputData, resolvedData, fieldKey, addValidationError }) => {
        const submitted = inputData?.[fieldKey];
        if (typeof submitted === "string" && submitted.trim() && !resolvedData?.[fieldKey]) {
          addValidationError("Logo must be a valid, safe SVG document");
        }
      }
    }
  }),
  logoColor: (0, import_fields45.text)({
    defaultValue: DEFAULT_STORE_LOGO_COLOR,
    hooks: {
      resolveInput: ({ resolvedData, fieldKey }) => {
        const value = resolvedData[fieldKey];
        return value === void 0 ? value : normalizeStoreLogoColor(value);
      }
    }
  })
};

// features/keystone/models/VenueSettings.ts
var VenueSettings = domainList({
  refundWindowHours: (0, import_fields46.integer)({ defaultValue: 24 }),
  holdMinutes: (0, import_fields46.integer)({ defaultValue: 10 }),
  approvalThresholdCents: (0, import_fields46.integer)({ defaultValue: 1e4 }),
  compApprovalQuantity: (0, import_fields46.integer)({ defaultValue: 4 }),
  currencyCode: currency(),
  ...storeLogoFields
}, "canManageSettings", false, true);

// features/keystone/models/index.ts
var rawModels = {
  AuditEvent,
  Check,
  CheckIn,
  CheckItem,
  Comedian,
  ComedianPayout,
  Comp,
  IdempotencyKey,
  InventoryHold,
  InventoryHoldLine,
  LineupSlot,
  ManagerApproval,
  MenuItem,
  OAuthApp,
  OAuthToken,
  OpenMicSignup,
  Payment,
  PaymentCollection,
  PaymentProvider,
  PaymentSession,
  PaymentWebhookEvent,
  PriceTier,
  PromoCode,
  PromoRedemption,
  Refund,
  WaitlistEntry,
  Role,
  Room,
  Run,
  SeatingAssignment,
  Section,
  Show,
  ShowSettlement,
  ShowTemplate,
  ShowGroup,
  Table,
  TableOccupancy,
  Ticket,
  TicketOrder,
  TicketOrderLine,
  User,
  Venue,
  VenueSettings
};
var models = Object.fromEntries(Object.entries(rawModels).map(([key, entry]) => {
  const config2 = entry;
  const query = config2?.access?.operation?.query;
  if (typeof query !== "function") return [key, config2];
  const existing = config2?.ui?.isHidden;
  const isHidden = (args) => {
    if (existing === true) return true;
    if (typeof existing === "function" && existing(args)) return true;
    return !query(args);
  };
  return [key, { ...config2, ui: { ...config2.ui ?? {}, isHidden } }];
}));

// features/keystone/index.ts
init_access();
var import_session = require("@keystone-6/core/session");

// features/keystone/mutations/index.ts
var import_schema = require("@graphql-tools/schema");
var import_graphql2 = require("graphql");

// features/keystone/mutations/redirectToInit.ts
async function redirectToInit(root, args, context) {
  const userCount = await context.sudo().query.User.count({});
  if (userCount === 0) {
    return true;
  }
  return false;
}
var redirectToInit_default = redirectToInit;

// features/keystone/mutations/storeLogo.ts
var storeLogoTypeDefs = `
  type StoreLogo { logoIcon: String! logoColor: String! name: String! }
  extend type Query { storeLogo: StoreLogo! }
`;
async function storeLogo(_root, _args, context) {
  const row = await context.prisma.venueSettings.findFirst({ select: { logoIcon: true, logoColor: true } });
  const venue = await context.prisma.venue.findFirst({ select: { name: true }, orderBy: { createdAt: "asc" } });
  return { logoIcon: row?.logoIcon || DEFAULT_STORE_LOGO_ICON, logoColor: row?.logoColor || DEFAULT_STORE_LOGO_COLOR, name: venue?.name || "Openfront Comedy Club" };
}

// features/keystone/mutations/tickets.ts
init_capacity();
init_waitlistCore();
init_saleWindow();
var import_node_crypto6 = __toESM(require("node:crypto"));
init_commands();
init_groupHold();
init_holds();
async function expireUnderLock(tx, showId, context) {
  const holds = await tx.inventoryHold.findMany({ where: { showId, status: "active", expiresAt: { lte: /* @__PURE__ */ new Date() } } });
  for (const hold of holds) {
    if (await tx.ticketOrder.count({ where: { hold: { id: hold.id }, status: "pending_payment" } })) continue;
    await tx.inventoryHold.update({ where: { id: hold.id }, data: { status: "expired" } });
    await releaseHoldSeats(tx, hold);
    await tx.tableOccupancy.updateMany({ where: { holdId: hold.id }, data: { occupancyKey: null } });
    await tx.promoRedemption.updateMany({ where: { hold: { id: hold.id }, status: "reserved" }, data: { status: "released" } });
    await audit(tx, context, "expired", "InventoryHold", hold.id, hold, { status: "expired" });
  }
  if (holds.length) await offerFreedSeats(tx, context, showId);
  return holds.length;
}
async function expireHolds(_root, args, context) {
  const due = await context.prisma.inventoryHold.findMany({ where: { status: "active", expiresAt: { lte: /* @__PURE__ */ new Date() }, ...args.showId ? { showId: args.showId } : {} }, select: { showId: true }, distinct: ["showId"], take: 100 });
  let expired = 0;
  for (const { showId } of due) expired += await context.prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, "show:" + showId);
    return expireUnderLock(tx, showId, context);
  });
  try {
    const { settleStalePendingCheckouts: settleStalePendingCheckouts2 } = await Promise.resolve().then(() => (init_checkout(), checkout_exports));
    await settleStalePendingCheckouts2(context, args.showId);
  } catch {
  }
  return { expired };
}
async function showsOnSale(_root, _args, context) {
  await expireHolds(null, {}, context);
  const rows = await context.prisma.show.findMany({ where: { status: { in: ["on_sale", "sold_out"] }, startsAt: { gt: /* @__PURE__ */ new Date() } }, select: { id: true, title: true, startsAt: true, doorsAt: true, ageRestriction: true, publicNote: true, room: { select: { name: true } }, tiers: { select: { id: true, name: true, priceCents: true, feeCents: true, capacity: true, sold: true, held: true, status: true, salesStartAt: true, salesEndAt: true } } }, orderBy: { startsAt: "asc" }, take: 100 });
  return rows;
}
async function showAvailability(_root, { showId }, context) {
  await expireHolds(null, { showId }, context);
  const show = await context.prisma.show.findUnique({ where: { id: showId }, select: { id: true, title: true, status: true, startsAt: true, endsAt: true, ageRestriction: true, publicNote: true, capacity: true, room: { select: { name: true, seatingMode: true, sections: { select: { name: true, tables: { select: { id: true, label: true, seats: true } } } } } }, tiers: { select: { id: true, name: true, priceCents: true, feeCents: true, capacity: true, sold: true, held: true, status: true, isTableTier: true, seatsPerUnit: true, salesStartAt: true, salesEndAt: true } }, lineup: { where: { status: "confirmed" }, select: { role: true, position: true, setMinutes: true, comedian: { select: { stageName: true, bio: true } } }, orderBy: { position: "asc" } }, occupancies: { where: { occupancyKey: { not: null } }, select: { tableId: true } } } });
  if (!show || !["on_sale", "sold_out", "doors_open"].includes(show.status)) throw new Error("Show not available");
  return show;
}
async function createTicketHold(_root, input, context) {
  const lines = normalizeLines(input);
  checkLines(lines);
  return command(context, "createTicketHold", input, async (tx) => {
    await expireUnderLock(tx, input.showId, context);
    const show = await tx.show.findUnique({ where: { id: input.showId }, include: { room: true } });
    if (!show || show.status !== "on_sale" || show.startsAt <= /* @__PURE__ */ new Date()) throw new Error("Tickets unavailable");
    const tiers = await tx.priceTier.findMany({ where: { id: { in: lines.map((l) => l.tierId) } } });
    if (tiers.length !== lines.length) throw new Error("Tickets unavailable");
    for (const tier of tiers) {
      const state = saleState(tier);
      if (state === "scheduled") throw new Error("Sales have not opened for this tier yet");
      if (state === "ended") throw new Error("Sales have ended for this tier");
    }
    const totals2 = await tx.priceTier.aggregate({ where: { showId: show.id }, _sum: { sold: true, held: true } });
    checkCapacity(lines, tiers, show.id, showCapacity(show) - (totals2._sum.sold || 0) - (totals2._sum.held || 0));
    const allIds = [];
    const perLineTables = /* @__PURE__ */ new Map();
    for (const l of lines) {
      const tier = tiers.find((t) => t.id === l.tierId);
      const ids = [...new Set(l.tableIds || [])];
      if (tier.isTableTier && !ids.length) throw new Error("Choose a table");
      const tables = ids.length ? await tx.table.findMany({ where: { id: { in: ids } }, include: { section: true } }) : [];
      if (tables.length !== ids.length || tables.some((t) => t.section.roomId !== show.roomId || tier.isTableTier && t.section.name !== tier.name)) throw new Error("Invalid tables");
      if (tables.length && tables.reduce((n, t) => n + t.seats, 0) !== l.quantity) throw new Error("Reserve every seat at the selected tables");
      perLineTables.set(l.tierId, ids);
      allIds.push(...ids);
    }
    if (new Set(allIds).size !== allIds.length) throw new Error("A table can only be chosen once");
    const total = lines.reduce((n, l) => n + l.quantity, 0);
    const settings = await tx.venueSettings.findFirst();
    const token = import_node_crypto6.default.randomBytes(32).toString("hex");
    const hold = await tx.inventoryHold.create({ data: { holdKey: code("H"), showId: show.id, priceTierId: lines[0].tierId, quantity: total, cartToken: hash(token), status: "active", expiresAt: new Date(Date.now() + (settings?.holdMinutes || 10) * 6e4), tables: { connect: allIds.map((id2) => ({ id: id2 })) } } });
    for (const l of lines) {
      await tx.inventoryHoldLine.create({ data: { holdId: void 0, hold: { connect: { id: hold.id } }, priceTier: { connect: { id: l.tierId } }, quantity: l.quantity } });
      await tx.priceTier.update({ where: { id: l.tierId }, data: { held: { increment: l.quantity } } });
    }
    for (const tableId of allIds) await tx.tableOccupancy.create({ data: { occupancyKey: show.id + ":" + tableId, showId: show.id, tableId, holdId: hold.id } });
    await audit(tx, context, "held", "InventoryHold", hold.id, null, { quantity: total, lines: lines.map((l) => ({ tierId: l.tierId, quantity: l.quantity })) });
    return { holdKey: hold.holdKey, cartToken: token, expiresAt: hold.expiresAt };
  }, "show:" + input.showId);
}
async function applyPromoToHold(_root, input, context) {
  const lookup = await context.prisma.inventoryHold.findUnique({ where: { holdKey: input.holdKey } });
  prove(lookup, input.cartToken);
  return command(context, "applyPromoToHold", input, async (tx) => {
    const hold = await tx.inventoryHold.findUnique({ where: { id: lookup.id }, include: { show: true } });
    prove(hold, input.cartToken);
    if (hold.status !== "active" || hold.expiresAt <= /* @__PURE__ */ new Date() || await tx.ticketOrder.count({ where: { hold: { id: hold.id } } })) throw new Error("Hold cannot be changed");
    const promo = await tx.promoCode.findUnique({ where: { code: input.code.toUpperCase() } });
    if (!promo) throw new Error("Invalid promotion");
    await lockTransactionKey(tx, "promo:" + promo.id);
    const current = await tx.promoCode.findUnique({ where: { id: promo.id } });
    const reserved = await tx.promoRedemption.count({ where: { promoCodeId: current.id, status: "reserved" } });
    const now = /* @__PURE__ */ new Date();
    if (current.status !== "active" || current.showId && current.showId !== hold.showId || current.templateId && current.templateId !== hold.show.templateId || current.startsAt && current.startsAt > now || current.endsAt && current.endsAt < now || current.maxUses !== null && current.usedCount + reserved >= current.maxUses) throw new Error("Promotion unavailable");
    await tx.promoRedemption.updateMany({ where: { hold: { id: hold.id }, status: "reserved" }, data: { status: "released" } });
    const redemption = await tx.promoRedemption.create({ data: { promoCode: { connect: { id: promo.id } }, status: "reserved", amountCents: 0 } });
    await tx.inventoryHold.update({ where: { id: hold.id }, data: { promo: { connect: { id: promo.id } }, redemption: { connect: { id: redemption.id } } } });
    await audit(tx, context, "promo_applied", "InventoryHold", hold.id, null, { code: promo.code });
    return { applied: true };
  }, "show:" + lookup.showId);
}
async function lookupTicketOrder(_root, { email, orderNumber }, context) {
  const order = await context.prisma.ticketOrder.findUnique({ where: { orderNumber }, select: { orderNumber: true, email: true, status: true, name: true, totalCents: true, currencyCode: true, show: { select: { title: true, startsAt: true } }, lines: { select: { tierName: true, quantity: true, unitPriceCents: true, lineTotalCents: true } }, tickets: { select: { ticketCode: true, status: true, holderName: true } } } });
  if (!order || order.email.toLowerCase() !== String(email).trim().toLowerCase()) throw new Error("Order not found");
  const { email: _, ...safe } = order;
  return safe;
}
async function openMicSignup(_root, input, context) {
  if (!input.email || !input.name) throw new Error("Name and email required");
  return command(context, "openMicSignup", input, async (tx) => {
    const show = await tx.show.findUnique({ where: { id: input.showId } });
    if (!show?.isOpenMic || !show.signupOpensAt || show.signupOpensAt > /* @__PURE__ */ new Date() || show.startsAt < /* @__PURE__ */ new Date()) throw new Error("Signup closed");
    const email = input.email.trim().toLowerCase();
    const comedian = input.comedianId ? await tx.comedian.findUnique({ where: { id: input.comedianId } }) : null;
    if (comedian && comedian.email.toLowerCase() !== email) throw new Error("Comedian email does not match");
    return tx.openMicSignup.create({ data: { signupKey: show.id + ":" + (comedian?.id || email), showId: show.id, comedianId: comedian?.id || null, name: input.name, email, method: "online_list", status: "waiting" } });
  }, "show:" + input.showId);
}
async function openMicShows(_root, _args, context) {
  const from = new Date(Date.now() - 3 * 36e5);
  return context.prisma.show.findMany({ where: { isOpenMic: true, status: { in: ["on_sale", "sold_out", "doors_open"] }, startsAt: { gte: from } }, select: { id: true, title: true, startsAt: true, signupOpensAt: true, room: { select: { name: true } } }, orderBy: { startsAt: "asc" }, take: 6 });
}

// features/keystone/lib/doorQueue.ts
var MAX_SCAN_AGE_MS = 12 * 36e5;
function effectiveScanTime(scannedAt, now) {
  const t = typeof scannedAt === "string" ? new Date(scannedAt) : null;
  if (!t || Number.isNaN(t.getTime())) return now;
  if (t.getTime() > now.getTime() || now.getTime() - t.getTime() > MAX_SCAN_AGE_MS) return now;
  return t;
}
var QUEUE_GRACE_MS = 6 * 36e5;

// features/keystone/mutations/operators.ts
var import_node_crypto7 = __toESM(require("node:crypto"));
init_commands();
init_saleWindow();
var showTransitions = { draft: ["on_sale"], on_sale: ["doors_open"], sold_out: ["doors_open"], doors_open: ["in_progress"], in_progress: ["completed"] };
async function publishShow(_, a, c) {
  requirePermission(c, "canManageShows");
  return command(c, "publishShow", a, (tx) => transition(tx, c, "show", a.showId, a.nextStatus || "on_sale", showTransitions), "show:" + a.showId);
}
async function pauseSales(_, a, c) {
  requirePermission(c, "canManageShows");
  return command(c, "pauseSales", a, async (tx) => {
    const show = await tx.show.findUnique({ where: { id: a.showId } });
    if (!show || !["on_sale", "sold_out"].includes(show.status)) throw new Error("Sales are not open");
    await tx.priceTier.updateMany({ where: { showId: a.showId }, data: { status: "paused" } });
    await audit(tx, c, "sales_paused", "Show", a.showId, null, null);
    return { paused: true };
  }, "show:" + a.showId);
}
async function resumeSales(_, a, c) {
  requirePermission(c, "canManageShows");
  return command(c, "resumeSales", a, async (tx) => {
    const show = await tx.show.findUnique({ where: { id: a.showId } });
    if (!show || !["on_sale", "sold_out"].includes(show.status)) throw new Error("Sales cannot resume");
    await expireUnderLock(tx, show.id, c);
    const tiers = await tx.priceTier.findMany({ where: { showId: show.id, status: "paused" } });
    if (!tiers.length) throw new Error("No paused tiers");
    for (const t of tiers) await tx.priceTier.update({ where: { id: t.id }, data: { status: t.sold + t.held >= t.capacity ? "sold_out" : "on_sale" } });
    const totals2 = await tx.priceTier.aggregate({ where: { showId: show.id }, _sum: { sold: true, held: true } });
    await tx.show.update({ where: { id: show.id }, data: { status: (totals2._sum.sold || 0) + (totals2._sum.held || 0) >= show.capacity ? "sold_out" : "on_sale" } });
    await audit(tx, c, "sales_resumed", "Show", show.id, null, { tiers: tiers.map((t) => t.id) });
    return { resumed: tiers.length };
  }, "show:" + a.showId);
}
async function offerSlot(_, a, c) {
  requirePermission(c, "canManageTalent");
  return command(c, "offerSlot", a, async (tx) => {
    const comedian = await tx.comedian.findUnique({ where: { id: a.comedianId } });
    const show = await tx.show.findUnique({ where: { id: a.showId } });
    if (!comedian || !show || ["cancelled", "completed", "settled"].includes(show.status)) throw new Error("Show or comedian unavailable");
    if (comedian.status === "inactive") throw new Error(`${comedian.stageName} is retired; reactivate them under Lineups & talent first`);
    if (["headliner", "host"].includes(a.role) && await tx.lineupSlot.count({ where: { showId: a.showId, role: a.role, status: { notIn: ["cancelled", "declined"] } } })) throw new Error("Only one host and headliner allowed");
    const slot = await tx.lineupSlot.create({ data: { showId: a.showId, comedianId: a.comedianId, role: a.role, position: a.position || 0, setMinutes: a.setMinutes || 10, feeCents: a.feeCents ?? comedian.defaultFeeCents, bonusCents: 0, status: "offered" } });
    await audit(tx, c, "offered", "LineupSlot", slot.id, null, slot);
    return slot;
  }, "show:" + a.showId);
}
async function confirmSlot(_, a, c) {
  requirePermission(c, "canManageTalent");
  return command(c, "confirmSlot", a, async (tx) => {
    const slot = await tx.lineupSlot.findUnique({ where: { id: a.slotId } });
    if (!slot) throw new Error("Slot not found");
    await lockTransactionKey(tx, "show:" + slot.showId);
    const updated = await transition(tx, c, "lineupSlot", slot.id, "confirmed", { offered: ["confirmed"] });
    await tx.lineupSlot.update({ where: { id: slot.id }, data: { confirmedAt: /* @__PURE__ */ new Date() } });
    return updated;
  });
}
async function setLineup(_, a, c) {
  requirePermission(c, "canManageTalent");
  return command(c, "setLineup", a, async (tx) => {
    const slots = await tx.lineupSlot.findMany({ where: { showId: a.showId } });
    const ids = a.slots.map((s) => s.id);
    if (ids.length !== new Set(ids).size || ids.some((id2) => !slots.some((s) => s.id === id2))) throw new Error("Invalid lineup");
    for (const s of a.slots) await tx.lineupSlot.update({ where: { id: s.id }, data: { position: s.position, setMinutes: s.setMinutes } });
    const show = await tx.show.findUnique({ where: { id: a.showId } });
    const total = a.slots.reduce((n, s) => n + s.setMinutes, 0);
    await audit(tx, c, "reordered", "Show", a.showId, null, a.slots);
    return { warning: total > (show.endsAt - show.startsAt) / 6e4 ? "Lineup exceeds show duration" : null };
  }, "show:" + a.showId);
}
async function checkInTicket(_, a, c) {
  requirePermission(c, "canManageDoor");
  return command(c, "checkInTicket", a, async (tx) => {
    const ticket = await tx.ticket.findFirst({ where: { OR: [{ ticketCode: a.tokenOrCode }, { tokenHash: hash(a.tokenOrCode) }] } });
    if (!ticket) throw new Error("Ticket not found");
    const scanShow = await tx.show.findUnique({ where: { id: ticket.showId }, select: { status: true } });
    const result = ticket.showId !== a.showId ? "wrong_show" : ticket.status === "checked_in" ? "duplicate" : ticket.status !== "valid" || ["cancelled", "settled", "draft"].includes(scanShow?.status) ? "void" : "admitted";
    let effective = result;
    if (result === "admitted") {
      const cas = await tx.ticket.updateMany({ where: { id: ticket.id, status: "valid" }, data: { status: "checked_in" } });
      if (cas.count !== 1) effective = "duplicate";
    }
    const scan = await tx.checkIn.create({ data: { ticketId: ticket.id, showId: a.showId, scannedById: c.session.itemId, at: effectiveScanTime(a.scannedAt, /* @__PURE__ */ new Date()), method: a.method || "manual", result: effective } });
    await audit(tx, c, effective, "Ticket", ticket.id, null, { status: effective });
    if (effective !== "duplicate") return { ...scan, ticketCode: ticket.ticketCode, holderName: ticket.holderName || null };
    const first = await tx.checkIn.findFirst({ where: { ticketId: ticket.id, result: "admitted", id: { not: scan.id } }, orderBy: { at: "asc" }, include: { scannedBy: { select: { name: true } } } });
    return { ...scan, ticketCode: ticket.ticketCode, admittedAt: first?.at || null, admittedBy: first?.scannedBy?.name || null, admittedMethod: first?.method || null, holderName: ticket.holderName || null };
  }, "show:" + a.showId);
}
async function seatParty(_, a, c) {
  requirePermission(c, "canManageDoor");
  return command(c, "seatParty", a, async (tx) => {
    const order = await tx.ticketOrder.findUnique({ where: { id: a.orderId }, include: { show: true, tableAssignment: true, hold: true } });
    if (!order || !["paid", "comp", "partially_refunded"].includes(order.status) || order.tableAssignment) throw new Error("Party unavailable");
    const ids = [...new Set(a.tableIds)];
    if (!ids.length) throw new Error("Choose tables");
    const tables = await tx.table.findMany({ where: { id: { in: ids } }, include: { section: true } });
    if (tables.length !== ids.length || tables.some((t) => t.section.roomId !== order.show.roomId) || tables.reduce((n, t) => n + t.seats, 0) < order.partySize) throw new Error("Invalid table capacity");
    const assignment = await tx.seatingAssignment.create({ data: { showId: order.showId, ticketOrderId: order.id, partySize: order.partySize, status: "seated", seatedAt: /* @__PURE__ */ new Date(), serverId: a.serverId || c.session.itemId, tables: { connect: ids.map((id2) => ({ id: id2 })) } } });
    for (const tableId of ids) {
      const key = order.showId + ":" + tableId;
      const occupancy = await tx.tableOccupancy.findUnique({ where: { occupancyKey: key } });
      if (occupancy && occupancy.holdId !== order.hold?.id) throw new Error("Table occupied");
      if (occupancy) await tx.tableOccupancy.update({ where: { id: occupancy.id }, data: { assignmentId: assignment.id } });
      else await tx.tableOccupancy.create({ data: { occupancyKey: key, showId: order.showId, tableId, assignmentId: assignment.id } });
    }
    await audit(tx, c, "seated", "SeatingAssignment", assignment.id, null, assignment);
    return assignment;
  }, "show:" + a.showId);
}
async function openCheck(_, a, c) {
  requirePermission(c, "canManageChecks");
  return command(c, "openCheck", a, async (tx) => {
    const seating = await tx.seatingAssignment.findUnique({ where: { id: a.seatingAssignmentId }, include: { show: { include: { room: { include: { venue: true } } } } } });
    if (!seating || seating.status !== "seated" || await tx.check.count({ where: { seatingAssignmentId: seating.id, status: { in: ["open", "presented"] } } })) throw new Error("Check unavailable");
    const venue = seating.show.room.venue;
    const cheapest = await tx.menuItem.findFirst({ where: { active: true, countsTowardMinimum: true }, orderBy: { priceCents: "asc" } });
    if (venue.drinkMinimumItems && !cheapest) throw new Error("Qualifying minimum item required");
    const check = await tx.check.create({ data: { showId: seating.showId, seatingAssignmentId: seating.id, serverId: c.session.itemId, status: "open", guestCount: seating.partySize, minimumItemsRequired: seating.partySize * venue.drinkMinimumItems, minimumUnitPriceCents: cheapest?.priceCents || 0, minimumCentsFloor: (venue.drinkMinimumCentsFloor || 0) * seating.partySize, taxBps: venue.taxBps } });
    await audit(tx, c, "opened", "Check", check.id, null, check);
    return check;
  }, "seating:" + a.seatingAssignmentId);
}
async function addCheckItem(_, a, c) {
  requirePermission(c, "canManageChecks");
  return command(c, "addCheckItem", a, async (tx) => {
    const check = await tx.check.findUnique({ where: { id: a.checkId } });
    const item = await tx.menuItem.findUnique({ where: { id: a.menuItemId } });
    if (check?.status !== "open" || !item?.active || !Number.isInteger(a.qty) || a.qty < 1 || a.qty > 100) throw new Error("Invalid check item");
    const line = await tx.checkItem.create({ data: { checkId: check.id, menuItemId: item.id, name: item.name, priceCents: item.priceCents, qty: a.qty, countsTowardMinimum: item.countsTowardMinimum } });
    await audit(tx, c, "item_added", "Check", check.id, null, line);
    return line;
  }, "check:" + a.checkId);
}
async function runOpenMicLottery(_, a, c) {
  requirePermission(c, "canManageTalent");
  return command(c, "runOpenMicLottery", a, async (tx) => {
    const show = await tx.show.findUnique({ where: { id: a.showId } });
    if (!show?.isOpenMic) throw new Error("Not an open mic");
    const rows = await tx.openMicSignup.findMany({ where: { showId: a.showId, status: "waiting" }, take: 1e3 });
    const eligible = rows.filter((r) => r.method !== "bringer" || r.bringerGuestsRequired > 0 && r.bringerGuestsArrived >= r.bringerGuestsRequired);
    rows.length = 0;
    rows.push(...eligible);
    for (let i = rows.length - 1; i > 0; i--) {
      const j = import_node_crypto7.default.randomInt(i + 1);
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    for (let i = 0; i < rows.length; i++) await tx.openMicSignup.update({ where: { id: rows[i].id }, data: { lotteryNumber: i + 1 } });
    await audit(tx, c, "lottery", "Show", show.id, null, { count: rows.length });
    return { count: rows.length };
  }, "show:" + a.showId);
}
async function updatePromoLimit(_, a, c) {
  requirePermission(c, "canManageOrders");
  if (!Number.isSafeInteger(a.perOrderLimit) || a.perOrderLimit < 1 || a.perOrderLimit > 20) throw new Error("Limit must be 1 to 20 tickets");
  return command(c, "updatePromoLimit", a, async (tx) => {
    const before = await tx.promoCode.findUnique({ where: { id: a.promoId } });
    if (!before) throw new Error("Promo not found");
    const after = await tx.promoCode.update({ where: { id: before.id }, data: { perOrderLimit: a.perOrderLimit } });
    await audit(tx, c, "promo_limit_changed", "PromoCode", before.id, { perOrderLimit: before.perOrderLimit }, { perOrderLimit: after.perOrderLimit });
    return { id: after.id, perOrderLimit: after.perOrderLimit };
  }, "promo:" + a.promoId);
}
async function undoCheckIn(_, a, c) {
  requirePermission(c, "canManageDoor");
  if (!a.reason?.trim() || a.reason.length > 200) throw new Error("Reason required");
  return command(c, "undoCheckIn", a, async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id: a.ticketId } });
    if (!ticket || ticket.showId !== a.showId) throw new Error("Ticket not found");
    const show = await tx.show.findUnique({ where: { id: a.showId } });
    if (!show || ["completed", "settled", "cancelled"].includes(show.status)) throw new Error("Show is closed to door changes");
    const cas = await tx.ticket.updateMany({ where: { id: ticket.id, status: "checked_in" }, data: { status: "valid" } });
    if (cas.count !== 1) throw new Error("Ticket is not checked in");
    await audit(tx, c, "check_in_undone", "Ticket", ticket.id, { status: "checked_in" }, { status: "valid" }, a.reason.trim());
    return { ticketId: ticket.id, status: "valid" };
  }, "show:" + a.showId);
}
var SLOT_FLOW = { offered: ["declined", "cancelled"], confirmed: ["cancelled", "no_show"] };
async function updateSlotStatus(_, a, c) {
  requirePermission(c, "canManageTalent");
  return command(c, "updateSlotStatus", a, async (tx) => {
    const first = await tx.lineupSlot.findUnique({ where: { id: a.slotId } });
    if (!first) throw new Error("Slot not found");
    await lockTransactionKey(tx, "show:" + first.showId);
    const slot = await tx.lineupSlot.findUnique({ where: { id: a.slotId } });
    if (!slot || !SLOT_FLOW[slot.status]?.includes(a.status)) throw new Error("Invalid state transition");
    const show = await tx.show.findUnique({ where: { id: slot.showId } });
    if (!show || ["settled", "cancelled"].includes(show.status)) throw new Error("Show is closed to lineup changes");
    if (a.status === "no_show" && !["doors_open", "in_progress", "completed"].includes(show.status)) throw new Error("No-show can only be recorded once doors are open");
    const moved = await transition(tx, c, "lineupSlot", slot.id, a.status, SLOT_FLOW);
    return moved;
  });
}
async function setSalesWindow(_, a, c) {
  requirePermission(c, "canManageShows");
  const parse2 = (v) => v ? new Date(v) : null;
  const start = parse2(a.salesStartAt), end = parse2(a.salesEndAt);
  return command(c, "setSalesWindow", a, async (tx) => {
    const first = await tx.priceTier.findUnique({ where: { id: a.tierId } });
    if (!first) throw new Error("Tier not found");
    await lockTransactionKey(tx, "show:" + first.showId);
    const tier = await tx.priceTier.findUnique({ where: { id: a.tierId }, include: { show: true } });
    if (!tier || ["cancelled", "settled", "completed"].includes(tier.show.status)) throw new Error("Show is closed to sales changes");
    assertValidWindow(start, end, tier.show.startsAt);
    const after = await tx.priceTier.update({ where: { id: tier.id }, data: { salesStartAt: start, salesEndAt: end } });
    await audit(tx, c, "sales_window_set", "PriceTier", tier.id, { salesStartAt: tier.salesStartAt, salesEndAt: tier.salesEndAt }, { salesStartAt: after.salesStartAt, salesEndAt: after.salesEndAt });
    return { tierId: after.id, salesStartAt: after.salesStartAt, salesEndAt: after.salesEndAt };
  });
}
async function setComedianStatus(_, a, c) {
  requirePermission(c, "canManageTalent");
  if (!["active", "inactive"].includes(a.status)) throw new Error("Status must be active or inactive");
  return command(c, "setComedianStatus", a, async (tx) => {
    if (a.status === "inactive") {
      const live = await tx.lineupSlot.findMany({ where: { comedianId: a.comedianId, status: { in: ["offered", "confirmed"] }, show: { status: { notIn: ["cancelled", "completed", "settled"] }, startsAt: { gte: /* @__PURE__ */ new Date() } } }, include: { show: { select: { title: true, startsAt: true } } }, orderBy: { show: { startsAt: "asc" } } });
      if (live.length) throw new Error(`Still booked on ${live.length} upcoming show${live.length === 1 ? "" : "s"} (${live.slice(0, 3).map((l) => l.show.title + " " + l.show.startsAt.toISOString().slice(0, 10)).join(", ")}). Decline or cancel those slots first.`);
    }
    return transition(tx, c, "comedian", a.comedianId, a.status, { active: ["inactive"], inactive: ["active"] });
  }, "comedian:" + a.comedianId);
}

// features/keystone/mutations/index.ts
init_checkout();

// features/keystone/mutations/night.ts
init_holds();
init_capacity();
init_commands();
init_money();
init_managerApproval();
init_checkout();

// features/keystone/lib/time.ts
function zonedTime(day, hhmm, tz) {
  const [h, m] = hhmm.split(":").map(Number);
  const wall = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h, m);
  const offsetAt = (t2) => {
    const p2 = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t2)).map((x) => [x.type, x.value]));
    return Date.UTC(+p2.year, +p2.month - 1, +p2.day, +p2.hour, +p2.minute, +p2.second) - Math.floor(t2 / 1e3) * 1e3;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return new Date(t);
}

// features/keystone/mutations/night.ts
var DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
async function generateShowsFromTemplate(_, a, c) {
  requirePermission(c, "canManageShows");
  return command(c, "generateShowsFromTemplate", a, async (tx) => {
    const t = await tx.showTemplate.findUnique({ where: { id: a.templateId }, include: { room: { include: { venue: true } }, defaultPriceTiers: true } });
    if (!t) throw new Error("Template not found");
    const byday = /BYDAY=([A-Z,]+)/.exec(t.recurrenceRule || "")?.[1]?.split(",").map((d) => DAYS[d]);
    if (!/FREQ=WEEKLY/.test(t.recurrenceRule || "") || !byday?.length || byday.some((d) => d === void 0)) throw new Error("Weekly BYDAY rule required");
    const tz = t.room.venue.timezone;
    const created = [];
    const from = new Date(a.from || Date.now());
    for (let i = 0; i < 56; i++) {
      const d = new Date(from.getTime() + i * 864e5);
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(d);
      const g = (k) => parts.find((p2) => p2.type === k).value;
      const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
      if (!byday.includes(dow)) continue;
      const day = `${g("year")}-${g("month")}-${g("day")}`;
      const key = `${t.id}:${day}`;
      if (await tx.show.findUnique({ where: { occurrenceKey: key } })) continue;
      const startsAt = zonedTime(day, String(t.startTime), tz);
      const show = await tx.show.create({ data: { roomId: t.roomId, templateId: t.id, title: t.title, occurrenceKey: key, startsAt, doorsAt: new Date(startsAt.getTime() - 36e5), endsAt: new Date(startsAt.getTime() + t.duration * 6e4), signupOpensAt: t.isOpenMic ? new Date(startsAt.getTime() - 7 * 864e5) : null, ageRestriction: t.defaultAgeRestriction, capacity: t.room.capacity, status: "draft", isOpenMic: t.isOpenMic } });
      for (const tier of t.defaultPriceTiers) await tx.priceTier.create({ data: { showId: show.id, name: tier.name, priceCents: tier.priceCents, feeCents: tier.feeCents, capacity: Math.min(tier.capacity, t.room.capacity), isTableTier: tier.isTableTier, seatsPerUnit: tier.seatsPerUnit, status: "on_sale" } });
      created.push(show.id);
    }
    await audit(tx, c, "generated", "ShowTemplate", t.id, null, { created: created.length });
    return { created: created.length };
  }, "template:" + a.templateId);
}
async function issueComp(_, a, c) {
  requirePermission(c, "canManageOrders");
  if (!Number.isInteger(a.quantity) || a.quantity < 1 || a.quantity > 20) throw new Error("Choose 1\u201320 tickets");
  const settings = await c.prisma.venueSettings.findFirst();
  return command(c, "issueComp", a, async (tx) => {
    await expireUnderLock(tx, a.showId, c);
    const show = await tx.show.findUnique({ where: { id: a.showId }, include: { room: true } });
    const tier = await tx.priceTier.findUnique({ where: { id: a.tierId } });
    if (!show || !tier || tier.showId !== show.id || ["cancelled", "completed", "settled"].includes(show.status)) throw new Error("Tickets unavailable");
    const totals2 = await tx.priceTier.aggregate({ where: { showId: show.id }, _sum: { sold: true, held: true } });
    if (tier.sold + tier.held + a.quantity > tier.capacity || (totals2._sum.sold || 0) + (totals2._sum.held || 0) + a.quantity > showCapacity(show)) throw new Error("Not enough capacity");
    let approvalId = null;
    if (a.quantity > (settings?.compApprovalQuantity ?? 4)) {
      await consumeManagerApproval(tx, { approvalId: a.approvalId, actorId: c.session.itemId, actionType: "comp_tickets", targetId: show.id, reason: a.reason, amount: a.quantity, entityType: "Comp", entityId: show.id });
      approvalId = a.approvalId;
    }
    const comp = await tx.comp.create({ data: { showId: show.id, issuedById: c.session.itemId, recipientName: a.recipientName, recipientEmail: String(a.recipientEmail || "").toLowerCase(), quantity: a.quantity, reason: a.reason, approvalId } });
    const order = await tx.ticketOrder.create({ data: { orderNumber: code("CC"), email: comp.recipientEmail, name: a.recipientName, showId: show.id, status: "comp", source: "comp", partySize: a.quantity, secretKey: hash(code()), lines: { create: [{ tierName: tier.name, unitPriceCents: 0, unitFeeCents: 0, quantity: a.quantity, lineTotalCents: 0, priceTierId: tier.id }] } }, include: { lines: true } });
    for (let i = 0; i < a.quantity; i++) {
      const tc = code("T");
      await tx.ticket.create({ data: { orderId: order.id, showId: show.id, lineId: order.lines[0].id, ticketCode: tc, tokenHash: hash(ticketToken(tc)), holderName: a.recipientName, status: "valid" } });
    }
    await tx.priceTier.update({ where: { id: tier.id }, data: { sold: { increment: a.quantity } } });
    await audit(tx, c, "comp_issued", "Comp", comp.id, null, comp, a.reason);
    return { compId: comp.id, orderNumber: order.orderNumber };
  }, "show:" + a.showId);
}
async function requestApproval(_, a, c) {
  const r = await requestManagerApproval(null, a, c);
  return { id: r.id, status: r.status };
}
async function approveRequest(_, a, c) {
  const r = await approveManagerApproval(null, { approvalId: a.approvalId }, c);
  await audit(c.prisma, c, "approved", "ManagerApproval", r.id, null, { status: r.status });
  return { id: r.id, status: r.status };
}
async function voidCheckItem(_, a, c) {
  requirePermission(c, "canManageChecks");
  return command(c, "voidCheckItem", a, async (tx) => {
    const item = await tx.checkItem.findUnique({ where: { id: a.itemId }, include: { check: true } });
    if (!item || item.checkId !== a.checkId || item.voided || item.check.status !== "open") throw new Error("Item cannot be voided");
    await consumeManagerApproval(tx, { approvalId: a.approvalId, actorId: c.session.itemId, actionType: "void_item", targetId: item.id, reason: a.reason, amount: item.priceCents * item.qty, entityType: "CheckItem", entityId: item.id });
    const changed = await tx.checkItem.updateMany({ where: { id: item.id, voided: false }, data: { voided: true, voidReason: a.reason, approvalId: a.approvalId } });
    if (changed.count !== 1) throw new Error("Item changed");
    await audit(tx, c, "voided", "CheckItem", item.id, item, { voided: true }, a.reason);
    return { voided: true };
  }, "check:" + a.checkId);
}
async function voidCheck(_, a, c) {
  requirePermission(c, "canManageChecks");
  const reason = String(a.reason || "").trim();
  if (!reason || reason.length > 200) throw new Error("Reason required");
  return command(c, "voidCheck", a, async (tx) => {
    const check = await tx.check.findUnique({ where: { id: String(a.checkId || "") }, include: { items: true } });
    if (!check || !["open", "presented"].includes(check.status)) throw new Error("Check cannot be voided");
    if (await tx.payment.count({ where: { checkId: check.id, status: { notIn: ["failed", "cancelled"] } } })) throw new Error("This check has a payment. Refund it instead");
    const live = check.items.filter((i) => !i.voided);
    const subtotal = live.reduce((n, i) => n + i.qty * i.priceCents, 0);
    await consumeManagerApproval(tx, { approvalId: a.approvalId, actorId: c.session.itemId, actionType: "void_check", targetId: check.id, reason, amount: subtotal, entityType: "Check", entityId: check.id });
    const changed = await tx.check.updateMany({ where: { id: check.id, status: check.status }, data: { status: "voided", minimumShortfallCents: 0, subtotalCents: 0, taxCents: 0, tipCents: 0, totalCents: 0 } });
    if (changed.count !== 1) throw new Error("Check changed");
    const leftVenue = a.leftVenue === true;
    if (leftVenue) {
      await tx.seatingAssignment.updateMany({ where: { id: check.seatingAssignmentId, status: "seated" }, data: { status: "closed" } });
      await tx.tableOccupancy.updateMany({ where: { assignmentId: check.seatingAssignmentId }, data: { occupancyKey: null } });
    }
    await audit(tx, c, "voided", "Check", check.id, { status: check.status, items: live.length, subtotal }, { status: "voided", leftVenue }, reason);
    return { checkId: check.id, voided: true, voidedCents: subtotal, leftVenue };
  }, "check:" + a.checkId);
}
async function closeCheck(_, a, c) {
  requirePermission(c, "canManageChecks");
  return command(c, "closeCheck", a, async (tx) => {
    const check = await tx.check.findUnique({ where: { id: a.checkId }, include: { items: true } });
    if (!check || !["open", "presented"].includes(check.status)) throw new Error("Check cannot be closed");
    if (await tx.payment.count({ where: { checkId: check.id, status: { in: ["pending", "processing", "authorized", "unknown"] } } })) throw new Error("A card payment is in progress on this check. Finish or cancel it first");
    const live = check.items.filter((i) => !i.voided);
    const qualifying = live.filter((i) => i.countsTowardMinimum);
    const waived = a.waive === true;
    if (waived) await consumeManagerApproval(tx, { approvalId: a.approvalId, actorId: c.session.itemId, actionType: "waive_minimum", targetId: check.id, reason: a.reason, amount: null, entityType: "Check", entityId: check.id });
    const shortfall = minimum({ requiredItems: check.minimumItemsRequired, qualifyingItems: qualifying.reduce((n, i) => n + i.qty, 0), cheapestCents: check.minimumUnitPriceCents, floorCents: check.minimumCentsFloor, qualifyingCents: qualifying.reduce((n, i) => n + i.qty * i.priceCents, 0), waived });
    const subtotal = live.reduce((n, i) => n + i.qty * i.priceCents, 0) + shortfall;
    const tax = Math.floor((subtotal * check.taxBps + 5e3) / 1e4);
    const tip = Number.isSafeInteger(a.tipCents) && a.tipCents > 0 ? a.tipCents : 0;
    const before = check;
    const changed = await tx.check.updateMany({ where: { id: check.id, status: check.status }, data: { status: "paid", minimumShortfallCents: shortfall, subtotalCents: subtotal, taxCents: tax, tipCents: tip, totalCents: subtotal + tax + tip } });
    if (changed.count !== 1) throw new Error("Check changed");
    await tx.seatingAssignment.updateMany({ where: { id: check.seatingAssignmentId }, data: { status: "closed" } });
    await tx.tableOccupancy.updateMany({ where: { assignmentId: check.seatingAssignmentId }, data: { occupancyKey: null } });
    await audit(tx, c, "closed", "Check", check.id, before, { shortfall, subtotal, tax, tip }, waived ? a.reason : "");
    return { checkId: check.id, minimumShortfallCents: shortfall, totalCents: subtotal + tax + tip };
  }, "check:" + a.checkId);
}
async function cancelShow(_, a, c) {
  requirePermission(c, "canManageShows");
  requirePermission(c, "canIssueRefunds");
  return cancelShowCore(c, a, c.session.itemId);
}
async function cancelShowCore(c, a, actorId) {
  await command(c, "cancelShow", a, async (tx) => {
    const show = await tx.show.findUnique({ where: { id: a.showId } });
    if (show?.status === "cancelled") return { ok: true, resumed: true };
    if (!show || ["completed", "settled"].includes(show.status)) throw new Error("Show cannot be cancelled");
    await tx.show.update({ where: { id: show.id }, data: { status: "cancelled" } });
    await tx.priceTier.updateMany({ where: { showId: show.id }, data: { status: "closed" } });
    await tx.lineupSlot.updateMany({ where: { showId: show.id, status: { notIn: ["performed"] } }, data: { status: "cancelled" } });
    await tx.waitlistEntry.updateMany({ where: { showId: show.id, status: { in: ["waiting", "offered"] } }, data: { status: "cancelled" } });
    const holds = await tx.inventoryHold.findMany({ where: { showId: show.id, status: "active", order: null } });
    for (const h of holds) {
      await tx.inventoryHold.update({ where: { id: h.id }, data: { status: "released" } });
      await releaseHoldSeats(tx, h);
      await tx.tableOccupancy.updateMany({ where: { holdId: h.id }, data: { occupancyKey: null } });
    }
    await audit(tx, c, "cancelled", "Show", show.id, show, { status: "cancelled" }, a.reason);
    return { ok: true };
  }, "show:" + a.showId);
  return refundCancelledShow(c, a.showId, a.reason, actorId);
}
async function refundCancelledShow(c, showId, _reason, actorId) {
  const orders = await c.prisma.ticketOrder.findMany({ where: { showId, status: { in: ["paid", "partially_refunded"] } }, select: { id: true } });
  let refunded = 0, failed = 0;
  for (const o of orders) {
    try {
      await refundOrderInternal(c, { orderId: o.id, reason: "Show cancelled", idempotencyKey: `cancel:${showId}:${o.id}`, actorId, threshold: Number.MAX_SAFE_INTEGER, includeCheckedIn: true });
      refunded++;
    } catch {
      failed++;
    }
  }
  return { cancelled: true, refunded, failed };
}
async function closeShow(_, a, c) {
  requirePermission(c, "canManagePayouts");
  return command(c, "closeShow", a, async (tx) => {
    const show = await tx.show.findUnique({ where: { id: a.showId }, include: { settlement: true, lineup: true, run: true } });
    if (!show || !["in_progress", "completed", "doors_open"].includes(show.status)) throw new Error("Show cannot be closed");
    if (show.settlement?.status === "closed") throw new Error("Settlement already closed");
    if (await tx.check.count({ where: { showId: show.id, status: { in: ["open", "presented"] } } })) throw new Error("Close all checks first");
    if (await tx.ticketOrder.count({ where: { showId: show.id, status: "pending_payment" } }) || await tx.inventoryHold.count({ where: { showId: show.id, status: "active" } })) throw new Error("Resolve pending payments and holds first");
    if (await tx.refund.count({ where: { order: { showId: show.id }, status: { in: ["processing", "unknown"] } } })) throw new Error("Reconcile refunds first");
    const orders = await tx.ticketOrder.findMany({ where: { showId: show.id, status: { in: ["paid", "partially_refunded", "refunded"] } } });
    const refunds = await tx.refund.aggregate({ where: { order: { showId: show.id }, status: "succeeded" }, _sum: { amount: true } });
    const checks = await tx.check.aggregate({ where: { showId: show.id, status: "paid" }, _sum: { subtotalCents: true, minimumShortfallCents: true, tipCents: true } });
    const comps = await tx.comp.aggregate({ where: { showId: show.id }, _sum: { quantity: true } });
    const performing = show.lineup.filter((s) => ["confirmed", "performed"].includes(s.status));
    for (const s of performing) await tx.lineupSlot.update({ where: { id: s.id }, data: { status: "performed" } });
    const byComic = /* @__PURE__ */ new Map();
    for (const s of performing) byComic.set(s.comedianId, [...byComic.get(s.comedianId) || [], s]);
    let talent = 0;
    for (const [comedianId, slots] of byComic) {
      const isRun = show.run && show.run.headlinerId === comedianId && show.run.runFeeCents > 0;
      const amount = payout(slots, 0);
      const p2 = await tx.comedianPayout.upsert({ where: { payoutKey: `${show.id}:${comedianId}` }, update: {}, create: { payoutKey: `${show.id}:${comedianId}`, comedianId, showId: show.id, amountCents: isRun ? payout(slots.map((s) => ({ feeCents: 0, bonusCents: s.bonusCents }))) : amount, currencyCode: "USD", status: "draft", method: "check", lineupSlots: { connect: slots.map((s) => ({ id: s.id })) } } });
      talent += p2.amountCents;
    }
    const gross = orders.reduce((n, o) => n + o.subtotalCents, 0);
    const fees = orders.reduce((n, o) => n + o.feesCents, 0);
    const discounts = orders.reduce((n, o) => n + o.discountCents, 0);
    const figures = { ticketGrossCents: gross, feesCents: fees, discountsCents: discounts, refundsCents: refunds._sum.amount || 0, compsCount: comps._sum.quantity || 0, foodBeverageGrossCents: (checks._sum.subtotalCents || 0) - (checks._sum.minimumShortfallCents || 0), minimumShortfallRevenueCents: checks._sum.minimumShortfallCents || 0, tipsCents: checks._sum.tipCents || 0, talentCostCents: talent };
    const netCents = settlement(figures);
    const data = { ...figures, netCents, currencyCode: "USD", status: "closed", closedById: c.session.itemId };
    const row = show.settlement ? await tx.showSettlement.update({ where: { id: show.settlement.id }, data }) : await tx.showSettlement.create({ data: { ...data, show: { connect: { id: show.id } } } });
    await tx.show.update({ where: { id: show.id }, data: { status: "settled" } });
    if (show.runId) await tx.run.updateMany({ where: { id: show.runId, status: "scheduled" }, data: { status: "in_progress" } });
    await audit(tx, c, "settled", "Show", show.id, null, { netCents });
    return { settlementId: row.id, netCents, talentCostCents: talent };
  }, "show:" + a.showId);
}
async function closeRun(_, a, c) {
  requirePermission(c, "canManagePayouts");
  return command(c, "closeRun", a, async (tx) => {
    const run = await tx.run.findUnique({ where: { id: a.runId }, include: { shows: { select: { id: true, status: true } } } });
    if (!run) throw new Error("Run not found");
    const showsPerformed = run.headlinerId ? (await tx.lineupSlot.findMany({ where: { comedianId: run.headlinerId, status: "performed", show: { runId: run.id } }, select: { showId: true }, distinct: ["showId"] })).length : 0;
    const plan2 = runClosePlan({ runStatus: run.status, runFeeCents: run.runFeeCents, showStatuses: run.shows.map((s) => s.status), headlinerPerformedShows: showsPerformed });
    if (!plan2.ok) throw new Error(plan2.reason);
    const moved = await tx.run.updateMany({ where: { id: run.id, status: { not: "closed" } }, data: { status: "closed", closedAt: /* @__PURE__ */ new Date() } });
    if (moved.count !== 1) throw new Error("Run already closed");
    let payoutId = null;
    if (plan2.createPayout) {
      const key = `run:${run.id}:${run.headlinerId}`;
      const p2 = await tx.comedianPayout.upsert({
        where: { payoutKey: key },
        update: {},
        create: { payoutKey: key, comedianId: run.headlinerId, runId: run.id, amountCents: plan2.payoutCents, currencyCode: "USD", status: "draft", method: "check" }
      });
      payoutId = p2.id;
    }
    await audit(tx, c, "run_closed", "Run", run.id, { status: run.status }, { status: "closed", payoutId, amountCents: plan2.payoutCents, showsPerformed }, plan2.note);
    return { runId: run.id, payoutId, amountCents: plan2.payoutCents, note: plan2.note };
  }, "run:" + a.runId);
}

// features/keystone/mutations/payouts.ts
init_commands();
async function approvePayout(_, a, c) {
  requirePermission(c, "canManagePayouts");
  return command(c, "approvePayout", a, async (tx) => {
    const row = await tx.comedianPayout.findUnique({ where: { id: a.payoutId }, include: { comedian: true } });
    if (!row?.comedian?.payeeDetailsOnFile) throw new Error("Payee details must be on file");
    return transition(tx, c, "comedianPayout", row.id, "approved", { draft: ["approved"] });
  }, "payout:" + a.payoutId);
}
async function recordPayoutPaid(_, a, c) {
  requirePermission(c, "canManagePayouts");
  if (!["check", "ach", "venmo"].includes(a.method) || !a.reference?.trim() || a.reference.length > 200) throw new Error("Payment method and reference required");
  return command(c, "recordPayoutPaid", a, async (tx) => {
    const before = await tx.comedianPayout.findUnique({ where: { id: a.payoutId } });
    if (before?.status !== "approved") throw new Error("Only approved payouts can be paid");
    const changed = await tx.comedianPayout.updateMany({ where: { id: before.id, status: "approved" }, data: { status: "paid", method: a.method, reference: a.reference.trim(), paidAt: /* @__PURE__ */ new Date() } });
    if (changed.count !== 1) throw new Error("Payout changed");
    const after = await tx.comedianPayout.findUnique({ where: { id: before.id } });
    await audit(tx, c, "manual_payment_recorded", "ComedianPayout", before.id, before, after, a.reference.trim());
    return after;
  }, "payout:" + a.payoutId);
}

// features/keystone/mutations/openMic.ts
init_commands();
async function addBringerSignup(_, a, c) {
  requirePermission(c, "canManageTalent");
  const name = String(a.name || "").trim(), email = String(a.email || "").trim().toLowerCase();
  if (!name || !email) throw new Error("Name and email required");
  if (!Number.isInteger(a.guestsRequired) || a.guestsRequired < 1 || a.guestsRequired > 20) throw new Error("Guests required must be 1 to 20");
  return command(c, "addBringerSignup", a, async (tx) => {
    const show = await tx.show.findUnique({ where: { id: a.showId } });
    if (!show?.isOpenMic) throw new Error("Not an open mic");
    const signupKey = show.id + ":" + email;
    if (await tx.openMicSignup.findUnique({ where: { signupKey } })) throw new Error("Already signed up");
    const row = await tx.openMicSignup.create({ data: { signupKey, showId: show.id, name, email, method: "bringer", status: "waiting", bringerGuestsRequired: a.guestsRequired } });
    await audit(tx, c, "bringer_signup", "OpenMicSignup", row.id, null, row);
    return row;
  }, "show:" + a.showId);
}
async function recordBringerArrival(_, a, c) {
  requirePermission(c, "canManageTalent");
  if (!Number.isInteger(a.guests) || a.guests < 1 || a.guests > 20) throw new Error("Guest count must be 1 to 20");
  return command(c, "recordBringerArrival", a, async (tx) => {
    const before = await tx.openMicSignup.findUnique({ where: { id: a.signupId } });
    if (!before || before.method !== "bringer" || before.status !== "waiting") throw new Error("Not a waiting bringer");
    const arrived = Math.min(before.bringerGuestsRequired, before.bringerGuestsArrived + a.guests);
    const changed = await tx.openMicSignup.updateMany({ where: { id: before.id, status: "waiting", bringerGuestsArrived: before.bringerGuestsArrived }, data: { bringerGuestsArrived: arrived } });
    if (changed.count !== 1) throw new Error("Signup changed");
    const after = await tx.openMicSignup.findUnique({ where: { id: before.id } });
    await audit(tx, c, "bringer_arrival", "OpenMicSignup", before.id, before, after);
    return after;
  }, "signup:" + a.signupId);
}
var SIGNUP_FLOW = { waiting: ["called", "skipped", "withdrawn"], called: ["performed", "skipped", "waiting"], skipped: ["waiting", "withdrawn"] };
async function setSignupStatus(_, a, c) {
  requirePermission(c, "canManageTalent");
  return command(c, "setSignupStatus", a, async (tx) => {
    const first = await tx.openMicSignup.findUnique({ where: { id: a.signupId } });
    if (!first) throw new Error("Invalid state transition");
    await lockTransactionKey(tx, "show:" + first.showId);
    const before = await tx.openMicSignup.findUnique({ where: { id: a.signupId } });
    if (!before || !SIGNUP_FLOW[before.status]?.includes(a.status)) throw new Error("Invalid state transition");
    const show = await tx.show.findUnique({ where: { id: before.showId } });
    if (!show || ["cancelled", "settled"].includes(show.status)) throw new Error("Show is closed");
    if (a.status === "called") {
      if (!(before.lotteryNumber > 0)) throw new Error("Run the lottery before calling performers");
      if (await tx.openMicSignup.count({ where: { showId: before.showId, status: "called", id: { not: before.id } } })) throw new Error("Finish the performer on stage first");
    }
    const changed = await tx.openMicSignup.updateMany({ where: { id: before.id, status: before.status }, data: { status: a.status } });
    if (changed.count !== 1) throw new Error("State changed");
    const after = await tx.openMicSignup.findUnique({ where: { id: before.id } });
    await audit(tx, c, "signup_" + a.status, "OpenMicSignup", before.id, before, after);
    return after;
  }, "signup:" + a.signupId);
}

// features/keystone/mutations/waitlist.ts
init_holds();
init_capacity();
init_commands();
init_waitlist();
init_waitlistCore();
async function joinWaitlist(_, a, c) {
  const name = String(a.name || "").trim(), email = String(a.email || "").trim().toLowerCase(), size = a.partySize;
  if (!name || !/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error("Name and email required");
  if (!Number.isInteger(size) || size < 1 || size > 20) throw new Error("Choose a party of 1\u201320");
  return command(c, "joinWaitlist", a, async (tx) => {
    await expireUnderLock(tx, a.showId, c);
    const show = await tx.show.findUnique({ where: { id: a.showId }, include: { room: true } });
    if (!show || !["on_sale", "sold_out"].includes(show.status) || show.startsAt <= /* @__PURE__ */ new Date()) throw new Error("This show has no waitlist");
    const tiers = await tx.priceTier.findMany({ where: { showId: show.id } });
    const totals2 = await tx.priceTier.aggregate({ where: { showId: show.id }, _sum: { sold: true, held: true } });
    const remaining = showCapacity(show) - (totals2._sum.sold || 0) - (totals2._sum.held || 0);
    if (tierFor(size, tiers, remaining, /* @__PURE__ */ new Date())) throw new Error("Tickets are available; no waitlist needed");
    if (await tx.waitlistEntry.count({ where: { showId: show.id, email, status: { in: ["waiting", "offered"] } } })) throw new Error("This email is already on the waitlist");
    const entry = await tx.waitlistEntry.create({ data: { entryKey: code("W"), showId: show.id, name, email, partySize: size, status: "waiting" } });
    await audit(tx, c, "joined", "WaitlistEntry", entry.id, null, { partySize: size });
    return { entryKey: entry.entryKey, position: await tx.waitlistEntry.count({ where: { showId: show.id, status: "waiting", createdAt: { lte: entry.createdAt } } }) };
  }, "show:" + a.showId);
}
async function waitlistOffer(_, a, c) {
  const hold = await c.prisma.inventoryHold.findUnique({ where: { holdKey: a.holdKey }, include: { show: true, waitlistEntry: true } });
  prove(hold, a.cartToken);
  if (!hold.waitlistEntryId) throw new Error("Not found");
  const live = hold.status === "active" && hold.expiresAt > /* @__PURE__ */ new Date();
  return { holdKey: hold.holdKey, live, expiresAt: hold.expiresAt, quantity: hold.quantity, showId: hold.showId, title: hold.show.title, ageRestriction: hold.show.ageRestriction };
}
async function offerWaitlist(_, a, c) {
  requirePermission(c, "canManageOrders");
  return command(c, "offerWaitlist", a, async (tx) => {
    await expireUnderLock(tx, a.showId, c);
    const offered = await offerFreedSeats(tx, c, a.showId);
    return { offered: offered.length };
  }, "show:" + a.showId);
}
async function removeWaitlistEntry(_, a, c) {
  requirePermission(c, "canManageOrders");
  return command(c, "removeWaitlistEntry", a, async (tx) => {
    const first = await tx.waitlistEntry.findUnique({ where: { id: a.entryId } });
    if (!first) throw new Error("Entry not found");
    await lockTransactionKey(tx, "show:" + first.showId);
    const entry = await tx.waitlistEntry.findUnique({ where: { id: a.entryId }, include: { hold: true } });
    if (!entry || !["waiting", "offered"].includes(entry.status)) throw new Error("Entry is already closed");
    if (entry.hold?.status === "active") {
      if (await tx.ticketOrder.count({ where: { hold: { id: entry.hold.id }, status: "pending_payment" } })) throw new Error("This party is paying now");
      await tx.inventoryHold.update({ where: { id: entry.hold.id }, data: { status: "released" } });
      await releaseHoldSeats(tx, entry.hold);
    }
    const moved = await tx.waitlistEntry.updateMany({ where: { id: entry.id, status: entry.status }, data: { status: "cancelled" } });
    if (moved.count !== 1) throw new Error("State changed");
    await audit(tx, c, "cancelled", "WaitlistEntry", entry.id, { status: entry.status }, { status: "cancelled" }, a.reason || "");
    const offered = await offerFreedSeats(tx, c, entry.showId);
    return { id: entry.id, offered: offered.length };
  });
}

// features/keystone/mutations/reports.ts
init_commands();

// features/keystone/lib/reporting.ts
var MAX_PERIOD_DAYS = 366;
var DAY = /^\d{4}-\d{2}-\d{2}$/;
function parsePeriod(from, to, tz) {
  if (!DAY.test(String(from)) || !DAY.test(String(to))) throw new Error("Dates must be YYYY-MM-DD");
  const check = (d) => {
    const x = /* @__PURE__ */ new Date(d + "T00:00:00Z");
    if (Number.isNaN(x.getTime()) || x.toISOString().slice(0, 10) !== d) throw new Error("Invalid date");
    return x;
  };
  const f = check(from), t = check(to);
  if (t < f) throw new Error("End date is before start date");
  if ((t.getTime() - f.getTime()) / 864e5 + 1 > MAX_PERIOD_DAYS) throw new Error(`Choose a period of at most ${MAX_PERIOD_DAYS} days`);
  const next = new Date(t.getTime() + 864e5).toISOString().slice(0, 10);
  return { start: zonedTime(from, "00:00", tz), endExclusive: zonedTime(next, "00:00", tz) };
}
var ENTERED = /* @__PURE__ */ new Set(["valid", "checked_in"]);
var DONE = /* @__PURE__ */ new Set(["completed", "settled"]);
function buildShowRows(shows, tickets) {
  const by = /* @__PURE__ */ new Map();
  for (const t of tickets) {
    if (!ENTERED.has(t.status)) continue;
    const a = by.get(t.showId) || { sold: 0, comp: 0, checkedIn: 0 };
    if (t.orderStatus === "comp") a.comp++;
    else a.sold++;
    if (t.status === "checked_in") a.checkedIn++;
    by.set(t.showId, a);
  }
  return shows.map((s) => {
    const a = by.get(s.id) || { sold: 0, comp: 0, checkedIn: 0 };
    const st = s.settlement?.status === "closed" ? s.settlement : null;
    return {
      id: s.id,
      title: s.title,
      startsAt: s.startsAt,
      status: s.status,
      runId: s.runId,
      ...a,
      noShow: DONE.has(s.status) ? a.sold + a.comp - a.checkedIn : null,
      settled: Boolean(st),
      ticketCents: st ? st.ticketGrossCents + st.feesCents - st.discountsCents - st.refundsCents : 0,
      fbCents: st ? st.foodBeverageGrossCents + st.minimumShortfallRevenueCents : 0,
      talentCents: st ? st.talentCostCents : 0,
      netCents: st ? st.netCents : 0
    };
  });
}
function totals(rows, runFeeCents = 0) {
  const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
  const nightsNetCents = sum((r) => r.netCents);
  return { shows: rows.length, settledShows: rows.filter((r) => r.settled).length, sold: sum((r) => r.sold), comp: sum((r) => r.comp), checkedIn: sum((r) => r.checkedIn), noShow: sum((r) => r.noShow || 0), ticketCents: sum((r) => r.ticketCents), fbCents: sum((r) => r.fbCents), talentCents: sum((r) => r.talentCents), runFeeCents, nightsNetCents, netCents: nightsNetCents - runFeeCents };
}
function runFeeInPeriod(run, start, endExclusive) {
  return run.lastShowAt && run.lastShowAt >= start && run.lastShowAt < endExclusive ? run.payoutCents : 0;
}
function runRollups(rows, runs, start, endExclusive) {
  return runs.map((r) => {
    const mine = rows.filter((x) => x.runId === r.id);
    const nights = mine.reduce((n, x) => n + x.netCents, 0);
    const fee = runFeeInPeriod(r, start, endExclusive);
    return { id: r.id, headliner: r.headliner, shows: mine.length, settled: mine.filter((x) => x.settled).length, nightsNetCents: nights, runFeeCents: fee, feeInLaterPeriod: r.payoutCents > 0 && fee === 0, netCents: nights - fee, lastShowAt: r.lastShowAt };
  });
}
function csvText(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}
var centsText = (c) => (c < 0 ? "-" : "") + Math.floor(Math.abs(c) / 100) + "." + String(Math.abs(c) % 100).padStart(2, "0");
function reportCsv(rows, tz, runFees = []) {
  const head = ["date", "show", "status", "tickets_sold", "comps", "checked_in", "no_shows", "settled", "ticket_revenue", "food_beverage_revenue", "talent_cost", "net"];
  const day = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const lines = rows.map((r) => [day(r.startsAt), csvText(r.title), csvText(r.status), r.sold, r.comp, r.checkedIn, r.noShow ?? "", r.settled ? "yes" : "no", ...r.settled ? [r.ticketCents, r.fbCents, r.talentCents, r.netCents].map(centsText) : ["", "", "", ""]].join(","));
  for (const f of runFees.filter((x) => x.cents > 0)) lines.push([day(f.at), csvText(`Run fee: ${f.headliner}`), "run_fee", "", "", "", "", "", "", "", centsText(f.cents), centsText(-f.cents)].join(","));
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}

// features/keystone/mutations/reports.ts
async function venueTz(prisma) {
  return (await prisma.venue.findFirst({ select: { timezone: true } }))?.timezone || "America/Chicago";
}
async function load(db, from, to) {
  const tz = await venueTz(db);
  const { start, endExclusive } = parsePeriod(from, to, tz);
  const shows = await db.show.findMany({
    where: { startsAt: { gte: start, lt: endExclusive }, status: { notIn: ["draft", "cancelled"] } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    select: { id: true, title: true, startsAt: true, status: true, runId: true, settlement: { select: { status: true, ticketGrossCents: true, feesCents: true, discountsCents: true, refundsCents: true, foodBeverageGrossCents: true, minimumShortfallRevenueCents: true, tipsCents: true, talentCostCents: true, netCents: true } } }
  });
  const ids = shows.map((s) => s.id);
  const tickets = ids.length ? await db.ticket.findMany({ where: { showId: { in: ids } }, select: { showId: true, status: true, order: { select: { status: true } } } }) : [];
  const rows = buildShowRows(shows, tickets.map((t) => ({ showId: t.showId, status: t.status, orderStatus: t.order?.status || "paid" })));
  const runIds = [...new Set(shows.map((s) => s.runId).filter(Boolean))];
  const runs = runIds.length ? await db.run.findMany({ where: { id: { in: runIds } }, select: { id: true, headliner: { select: { stageName: true } }, payouts: { where: { runId: { not: null }, status: { not: "void" } }, select: { amountCents: true } } } }) : [];
  const lasts = runIds.length ? await db.show.groupBy({ by: ["runId"], where: { runId: { in: runIds }, status: { notIn: ["draft", "cancelled"] } }, _max: { startsAt: true } }) : [];
  const lastBy = new Map(lasts.map((l) => [l.runId, l._max.startsAt]));
  const inputs = runs.map((r) => ({ id: r.id, headliner: r.headliner?.stageName || "No headliner", payoutCents: r.payouts.reduce((n, p2) => n + p2.amountCents, 0), lastShowAt: lastBy.get(r.id) || null }));
  const rollups = runRollups(rows, inputs, start, endExclusive);
  const runFees = inputs.map((r) => ({ headliner: r.headliner, at: r.lastShowAt, cents: runFeeInPeriod(r, start, endExclusive) })).filter((f) => f.cents > 0);
  const feeTotal = runFees.reduce((n, f) => n + f.cents, 0);
  return { tz, rows, totals: totals(rows, feeTotal), runs: rollups, runFees };
}
async function showReport(_, a, c) {
  requirePermission(c, "canManagePayouts");
  const r = await load(c.prisma, a.from, a.to);
  return { from: a.from, to: a.to, timezone: r.tz, totals: r.totals, runs: r.runs, shows: r.rows };
}
async function exportShowReport(_, a, c) {
  requirePermission(c, "canManagePayouts");
  return command(c, "exportShowReport", { from: a.from, to: a.to, idempotencyKey: a.idempotencyKey }, async (tx) => {
    const r = await load(tx, a.from, a.to);
    const out = { fileName: `show-report-${a.from}-to-${a.to}.csv`, rows: r.rows.length + r.runFees.length, netCents: r.totals.netCents, csv: reportCsv(r.rows, r.tz, r.runFees) };
    await audit(tx, c, "report_exported", "ShowSettlement", `period:${a.from}:${a.to}`, null, { from: a.from, to: a.to, rows: out.rows, netCents: out.netCents }, a.idempotencyKey);
    return out;
  });
}

// features/keystone/mutations/payStatements.ts
init_commands();

// features/keystone/lib/payStatement.ts
var MIN_YEAR = 2e3;
function parseYear(v, now = /* @__PURE__ */ new Date()) {
  const y = Number(v);
  if (!Number.isInteger(y) || y < MIN_YEAR || y > now.getUTCFullYear() + 1) throw new Error("Choose a valid year");
  return y;
}
function yearRange(year, tz) {
  return { start: zonedTime(`${year}-01-01`, "00:00", tz), endExclusive: zonedTime(`${year + 1}-01-01`, "00:00", tz) };
}
function buildStatement(payouts, start, endExclusive) {
  const paid = payouts.filter((p2) => p2.status === "paid");
  const undated = paid.filter((p2) => !p2.paidAt).length;
  const inYear = paid.filter((p2) => p2.paidAt && p2.paidAt >= start && p2.paidAt < endExclusive).sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime() || a.id.localeCompare(b.id));
  let ytd = 0;
  const rows = inYear.map((p2) => {
    ytd += p2.amountCents;
    return { id: p2.id, paidAt: p2.paidAt, kind: p2.showTitle ? "show" : p2.runNote !== null ? "run" : "other", label: p2.showTitle || (p2.runNote !== null ? p2.runNote ? `Run fee: ${p2.runNote}` : "Run fee" : "Payout"), method: p2.method, reference: p2.reference, amountCents: p2.amountCents, ytdCents: ytd };
  });
  const pending = payouts.filter((p2) => p2.status === "draft" || p2.status === "approved");
  return { rows, paidCents: ytd, pendingCents: pending.reduce((n, p2) => n + p2.amountCents, 0), pendingCount: pending.length, undated };
}
function statementCsv(payee, year, rows, tz, paidCents) {
  const day = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const head = ["Paid on", "Payee", "Legal name", "For", "Type", "Method", "Reference", "Amount", "Year to date"];
  const lines = rows.map((r) => [day(r.paidAt), csvText(payee.stageName), csvText(payee.legalName), csvText(r.label), r.kind === "run" ? "run_fee" : r.kind, r.method, csvText(r.reference), centsText(r.amountCents), centsText(r.ytdCents)].join(","));
  lines.push([`${year} total`, csvText(payee.stageName), csvText(payee.legalName), "", "", "", "", centsText(paidCents), centsText(paidCents)].join(","));
  return [head.join(","), ...lines].join("\n") + "\n";
}

// features/keystone/mutations/payStatements.ts
async function load2(db, comedianId, yearInput) {
  const year = parseYear(yearInput);
  const tz = (await db.venue.findFirst({ select: { timezone: true } }))?.timezone || "America/Chicago";
  const comedian = await db.comedian.findUnique({ where: { id: String(comedianId || "") }, select: { id: true, stageName: true, legalName: true, payeeDetailsOnFile: true } });
  if (!comedian) throw new Error("Comedian not found");
  const payouts = await db.comedianPayout.findMany({
    where: { comedianId: comedian.id, status: { not: "void" } },
    orderBy: [{ paidAt: "asc" }, { id: "asc" }],
    select: { id: true, status: true, amountCents: true, paidAt: true, createdAt: true, method: true, reference: true, show: { select: { title: true, startsAt: true } }, run: { select: { notes: true } } }
  });
  const { start, endExclusive } = yearRange(year, tz);
  const s = buildStatement(payouts.map((p2) => ({ id: p2.id, status: p2.status, amountCents: p2.amountCents ?? 0, paidAt: p2.paidAt, createdAt: p2.createdAt, method: p2.method || "check", reference: p2.reference || "", showTitle: p2.show?.title || null, showAt: p2.show?.startsAt || null, runNote: p2.run ? p2.run.notes || "" : null })), start, endExclusive);
  return { year, tz, comedian, ...s };
}
async function payStatement(_, a, c) {
  requirePermission(c, "canManagePayouts");
  const r = await load2(c.prisma, a.comedianId, a.year);
  return { year: r.year, timezone: r.tz, comedian: { id: r.comedian.id, stageName: r.comedian.stageName, legalName: r.comedian.legalName, payeeDetailsOnFile: r.comedian.payeeDetailsOnFile }, rows: r.rows, paidCents: r.paidCents, pendingCents: r.pendingCents, pendingCount: r.pendingCount, undated: r.undated };
}
async function exportPayStatement(_, a, c) {
  requirePermission(c, "canManagePayouts");
  return command(c, "exportPayStatement", { comedianId: a.comedianId, year: a.year, idempotencyKey: a.idempotencyKey }, async (tx) => {
    const r = await load2(tx, a.comedianId, a.year);
    const out = { fileName: `pay-statement-${r.year}-${r.comedian.stageName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "payee"}.csv`, rows: r.rows.length, paidCents: r.paidCents, csv: statementCsv(r.comedian, r.year, r.rows, r.tz, r.paidCents) };
    await audit(tx, c, "pay_statement_exported", "Comedian", r.comedian.id, null, { year: r.year, rows: out.rows, paidCents: out.paidCents }, a.idempotencyKey);
    return out;
  });
}

// features/keystone/mutations/series.ts
var import_node_crypto8 = __toESM(require("node:crypto"));
init_commands();

// features/keystone/lib/series.ts
var MAX_SERIES_SHOWS = 26;
var MAX_SERIES_SPAN_DAYS = 400;
var DAY2 = /^\d{4}-\d{2}-\d{2}$/;
var HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
var FALLBACK_MINUTES = 90;
var localTime = (d, tz) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
var realDay = (s) => {
  if (!DAY2.test(s)) throw new Error("Dates must be YYYY-MM-DD");
  const x = /* @__PURE__ */ new Date(s + "T00:00:00Z");
  if (Number.isNaN(x.getTime()) || x.toISOString().slice(0, 10) !== s) throw new Error("Invalid date: " + s);
  return x;
};
var addDays = (s, n) => new Date(realDay(s).getTime() + n * 864e5).toISOString().slice(0, 10);
function expandDays(p2) {
  let days;
  if (p2.dates?.length) days = p2.dates.map(String);
  else {
    if (!p2.from) throw new Error("Choose the dates or a start date");
    const count = Number(p2.count), step = Number(p2.everyDays ?? 7);
    if (!Number.isInteger(count) || count < 1) throw new Error("Choose how many shows");
    if (!Number.isInteger(step) || step < 1 || step > 60) throw new Error("Days between shows must be 1 to 60");
    if (count > MAX_SERIES_SHOWS) throw new Error(`A series can create at most ${MAX_SERIES_SHOWS} shows`);
    days = Array.from({ length: count }, (_, i) => addDays(p2.from, i * step));
  }
  for (const d of days) realDay(d);
  days = [...new Set(days)].sort();
  if (!days.length) throw new Error("Choose at least one date");
  if (days.length > MAX_SERIES_SHOWS) throw new Error(`A series can create at most ${MAX_SERIES_SHOWS} shows`);
  if ((realDay(days[days.length - 1]).getTime() - realDay(days[0]).getTime()) / 864e5 > MAX_SERIES_SPAN_DAYS) throw new Error("A series cannot span more than " + MAX_SERIES_SPAN_DAYS + " days");
  return days;
}
var endOf = (s) => s.endsAt ?? new Date(s.startsAt.getTime() + FALLBACK_MINUTES * 6e4);
var overlaps = (a, b) => a.startsAt < endOf(b) && b.startsAt < endOf(a);
function planSeries(source, tz, p2, existing, now, startTime, keyPrefix = "series") {
  if (startTime !== void 0 && !HHMM.test(startTime)) throw new Error("Start time must be HH:MM");
  const time = startTime || localTime(source.startsAt, tz);
  const doorsLead = source.doorsAt ? source.startsAt.getTime() - source.doorsAt.getTime() : null;
  const length = source.endsAt ? source.endsAt.getTime() - source.startsAt.getTime() : null;
  if (doorsLead !== null && doorsLead < 0) throw new Error("The source show has doors after its start");
  if (length !== null && length <= 0) throw new Error("The source show ends before it starts");
  const rows = expandDays(p2).map((day) => {
    const startsAt = zonedTime(day, time, tz);
    const row = { day, startsAt, doorsAt: doorsLead === null ? null : new Date(startsAt.getTime() - doorsLead), endsAt: length === null ? null : new Date(startsAt.getTime() + length), key: `${keyPrefix}:${day}`, problem: null };
    if (startsAt <= now) row.problem = "In the past";
    else {
      const clash = existing.find((e) => overlaps(row, e));
      if (clash) row.problem = `Room already booked: ${clash.title}`;
    }
    return row;
  });
  return rows;
}
var planProblems = (rows) => rows.filter((r) => r.problem);
function editable(show, now) {
  return !!show.startsAt && show.startsAt > now && !["cancelled", "completed", "settled", "in_progress", "doors_open"].includes(show.status);
}
function normalizeEdit(e) {
  const out = {};
  if (e.title !== void 0) {
    const t = String(e.title).trim();
    if (!t || t.length > 120) throw new Error("Title is required (120 characters at most)");
    out.title = t;
  }
  if (e.publicNote !== void 0) {
    const n = String(e.publicNote);
    if (n.length > 1e3) throw new Error("Note is too long");
    out.publicNote = n;
  }
  if (e.ageRestriction !== void 0) {
    if (!["all", "18", "21"].includes(String(e.ageRestriction))) throw new Error("Age must be all, 18 or 21");
    out.ageRestriction = String(e.ageRestriction);
  }
  if (e.startTime !== void 0 && e.startTime !== null && e.startTime !== "") {
    if (!HHMM.test(String(e.startTime))) throw new Error("Start time must be HH:MM");
    out.startTime = String(e.startTime);
  }
  if (e.capacity !== void 0 && e.capacity !== null) {
    const c = Number(e.capacity);
    if (!Number.isInteger(c) || c < 1 || c > 5e3) throw new Error("Capacity must be 1 to 5000");
    out.capacity = c;
  }
  if (!Object.keys(out).length) throw new Error("Nothing to change");
  return out;
}

// features/keystone/mutations/series.ts
var SOURCE_SELECT = { id: true, title: true, startsAt: true, doorsAt: true, endsAt: true, roomId: true, capacity: true, ageRestriction: true, publicNote: true, isOpenMic: true, status: true, room: { select: { capacity: true, venue: { select: { timezone: true } } } } };
async function tzOf(db, show) {
  return show.room?.venue?.timezone || (await db.venue.findFirst({ select: { timezone: true } }))?.timezone || "America/Chicago";
}
async function loadSource(db, id2) {
  const s = await db.show.findUnique({ where: { id: String(id2 || "") }, select: SOURCE_SELECT });
  if (!s || !s.startsAt || !s.roomId) throw new Error("The source show needs a room and a start time");
  if (s.status === "cancelled") throw new Error("A cancelled show cannot be copied");
  return s;
}
async function roomShows(db, roomId, from, to, excludeIds = []) {
  const rows = await db.show.findMany({ where: { roomId, status: { not: "cancelled" }, id: { notIn: excludeIds }, startsAt: { gte: new Date(from.getTime() - 864e5), lte: new Date(to.getTime() + 864e5) } }, select: { id: true, title: true, startsAt: true, endsAt: true } });
  return rows.filter((r) => r.startsAt);
}
async function plan(db, a, now = /* @__PURE__ */ new Date(), keyPrefix = "preview") {
  const source = await loadSource(db, a.sourceShowId);
  const tz = await tzOf(db, source);
  const pattern = { dates: a.dates, from: a.from, count: a.count, everyDays: a.everyDays };
  const first = planSeries(source, tz, pattern, [], now, a.startTime || void 0, keyPrefix);
  const existing = await roomShows(db, source.roomId, first[0].startsAt, first[first.length - 1].startsAt);
  const rows = planSeries(source, tz, pattern, existing, now, a.startTime || void 0, keyPrefix);
  return { source, tz, rows };
}
var view = (rows, tz) => rows.map((r) => ({ day: r.day, startsAt: r.startsAt.toISOString(), time: localTime(r.startsAt, tz), problem: r.problem }));
async function previewShowSeries(_, a, c) {
  requirePermission(c, "canManageShows");
  const { source, tz, rows } = await plan(c.prisma, a);
  const tiers = await c.prisma.priceTier.count({ where: { showId: source.id } });
  const slots = a.copyLineup ? await c.prisma.lineupSlot.count({ where: { showId: source.id, status: { notIn: ["cancelled", "declined"] } } }) : 0;
  return { title: source.title, timezone: tz, rows: view(rows, tz), problems: planProblems(rows).length, tiers, lineupSlots: slots };
}
async function createShowSeries(_, a, c) {
  requirePermission(c, "canManageShows");
  const name = String(a.name || "").trim();
  if (name.length > 120) throw new Error("Name is too long");
  const src = await loadSource(c.prisma, a.sourceShowId);
  return command(c, "createShowSeries", a, async (tx) => {
    await lockTransactionKey(tx, "room:" + src.roomId);
    const groupKey = "grp_" + import_node_crypto8.default.randomBytes(8).toString("hex");
    const { source, tz, rows } = await plan(tx, a, /* @__PURE__ */ new Date(), groupKey);
    const bad = planProblems(rows);
    if (bad.length) throw new Error(`${bad.length} date${bad.length === 1 ? "" : "s"} cannot be created: ${bad.slice(0, 3).map((r) => `${r.day} (${r.problem})`).join("; ")}`);
    const tiers = await tx.priceTier.findMany({ where: { showId: source.id } });
    const slots = a.copyLineup ? await tx.lineupSlot.findMany({ where: { showId: source.id, status: { notIn: ["cancelled", "declined"] }, comedian: { status: { not: "inactive" } } } }) : [];
    const group = await tx.showGroup.create({ data: { name: name || source.title, groupKey, sourceShow: { connect: { id: source.id } } } });
    const ids = [];
    for (const r of rows) {
      const cap = Math.min(source.capacity ?? source.room.capacity, source.room.capacity ?? source.capacity);
      const show = await tx.show.create({ data: { roomId: source.roomId, groupId: group.id, title: source.title, occurrenceKey: r.key, startsAt: r.startsAt, doorsAt: r.doorsAt, endsAt: r.endsAt, signupOpensAt: source.isOpenMic ? new Date(r.startsAt.getTime() - 7 * 864e5) : null, ageRestriction: source.ageRestriction, publicNote: source.publicNote, capacity: cap, status: "draft", isOpenMic: source.isOpenMic } });
      const shift = (d) => d ? new Date(r.startsAt.getTime() - (source.startsAt.getTime() - d.getTime())) : null;
      for (const t of tiers) await tx.priceTier.create({ data: { showId: show.id, name: t.name, priceCents: t.priceCents, feeCents: t.feeCents, capacity: Math.min(t.capacity, cap), isTableTier: t.isTableTier, seatsPerUnit: t.seatsPerUnit, salesStartAt: shift(t.salesStartAt), salesEndAt: shift(t.salesEndAt), status: "on_sale" } });
      for (const s of slots) await tx.lineupSlot.create({ data: { showId: show.id, comedianId: s.comedianId, role: s.role, position: s.position, setMinutes: s.setMinutes, feeCents: s.feeCents, bonusCents: 0, status: "offered" } });
      ids.push(show.id);
    }
    await audit(tx, c, "series_created", "ShowGroup", group.id, null, { source: source.id, shows: ids.length, lineup: slots.length, days: rows.map((r) => r.day) }, name);
    return { groupId: group.id, created: ids.length, showIds: ids, timezone: tz };
  });
}
async function inScope(db, groupId, now) {
  const group = await db.showGroup.findUnique({ where: { id: String(groupId || "") }, include: { shows: { select: { id: true, title: true, startsAt: true, doorsAt: true, endsAt: true, status: true, roomId: true, capacity: true, room: { select: { capacity: true, venue: { select: { timezone: true } } } } }, orderBy: { startsAt: "asc" } } } });
  if (!group) throw new Error("Series not found");
  const live = group.shows.filter((s) => editable(s, now));
  return { group, live, skipped: group.shows.length - live.length };
}
async function editShowSeries(_, a, c) {
  requirePermission(c, "canManageShows");
  const edit = normalizeEdit(a.edit || {});
  return command(c, "editShowSeries", a, async (tx) => {
    await lockTransactionKey(tx, "group:" + a.groupId);
    const now = /* @__PURE__ */ new Date();
    const { group, live, skipped } = await inScope(tx, a.groupId, now);
    if (group.cancelRequestedAt && !group.cancelCompletedAt) throw new Error("This series is being cancelled");
    if (!live.length) throw new Error("No future shows in this series");
    const roomId = live[0].roomId;
    if (roomId) await lockTransactionKey(tx, "room:" + roomId);
    const ids = live.map((s) => s.id);
    const seats = await tx.priceTier.groupBy({ by: ["showId"], where: { showId: { in: ids } }, _sum: { sold: true, held: true } });
    const taken = new Map(seats.map((g) => [g.showId, (g._sum.sold || 0) + (g._sum.held || 0)]));
    const tickets = await tx.ticket.groupBy({ by: ["showId"], where: { showId: { in: ids }, status: { not: "void" } }, _count: { _all: true } });
    const hasTickets = new Set(tickets.map((t) => t.showId));
    const changes = {};
    for (const s of live) {
      const data = {};
      if (edit.title !== void 0) data.title = edit.title;
      if (edit.publicNote !== void 0) data.publicNote = edit.publicNote;
      if (edit.ageRestriction !== void 0 && edit.ageRestriction !== s.ageRestriction) {
        if (hasTickets.has(s.id) || (taken.get(s.id) || 0) > 0) throw new Error(`${s.title}: the age rule cannot change once tickets are sold or held`);
        data.ageRestriction = edit.ageRestriction;
      }
      if (edit.capacity !== void 0) {
        const room = s.room?.capacity;
        const cap = Math.min(edit.capacity, room ?? edit.capacity);
        if (cap < (taken.get(s.id) || 0)) throw new Error(`${s.title}: ${taken.get(s.id)} seats are already sold or held`);
        if (edit.capacity > (room ?? edit.capacity)) throw new Error(`${s.title}: the room holds ${room}`);
        data.capacity = cap;
      }
      if (edit.startTime !== void 0) {
        if (hasTickets.has(s.id) || (taken.get(s.id) || 0) > 0) throw new Error(`${s.title}: the time cannot change once tickets are sold or held`);
        const tz = s.room?.venue?.timezone || "America/Chicago";
        const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(s.startsAt);
        const startsAt = zonedTime(day, edit.startTime, tz);
        if (startsAt <= now) throw new Error(`${s.title}: the new time is in the past`);
        data.startsAt = startsAt;
        if (s.doorsAt) data.doorsAt = new Date(startsAt.getTime() - (s.startsAt.getTime() - s.doorsAt.getTime()));
        if (s.endsAt) data.endsAt = new Date(startsAt.getTime() + (s.endsAt.getTime() - s.startsAt.getTime()));
      }
      changes[s.id] = data;
    }
    if (edit.startTime !== void 0 && roomId) {
      const moved = live.map((s) => ({ ...s, ...changes[s.id] }));
      const others = await roomShows(tx, roomId, moved[0].startsAt, moved[moved.length - 1].startsAt, ids);
      for (const m of moved) {
        const clash = others.find((o) => overlaps(m, o));
        if (clash) throw new Error(`${m.title}: the room is already booked then (${clash.title})`);
      }
    }
    for (const s of live) await tx.show.update({ where: { id: s.id }, data: changes[s.id] });
    await audit(tx, c, "series_edited", "ShowGroup", group.id, null, { edit, shows: live.length, skipped });
    return { edited: live.length, skipped };
  });
}
async function seriesCancelStatus(db, group) {
  const ids = Array.isArray(group.cancelShowIds) ? group.cancelShowIds : [];
  if (!group.cancelRequestedAt) return { requested: false, completed: false, total: 0, done: 0, ran: 0, refundsWaiting: 0, pending: [] };
  const shows = ids.length ? await db.show.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } }) : [];
  const owed = ids.length ? await db.ticketOrder.groupBy({ by: ["showId"], where: { showId: { in: ids }, status: { in: ["paid", "partially_refunded"] } }, _count: { _all: true } }) : [];
  const owing = new Map(owed.map((o) => [o.showId, o._count._all]));
  const ran = shows.filter((x) => ["completed", "settled"].includes(x.status)).map((x) => x.id);
  const pending = ids.filter((id2) => {
    const sh = shows.find((x) => x.id === id2);
    return !!sh && !ran.includes(id2) && (sh.status !== "cancelled" || (owing.get(id2) || 0) > 0);
  });
  const refundsWaiting = ids.filter((id2) => !ran.includes(id2)).reduce((n, id2) => n + (owing.get(id2) || 0), 0);
  return { requested: true, completed: !!group.cancelCompletedAt, total: ids.length, done: ids.length - pending.length, ran: ran.length, refundsWaiting, pending };
}
async function advanceSeriesCancel(c, groupId, actorId, budgetMs) {
  const started = Date.now();
  const load4 = () => c.prisma.showGroup.findUnique({ where: { id: groupId }, select: { id: true, name: true, cancelRequestedAt: true, cancelCompletedAt: true, cancelReason: true, cancelShowIds: true } });
  let group = await load4();
  if (!group?.cancelRequestedAt) throw new Error("No cancellation was requested for this series");
  const problems = [];
  let refunded = 0, failed = 0, worked = 0, last = 0;
  if (!group.cancelCompletedAt) {
    const st = await seriesCancelStatus(c.prisma, group);
    for (const showId of st.pending) {
      if (worked > 0 && Date.now() - started + last >= budgetMs) break;
      const t0 = Date.now();
      try {
        const show = await c.prisma.show.findUnique({ where: { id: showId }, select: { status: true, title: true } });
        if (show && ["doors_open", "in_progress"].includes(show.status)) {
          problems.push(`${show.title}: already running, not cancelled`);
          continue;
        }
        const r = show?.status === "cancelled" ? await refundCancelledShow(c, showId, group.cancelReason, actorId) : await cancelShowCore({ ...c, session: c.session || { itemId: actorId } }, { showId, reason: group.cancelReason, idempotencyKey: `series-cancel:${group.id}:${showId}` }, actorId);
        refunded += r.refunded;
        failed += r.failed;
        worked++;
      } catch (e) {
        problems.push(e.message);
        worked++;
      }
      last = Math.max(last, Date.now() - t0);
    }
    group = await load4();
    const after = await seriesCancelStatus(c.prisma, group);
    if (after.requested && after.done === after.total && !group.cancelCompletedAt) {
      await c.prisma.$transaction(async (tx) => {
        await lockTransactionKey(tx, "group:" + groupId);
        const moved = await tx.showGroup.updateMany({ where: { id: groupId, cancelCompletedAt: null }, data: { cancelCompletedAt: /* @__PURE__ */ new Date() } });
        if (moved.count) await audit(tx, { session: { itemId: actorId } }, "series_cancelled", "ShowGroup", groupId, null, { shows: after.total }, group.cancelReason);
      });
      group = await load4();
    }
  }
  const status = await seriesCancelStatus(c.prisma, group);
  return { ...status, refunded, failed, problems };
}
async function recordSeriesCancel(c, a) {
  requirePermission(c, "canManageShows");
  requirePermission(c, "canIssueRefunds");
  const reason = String(a.reason || "").trim();
  if (!reason) throw new Error("A reason is required");
  const groupId = String(a.groupId || "");
  await command(c, "cancelShowSeries", { ...a, reason }, async (tx) => {
    await lockTransactionKey(tx, "group:" + groupId);
    const { group, live } = await inScope(tx, groupId, /* @__PURE__ */ new Date());
    if (group.cancelRequestedAt) return { recorded: false };
    if (!live.length) throw new Error("No future shows in this series");
    await tx.showGroup.update({ where: { id: group.id }, data: { cancelRequestedAt: /* @__PURE__ */ new Date(), cancelRequestedBy: { connect: { id: c.session.itemId } }, cancelReason: reason, cancelShowIds: live.map((s) => s.id), cancelCompletedAt: null } });
    await audit(tx, c, "series_cancel_requested", "ShowGroup", group.id, null, { shows: live.length, showIds: live.map((s) => s.id) }, reason);
    return { recorded: true, shows: live.length };
  }, "group:" + groupId);
  return groupId;
}
async function cancelShowSeries(_, a, c) {
  const groupId = await recordSeriesCancel(c, a);
  return advanceSeriesCancel(c, groupId, c.session.itemId, 6e3);
}
async function seriesCancelProgress(_, a, c) {
  requirePermission(c, "canManageShows");
  const group = await c.prisma.showGroup.findUnique({ where: { id: String(a.groupId || "") }, select: { id: true, cancelRequestedAt: true, cancelCompletedAt: true, cancelShowIds: true, cancelReason: true } });
  if (!group) throw new Error("Series not found");
  const { pending, ...rest } = await seriesCancelStatus(c.prisma, group);
  return { ...rest, reason: group.cancelReason, requestedAt: group.cancelRequestedAt };
}

// features/keystone/mutations/layout.ts
init_commands();

// features/keystone/lib/layout.ts
var SHAPES = ["round", "square", "rectangle"];
var MAX_SEATS = 24;
var MAX_COORD = 2e3;
var int = (v, name, min, max) => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be a whole number from ${min} to ${max}`);
  return n;
};
var text43 = (v, name, max) => {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  if (!s) throw new Error(`${name} is required`);
  if (s.length > max) throw new Error(`${name} must be ${max} characters or fewer`);
  return s;
};
var id = (v, name) => {
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`${name} is required`);
  return s;
};
var shape = (v) => {
  if (!SHAPES.includes(v)) throw new Error("Shape must be round, square or rectangle");
  return v;
};
function normalizeChange(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  switch (r.kind) {
    case "addSection":
      return { kind: "addSection", name: text43(r.name, "Section name", 40) };
    case "renameSection":
      return { kind: "renameSection", sectionId: id(r.sectionId, "Section"), name: text43(r.name, "Section name", 40) };
    case "removeSection":
      return { kind: "removeSection", sectionId: id(r.sectionId, "Section") };
    case "addTable":
      return { kind: "addTable", sectionId: id(r.sectionId, "Section"), label: text43(r.label, "Table label", 20), seats: int(r.seats, "Seats", 1, MAX_SEATS), shape: shape(r.shape ?? "round"), x: int(r.x ?? 0, "X", 0, MAX_COORD), y: int(r.y ?? 0, "Y", 0, MAX_COORD) };
    case "updateTable": {
      const out = { kind: "updateTable", tableId: id(r.tableId, "Table") };
      if (r.sectionId !== void 0) out.sectionId = id(r.sectionId, "Section");
      if (r.label !== void 0) out.label = text43(r.label, "Table label", 20);
      if (r.seats !== void 0) out.seats = int(r.seats, "Seats", 1, MAX_SEATS);
      if (r.shape !== void 0) out.shape = shape(r.shape);
      if (r.x !== void 0) out.x = int(r.x, "X", 0, MAX_COORD);
      if (r.y !== void 0) out.y = int(r.y, "Y", 0, MAX_COORD);
      if (Object.keys(out).length === 2) throw new Error("Nothing to change");
      return out;
    }
    case "removeTable":
      return { kind: "removeTable", tableId: id(r.tableId, "Table") };
    default:
      throw new Error("Unknown layout change");
  }
}
var where = (u) => `${u.liveShows.slice(0, 3).join(", ")}${u.liveShows.length > 3 ? ` and ${u.liveShows.length - 3} more` : ""}`;
function removeTableBlock(label, use) {
  if (use.liveShows.length) return `Table ${label} is held, sold or seated for ${where(use)}. Cancel or move those first.`;
  if (use.history > 0) return `Table ${label} has ${use.history} past booking${use.history === 1 ? "" : "s"} on record, so it cannot be deleted. Rename it or leave it in place.`;
  return null;
}
function tableEditBlock(label, use, current, change) {
  const resizing = change.seats !== void 0 && change.seats !== current.seats;
  const moving = change.sectionId !== void 0 && change.sectionId !== current.sectionId;
  if ((resizing || moving) && use.liveShows.length) return `Table ${label} is held, sold or seated for ${where(use)}, so its seats and section cannot change now.`;
  return null;
}
var layoutCapacity = (tables) => tables.reduce((n, t) => n + (t.seats || 0), 0);
function capacityBlock(newCapacity, shows) {
  const bad = shows.filter((s) => s.sold + s.held > newCapacity);
  return bad.length ? `That leaves ${newCapacity} seats, but ${bad[0].title} has ${bad[0].sold + bad[0].held} sold or held.` : null;
}
var sameLabel = (a, b) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

// features/keystone/mutations/layout.ts
var DONE2 = ["cancelled", "completed", "settled"];
var MAX_CHANGES = 60;
var Rollback = class extends Error {
  constructor(result) {
    super("rollback");
    this.result = result;
  }
};
async function liveUse(tx, tableId) {
  const live = { status: { notIn: DONE2 } };
  const [occ, holds, assigns, histOcc, histHolds, histAssigns] = await Promise.all([
    tx.tableOccupancy.findMany({ where: { tableId, occupancyKey: { not: null }, show: live }, select: { show: { select: { title: true } } } }),
    tx.inventoryHold.findMany({ where: { tables: { some: { id: tableId } }, status: "active", show: live }, select: { show: { select: { title: true } } } }),
    tx.seatingAssignment.findMany({ where: { tables: { some: { id: tableId } }, status: { not: "closed" }, show: live }, select: { show: { select: { title: true } } } }),
    tx.tableOccupancy.count({ where: { tableId } }),
    tx.inventoryHold.count({ where: { tables: { some: { id: tableId } } } }),
    tx.seatingAssignment.count({ where: { tables: { some: { id: tableId } } } })
  ]);
  const liveShows = [...new Set([...occ, ...holds, ...assigns].map((r) => r.show?.title || "a show"))];
  return { liveShows, history: histOcc + histHolds + histAssigns };
}
async function apply(tx, c, roomId, changes) {
  const room = await tx.room.findUnique({ where: { id: roomId }, select: { id: true, name: true, seatingMode: true, capacity: true } });
  if (!room) throw new Error("Room not found");
  if (room.seatingMode !== "tables") throw new Error(`${room.name} is general admission; it has no tables to edit`);
  const liveShows = await tx.show.findMany({ where: { roomId, status: { notIn: DONE2 } }, select: { id: true, title: true } });
  for (const s of [...liveShows].sort((a, b) => a.id.localeCompare(b.id))) await lockTransactionKey(tx, "show:" + s.id);
  const inRoom = async (sectionId) => {
    const s = await tx.section.findUnique({ where: { id: sectionId }, include: { tables: { select: { id: true } } } });
    if (!s || s.roomId !== roomId) throw new Error("Section is not in this room");
    return s;
  };
  const tableInRoom = async (tableId) => {
    const t = await tx.table.findUnique({ where: { id: tableId }, include: { section: true } });
    if (!t || t.section?.roomId !== roomId) throw new Error("Table is not in this room");
    return t;
  };
  const labelFree = async (label, exceptId) => {
    const all = await tx.table.findMany({ where: { section: { roomId }, ...exceptId ? { id: { not: exceptId } } : {} }, select: { label: true } });
    if (all.some((t) => sameLabel(t.label, label))) throw new Error(`Table label ${label} is already used in this room`);
  };
  const tableTierUse = async (name) => tx.priceTier.count({ where: { isTableTier: true, name, show: { roomId, status: { notIn: DONE2 } } } });
  const summary = [];
  for (const ch of changes) {
    if (ch.kind === "addSection") {
      if (await tx.section.count({ where: { roomId, name: { equals: ch.name, mode: "insensitive" } } })) throw new Error(`Section ${ch.name} already exists`);
      const sort = (await tx.section.aggregate({ where: { roomId }, _max: { sort: true } }))._max.sort ?? 0;
      await tx.section.create({ data: { name: ch.name, sort: sort + 1, room: { connect: { id: roomId } } } });
      summary.push(`Add section ${ch.name}`);
    } else if (ch.kind === "renameSection") {
      const s = await inRoom(ch.sectionId);
      if (s.name === ch.name) continue;
      if (await tx.section.count({ where: { roomId, id: { not: s.id }, name: { equals: ch.name, mode: "insensitive" } } })) throw new Error(`Section ${ch.name} already exists`);
      if (await tableTierUse(s.name)) throw new Error(`Section ${s.name} is sold as a table ticket type on a live show, so it cannot be renamed now`);
      await tx.section.update({ where: { id: s.id }, data: { name: ch.name } });
      summary.push(`Rename section ${s.name} to ${ch.name}`);
    } else if (ch.kind === "removeSection") {
      const s = await inRoom(ch.sectionId);
      if (s.tables.length) throw new Error(`Section ${s.name} still has ${s.tables.length} table${s.tables.length === 1 ? "" : "s"}; remove them first`);
      if (await tableTierUse(s.name)) throw new Error(`Section ${s.name} is sold as a table ticket type on a live show, so it cannot be removed now`);
      await tx.section.delete({ where: { id: s.id } });
      summary.push(`Remove section ${s.name}`);
    } else if (ch.kind === "addTable") {
      const s = await inRoom(ch.sectionId);
      await labelFree(ch.label);
      await tx.table.create({ data: { label: ch.label, seats: ch.seats, shape: ch.shape, x: ch.x, y: ch.y, section: { connect: { id: s.id } } } });
      summary.push(`Add table ${ch.label} (${ch.seats} seats) to ${s.name}`);
    } else if (ch.kind === "updateTable") {
      const t = await tableInRoom(ch.tableId);
      if (ch.sectionId) await inRoom(ch.sectionId);
      if (ch.label !== void 0 && !sameLabel(ch.label, t.label)) await labelFree(ch.label, t.id);
      const block = tableEditBlock(t.label, await liveUse(tx, t.id), { seats: t.seats ?? 0, sectionId: t.sectionId }, { seats: ch.seats, sectionId: ch.sectionId });
      if (block) throw new Error(block);
      const data = {};
      if (ch.label !== void 0) data.label = ch.label;
      if (ch.seats !== void 0) data.seats = ch.seats;
      if (ch.shape !== void 0) data.shape = ch.shape;
      if (ch.x !== void 0) data.x = ch.x;
      if (ch.y !== void 0) data.y = ch.y;
      if (ch.sectionId !== void 0) data.section = { connect: { id: ch.sectionId } };
      await tx.table.update({ where: { id: t.id }, data });
      summary.push(`Change table ${t.label}`);
    } else if (ch.kind === "removeTable") {
      const t = await tableInRoom(ch.tableId);
      const block = removeTableBlock(t.label, await liveUse(tx, t.id));
      if (block) throw new Error(block);
      await tx.table.update({ where: { id: t.id }, data: { combinableWith: { set: [] }, combinedBy: { set: [] } } });
      await tx.table.delete({ where: { id: t.id } });
      summary.push(`Remove table ${t.label}`);
    }
  }
  const tables = await tx.table.findMany({ where: { section: { roomId } }, select: { seats: true } });
  const capacity = layoutCapacity(tables);
  if (capacity < 1) throw new Error("A room needs at least one seat");
  if (capacity < room.capacity) {
    const counts = await Promise.all(liveShows.map(async (s) => ({
      title: s.title,
      sold: await tx.ticket.count({ where: { showId: s.id, status: { in: ["valid", "checked_in"] } } }),
      held: (await tx.inventoryHold.aggregate({ where: { showId: s.id, status: "active" }, _sum: { quantity: true } }))._sum.quantity || 0
    })));
    const cb = capacityBlock(capacity, counts);
    if (cb) throw new Error(cb);
  }
  if (capacity !== room.capacity) await tx.room.update({ where: { id: roomId }, data: { capacity } });
  return { room: room.name, changes: summary, tables: tables.length, capacityBefore: room.capacity, capacityAfter: capacity };
}
function parse(a) {
  const list14 = Array.isArray(a.changes) ? a.changes : [];
  if (!list14.length) throw new Error("No changes to apply");
  if (list14.length > MAX_CHANGES) throw new Error(`At most ${MAX_CHANGES} changes at a time`);
  return list14.map(normalizeChange);
}
async function previewRoomLayout(_, a, c) {
  requirePermission(c, "canManageSettings");
  const changes = parse(a);
  try {
    await c.prisma.$transaction(async (tx) => {
      await lockTransactionKey(tx, "room:" + a.roomId);
      throw new Rollback(await apply(tx, c, String(a.roomId || ""), changes));
    }, { timeout: 2e4 });
  } catch (e) {
    if (e instanceof Rollback) return e.result;
    throw e;
  }
}
async function editRoomLayout(_, a, c) {
  requirePermission(c, "canManageSettings");
  const changes = parse(a);
  return command(c, "editRoomLayout", a, async (tx) => {
    const result = await apply(tx, c, String(a.roomId || ""), changes);
    await audit(tx, c, "room_layout_edited", "Room", String(a.roomId), { capacity: result.capacityBefore }, { capacity: result.capacityAfter, tables: result.tables, changes: result.changes }, String(a.reason || ""));
    return result;
  }, "room:" + a.roomId);
}

// features/keystone/mutations/slotLink.ts
var import_node_crypto9 = __toESM(require("node:crypto"));
init_commands();

// features/keystone/lib/slotLink.ts
var SLOT_LINK_DAYS = 14;
function slotLinkExpiry(now, startsAt) {
  return new Date(Math.min(now.getTime() + SLOT_LINK_DAYS * 864e5, startsAt.getTime()));
}
function checkSlotLink(slot, tokenHash, now) {
  if (!slot || !slot.responseTokenHash || slot.responseTokenHash !== tokenHash) return { ok: false, reason: "invalid" };
  if (!slot.responseTokenExpiresAt || slot.responseTokenExpiresAt <= now) return { ok: false, reason: "expired" };
  return { ok: true };
}
var RESPONSES = { confirm: "confirmed", decline: "declined" };
function slotTerms(slot) {
  return { role: slot.role, setMinutes: slot.setMinutes, feeCents: slot.feeCents, bonusCents: slot.bonusCents, totalCents: slot.feeCents + slot.bonusCents, status: slot.status, canRespond: slot.status === "offered" };
}

// features/keystone/mutations/slotLink.ts
var FLOW = { offered: ["confirmed", "declined"] };
var GONE = ["settled", "cancelled"];
async function issueSlotLink(_, a, c) {
  requirePermission(c, "canManageTalent");
  return command(c, "issueSlotLink", a, async (tx) => {
    const first = await tx.lineupSlot.findUnique({ where: { id: a.slotId } });
    if (!first) throw new Error("Slot not found");
    await lockTransactionKey(tx, "show:" + first.showId);
    const slot = await tx.lineupSlot.findUnique({ where: { id: a.slotId }, include: { show: true, comedian: true } });
    if (!slot || slot.status !== "offered") throw new Error("Only an offered slot can be sent for a response");
    if (GONE.includes(slot.show.status) || slot.show.startsAt <= /* @__PURE__ */ new Date()) throw new Error("Show is closed to lineup changes");
    if (!slot.comedian?.email) throw new Error("This comedian has no email on file");
    const token = import_node_crypto9.default.randomBytes(32).toString("hex"), now = /* @__PURE__ */ new Date(), expires = slotLinkExpiry(now, slot.show.startsAt);
    await tx.lineupSlot.update({ where: { id: slot.id }, data: { responseTokenHash: hash(token), responseTokenExpiresAt: expires } });
    const link = `${process.env.STOREFRONT_URL || ""}/lineup/respond?slot=${slot.id}#${token}`;
    await audit(tx, c, "response_link_issued", "LineupSlot", slot.id, null, { expiresAt: expires });
    return { slotId: slot.id, expiresAt: expires, link };
  }, "show-slot:" + a.slotId);
}
async function load3(db, a) {
  const slot = await db.lineupSlot.findUnique({ where: { id: String(a.slotId || "") }, include: { show: { select: { title: true, startsAt: true, doorsAt: true, status: true, room: { select: { name: true } } } }, comedian: { select: { stageName: true } } } });
  const check = checkSlotLink(slot, hash(String(a.token || "")), /* @__PURE__ */ new Date());
  if (!check.ok) throw new Error(check.reason === "expired" ? "This link has expired. Ask the venue for a new one." : "Not found");
  return slot;
}
async function slotInvite(_, a, c) {
  const slot = await load3(c.prisma, a);
  return { slotId: slot.id, comedian: slot.comedian?.stageName || "", title: slot.show.title, startsAt: slot.show.startsAt, doorsAt: slot.show.doorsAt, room: slot.show.room?.name || "", showStatus: slot.show.status, ...slotTerms(slot), canRespond: slot.status === "offered" && !GONE.includes(slot.show.status) };
}
async function respondToSlot(_, a, c) {
  const next = RESPONSES[String(a.response)];
  if (!next) throw new Error("Choose confirm or decline");
  const anon = { ...c, session: null };
  return command(anon, "respondToSlot", { ...a, token: void 0, tokenHash: hash(String(a.token || "")) }, async (tx) => {
    const first = await tx.lineupSlot.findUnique({ where: { id: String(a.slotId || "") } });
    if (!first) throw new Error("Not found");
    await lockTransactionKey(tx, "show:" + first.showId);
    const slot = await load3(tx, a);
    if (GONE.includes(slot.show.status)) throw new Error("This show is closed to lineup changes");
    if (slot.status === next) return { status: slot.status, changed: false };
    if (slot.status !== "offered") throw new Error("This slot has already been answered. Contact the venue to change it.");
    await transition(tx, anon, "lineupSlot", slot.id, next, FLOW);
    if (next === "confirmed") {
      await tx.lineupSlot.update({ where: { id: slot.id }, data: { confirmedAt: /* @__PURE__ */ new Date() } });
    }
    await audit(tx, anon, "responded_via_link", "LineupSlot", slot.id, { status: "offered" }, { status: next }, "Comedian response via link");
    return { status: next, changed: true };
  });
}

// features/keystone/mutations/transfer.ts
init_commands();

// features/keystone/lib/transfer.ts
var MAX_TRANSFERS_PER_ORDER = 10;
var normalizeHolder = (h) => ({ name: String(h.name || "").trim().replace(/\s+/g, " "), email: String(h.email || "").trim().toLowerCase() });
function transferDecision(i) {
  const next = normalizeHolder(i.next), cur = normalizeHolder(i.current);
  if (!next.name || next.name.length > 120) return { ok: false, reason: "Enter the name of the new holder" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next.email) || next.email.length > 200) return { ok: false, reason: "Enter a valid email for the new holder" };
  if (i.ticketStatus === "checked_in") return { ok: false, reason: "This ticket has already been scanned in and cannot be transferred" };
  if (i.ticketStatus !== "valid") return { ok: false, reason: "Only a valid ticket can be transferred" };
  if (!["paid", "partially_refunded", "comp"].includes(i.orderStatus)) return { ok: false, reason: "This order is not eligible for transfer" };
  if (["cancelled", "completed", "settled"].includes(i.showStatus)) return { ok: false, reason: "This show is closed to transfers" };
  const cutoff = i.doorsAt || i.startsAt;
  if (i.now >= cutoff) return { ok: false, reason: "Transfers close when doors open" };
  if (next.name.toLowerCase() === cur.name.toLowerCase() && next.email === cur.email) return { ok: false, reason: "That is already the ticket holder" };
  if (i.transfersInOrder >= MAX_TRANSFERS_PER_ORDER) return { ok: false, reason: "This order has reached its transfer limit; contact the venue" };
  return { ok: true };
}
function buildHistory(chain2) {
  return chain2.slice(0, -1).map((t, i) => ({ name: t.holderName || "Original buyer", at: chain2[i + 1].createdAt }));
}
function holderAccess(ticket, hasSuccessor) {
  if (ticket.status === "void") return hasSuccessor ? "transferred" : "refused";
  return "full";
}

// features/keystone/mutations/transfer.ts
init_checkout();
async function transferTicket(_, a, c) {
  const next = normalizeHolder({ name: a.name, email: a.email });
  return command(c, "transferTicket", { ...a, orderSecret: void 0, proof: hash(String(a.orderSecret || "")) }, async (tx) => {
    const first = await tx.ticketOrder.findUnique({ where: { orderNumber: String(a.orderNumber || "") } });
    prove(first, String(a.orderSecret || ""), "secretKey");
    await lockTransactionKey(tx, "show:" + first.showId);
    const order = await tx.ticketOrder.findUnique({ where: { id: first.id }, include: { show: true, tickets: true } });
    const old = order.tickets.find((t) => t.ticketCode === String(a.ticketCode || ""));
    if (!old) throw new Error("Ticket not found");
    const decision = transferDecision({
      ticketStatus: old.status,
      orderStatus: order.status,
      showStatus: order.show.status,
      doorsAt: order.show.doorsAt,
      startsAt: order.show.startsAt,
      now: /* @__PURE__ */ new Date(),
      current: { name: old.holderName || order.name, email: old.holderEmail || order.email },
      next,
      transfersInOrder: order.tickets.filter((t) => t.transferredFromCode).length
    });
    if (!decision.ok) throw new Error(decision.reason);
    const moved = await tx.ticket.updateMany({ where: { id: old.id, status: "valid" }, data: { status: "void" } });
    if (moved.count !== 1) throw new Error("This ticket has already been scanned in and cannot be transferred");
    const ticketCode = code("T");
    const fresh = await tx.ticket.create({ data: { orderId: order.id, showId: order.showId, lineId: old.lineId, ticketCode, tokenHash: hash(ticketToken(ticketCode)), holderName: next.name, holderEmail: next.email, transferredFromCode: old.ticketCode, status: "valid" } });
    await audit(tx, c, "transferred", "Ticket", old.id, { status: "valid", holderName: old.holderName, holderEmail: old.holderEmail, ticketCode: old.ticketCode }, { status: "void", newTicketId: fresh.id, newTicketCode: ticketCode, holderName: next.name, holderEmail: next.email }, "Ticket transferred by buyer");
    return { ticketCode, token: ticketToken(ticketCode), holderName: next.name, replacedCode: old.ticketCode, remainingTransfers: MAX_TRANSFERS_PER_ORDER - order.tickets.filter((t) => t.transferredFromCode).length - 1 };
  });
}
async function holderTicket(_, a, c) {
  const code3 = String(a.ticketCode || "");
  const ticket = await c.prisma.ticket.findUnique({ where: { ticketCode: code3 }, include: { order: { include: { tableAssignment: { include: { tables: { select: { label: true, section: { select: { name: true } } } } } } } }, show: { select: { title: true, startsAt: true, doorsAt: true, ageRestriction: true, status: true, room: { select: { name: true } } } }, checkIns: { where: { result: "admitted" }, select: { at: true }, take: 1 } } });
  prove(ticket, String(a.token || ""), "tokenHash");
  const successor = await c.prisma.ticket.findFirst({ where: { transferredFromCode: code3 }, select: { id: true } });
  const access = holderAccess(ticket, Boolean(successor));
  if (access === "refused") throw new Error("Not found");
  if (access === "transferred") return { ticketCode: code3, status: "transferred", transferred: true };
  const chain2 = [];
  let from = ticket.transferredFromCode;
  for (let i = 0; from && i < 12; i++) {
    const prev = await c.prisma.ticket.findUnique({ where: { ticketCode: from }, select: { holderName: true, createdAt: true, transferredFromCode: true } });
    if (!prev) break;
    chain2.unshift(prev);
    from = prev.transferredFromCode;
  }
  const tables = ticket.order?.tableAssignment?.tables || [];
  const mine = !ticket.transferredFromCode;
  return {
    ticketCode: code3,
    status: ticket.status,
    transferred: false,
    holderName: ticket.holderName || ticket.order?.name || "",
    // an address is shown only for this ticket's own holder
    holderEmail: ticket.holderEmail || (mine ? ticket.order?.email || "" : ""),
    show: ticket.show,
    orderNumber: ticket.order?.orderNumber || "",
    checkedInAt: ticket.checkIns?.[0]?.at || null,
    seating: tables.length ? { tables: tables.map((t) => `${t.label}${t.section?.name ? " \xB7 " + t.section.name : ""}`), status: ticket.order.tableAssignment.status } : null,
    history: buildHistory([...chain2, ticket])
  };
}

// features/keystone/mutations/updateActiveUser.ts
init_access();
async function updateActiveUser(_root, { data }, context) {
  const session = context.session;
  if (!isSignedIn({ session })) throw new Error("Not authenticated");
  const allowed = /* @__PURE__ */ new Set(["email", "name", "password", "onboardingStatus", "notificationPreference"]);
  if (Object.keys(data || {}).some((key) => !allowed.has(key))) throw new Error("Unsupported profile field");
  return context.db.User.updateOne({ where: { id: session.itemId }, data });
}
var updateActiveUser_default = updateActiveUser;

// features/keystone/mutations/seed.ts
init_commands();
init_commands();
init_checkout();

// features/platform/onboarding/lib/seed.json
var seed_default = {
  venue: {
    name: "The Laugh Track",
    timezone: "America/Chicago",
    address: "412 Congress Ave, Austin, TX",
    defaultAgeRestriction: "18",
    drinkMinimumItems: 2,
    drinkMinimumCentsFloor: 0,
    serviceFeeBps: 0,
    taxBps: 825,
    policies: "Two-item minimum per guest. No phones during sets. Valid ID required."
  },
  settings: {
    refundWindowHours: 24,
    holdMinutes: 10,
    approvalThresholdCents: 1e4,
    compApprovalQuantity: 4
  },
  rooms: [
    {
      name: "Main Room",
      capacity: 180,
      seatingMode: "tables"
    },
    {
      name: "Back Room",
      capacity: 60,
      seatingMode: "ga"
    }
  ],
  sections: [
    {
      room: "Main Room",
      name: "Front",
      sort: 1
    },
    {
      room: "Main Room",
      name: "Middle",
      sort: 2
    },
    {
      room: "Main Room",
      name: "Booth",
      sort: 3
    },
    {
      room: "Main Room",
      name: "Bar rail",
      sort: 4
    }
  ],
  tables: [
    {
      room: "Main Room",
      section: "Front",
      label: "F1",
      seats: 6,
      x: 40,
      y: 40,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Front",
      label: "F2",
      seats: 6,
      x: 110,
      y: 40,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Front",
      label: "F3",
      seats: 6,
      x: 180,
      y: 40,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Front",
      label: "F4",
      seats: 6,
      x: 250,
      y: 40,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Front",
      label: "F5",
      seats: 6,
      x: 320,
      y: 40,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Front",
      label: "F6",
      seats: 6,
      x: 390,
      y: 40,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Front",
      label: "F7",
      seats: 6,
      x: 460,
      y: 40,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Front",
      label: "F8",
      seats: 6,
      x: 530,
      y: 40,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Middle",
      label: "M1",
      seats: 6,
      x: 40,
      y: 130,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Middle",
      label: "M2",
      seats: 6,
      x: 110,
      y: 130,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Middle",
      label: "M3",
      seats: 6,
      x: 180,
      y: 130,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Middle",
      label: "M4",
      seats: 6,
      x: 250,
      y: 130,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Middle",
      label: "M5",
      seats: 6,
      x: 320,
      y: 130,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Middle",
      label: "M6",
      seats: 6,
      x: 390,
      y: 130,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Middle",
      label: "M7",
      seats: 6,
      x: 460,
      y: 130,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Middle",
      label: "M8",
      seats: 6,
      x: 530,
      y: 130,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Middle",
      label: "M9",
      seats: 6,
      x: 600,
      y: 130,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Middle",
      label: "M10",
      seats: 6,
      x: 670,
      y: 130,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Booth",
      label: "B1",
      seats: 6,
      x: 40,
      y: 220,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Booth",
      label: "B2",
      seats: 6,
      x: 110,
      y: 220,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Booth",
      label: "B3",
      seats: 6,
      x: 180,
      y: 220,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Booth",
      label: "B4",
      seats: 6,
      x: 250,
      y: 220,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Booth",
      label: "B5",
      seats: 6,
      x: 320,
      y: 220,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Booth",
      label: "B6",
      seats: 6,
      x: 390,
      y: 220,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Bar rail",
      label: "R1",
      seats: 4,
      x: 40,
      y: 310,
      shape: "round"
    },
    {
      room: "Main Room",
      section: "Bar rail",
      label: "R2",
      seats: 4,
      x: 110,
      y: 310,
      shape: "round"
    },
    {
      room: "Main Room",
      section: "Bar rail",
      label: "R3",
      seats: 4,
      x: 180,
      y: 310,
      shape: "round"
    },
    {
      room: "Main Room",
      section: "Bar rail",
      label: "R4",
      seats: 4,
      x: 250,
      y: 310,
      shape: "round"
    },
    {
      room: "Main Room",
      section: "Bar rail",
      label: "R5",
      seats: 4,
      x: 320,
      y: 310,
      shape: "round"
    },
    {
      room: "Main Room",
      section: "Bar rail",
      label: "R6",
      seats: 4,
      x: 390,
      y: 310,
      shape: "round"
    },
    {
      room: "Main Room",
      section: "Bar rail",
      label: "R7",
      seats: 6,
      x: 460,
      y: 310,
      shape: "rectangle"
    },
    {
      room: "Main Room",
      section: "Bar rail",
      label: "R8",
      seats: 6,
      x: 530,
      y: 310,
      shape: "rectangle"
    }
  ],
  comedians: [
    {
      stageName: "Maya Okonkwo",
      legalName: "Maya Okonkwo",
      email: "maya.okonkwo@example.invalid",
      phone: "",
      bio: "",
      homeCity: "Austin",
      defaultFeeCents: 15e3,
      payeeDetailsOnFile: true,
      status: "active"
    },
    {
      stageName: "Dex Ramirez",
      legalName: "Dex Ramirez",
      email: "dex.ramirez@example.invalid",
      phone: "",
      bio: "",
      homeCity: "Houston",
      defaultFeeCents: 7500,
      payeeDetailsOnFile: false,
      status: "active"
    },
    {
      stageName: "Priya Venkataraman",
      legalName: "Priya Venkataraman",
      email: "priya.venkataraman@example.invalid",
      phone: "",
      bio: "",
      homeCity: "Dallas",
      defaultFeeCents: 12500,
      payeeDetailsOnFile: true,
      status: "active"
    },
    {
      stageName: "Walt Hollis",
      legalName: "Walt Hollis",
      email: "walt.hollis@example.invalid",
      phone: "",
      bio: "",
      homeCity: "San Antonio",
      defaultFeeCents: 1e4,
      payeeDetailsOnFile: false,
      status: "active"
    },
    {
      stageName: "Jun Tanaka",
      legalName: "Jun Tanaka",
      email: "jun.tanaka@example.invalid",
      phone: "",
      bio: "",
      homeCity: "Chicago",
      defaultFeeCents: 8e3,
      payeeDetailsOnFile: true,
      status: "active"
    },
    {
      stageName: "Bridget Salazar",
      legalName: "Bridget Salazar",
      email: "bridget.salazar@example.invalid",
      phone: "",
      bio: "",
      homeCity: "Los Angeles",
      defaultFeeCents: 9e3,
      payeeDetailsOnFile: false,
      status: "active"
    },
    {
      stageName: "Omar Haddad",
      legalName: "Omar Haddad",
      email: "omar.haddad@example.invalid",
      phone: "",
      bio: "",
      homeCity: "New York",
      defaultFeeCents: 7500,
      payeeDetailsOnFile: true,
      status: "active"
    },
    {
      stageName: "Lena Kowalski",
      legalName: "Lena Kowalski",
      email: "lena.kowalski@example.invalid",
      phone: "",
      bio: "",
      homeCity: "Denver",
      defaultFeeCents: 11e3,
      payeeDetailsOnFile: false,
      status: "active"
    },
    {
      stageName: "Theo Banks",
      legalName: "Theo Banks",
      email: "theo.banks@example.invalid",
      phone: "",
      bio: "",
      homeCity: "Atlanta",
      defaultFeeCents: 6500,
      payeeDetailsOnFile: true,
      status: "active"
    },
    {
      stageName: "Rosa Delgado",
      legalName: "Rosa Delgado",
      email: "rosa.delgado@example.invalid",
      phone: "",
      bio: "",
      homeCity: "Austin",
      defaultFeeCents: 8500,
      payeeDetailsOnFile: false,
      status: "active"
    },
    {
      stageName: "Gus Pemberton",
      legalName: "Gus Pemberton",
      email: "gus.pemberton@example.invalid",
      phone: "",
      bio: "",
      homeCity: "Portland",
      defaultFeeCents: 6e3,
      payeeDetailsOnFile: true,
      status: "active"
    },
    {
      stageName: "Nia Fontaine",
      legalName: "Nia Fontaine",
      email: "nia.fontaine@example.invalid",
      phone: "",
      bio: "",
      homeCity: "Nashville",
      defaultFeeCents: 14e3,
      payeeDetailsOnFile: false,
      status: "active"
    }
  ],
  menuItems: [
    {
      name: "House Lager",
      category: "drink",
      priceCents: 700,
      countsTowardMinimum: true,
      active: true
    },
    {
      name: "IPA",
      category: "drink",
      priceCents: 800,
      countsTowardMinimum: true,
      active: true
    },
    {
      name: "Well Cocktail",
      category: "drink",
      priceCents: 1e3,
      countsTowardMinimum: true,
      active: true
    },
    {
      name: "Margarita",
      category: "drink",
      priceCents: 1200,
      countsTowardMinimum: true,
      active: true
    },
    {
      name: "Old Fashioned",
      category: "drink",
      priceCents: 1400,
      countsTowardMinimum: true,
      active: true
    },
    {
      name: "Wine, glass",
      category: "drink",
      priceCents: 1100,
      countsTowardMinimum: true,
      active: true
    },
    {
      name: "Soda",
      category: "drink",
      priceCents: 400,
      countsTowardMinimum: true,
      active: true
    },
    {
      name: "Sparkling Water",
      category: "drink",
      priceCents: 400,
      countsTowardMinimum: true,
      active: true
    },
    {
      name: "Coffee",
      category: "drink",
      priceCents: 350,
      countsTowardMinimum: false,
      active: true
    },
    {
      name: "Nachos",
      category: "food",
      priceCents: 1400,
      countsTowardMinimum: false,
      active: true
    },
    {
      name: "Wings",
      category: "food",
      priceCents: 1500,
      countsTowardMinimum: false,
      active: true
    },
    {
      name: "Pretzel Bites",
      category: "food",
      priceCents: 1100,
      countsTowardMinimum: false,
      active: true
    },
    {
      name: "Sliders",
      category: "food",
      priceCents: 1600,
      countsTowardMinimum: false,
      active: true
    },
    {
      name: "Fries",
      category: "food",
      priceCents: 800,
      countsTowardMinimum: false,
      active: true
    },
    {
      name: "Caesar Salad",
      category: "food",
      priceCents: 1200,
      countsTowardMinimum: false,
      active: true
    },
    {
      name: "Flatbread",
      category: "food",
      priceCents: 1500,
      countsTowardMinimum: false,
      active: true
    },
    {
      name: "Chicken Tenders",
      category: "food",
      priceCents: 1400,
      countsTowardMinimum: false,
      active: true
    },
    {
      name: "Brownie",
      category: "food",
      priceCents: 900,
      countsTowardMinimum: false,
      active: true
    },
    {
      name: "Mocktail",
      category: "drink",
      priceCents: 800,
      countsTowardMinimum: true,
      active: true
    },
    {
      name: "Cider",
      category: "drink",
      priceCents: 800,
      countsTowardMinimum: true,
      active: true
    }
  ],
  templates: [
    {
      title: "Tuesday Showcase",
      room: "Main Room",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=TU",
      startTime: "20:00",
      duration: 90,
      isOpenMic: false,
      defaultAgeRestriction: "18",
      tiers: [
        {
          name: "Front",
          priceCents: 2500,
          feeCents: 300,
          capacity: 48,
          isTableTier: true,
          seatsPerUnit: 1
        },
        {
          name: "Middle",
          priceCents: 1500,
          feeCents: 200,
          capacity: 60,
          isTableTier: true,
          seatsPerUnit: 1
        },
        {
          name: "Booth",
          priceCents: 3e3,
          feeCents: 300,
          capacity: 36,
          isTableTier: true,
          seatsPerUnit: 1
        },
        {
          name: "Bar rail",
          priceCents: 1200,
          feeCents: 200,
          capacity: 36,
          isTableTier: true,
          seatsPerUnit: 1
        }
      ]
    },
    {
      title: "Wednesday Open Mic",
      room: "Back Room",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=WE",
      startTime: "19:30",
      duration: 120,
      isOpenMic: true,
      defaultAgeRestriction: "18",
      tiers: [
        {
          name: "Admission",
          priceCents: 500,
          feeCents: 0,
          capacity: 60,
          isTableTier: false,
          seatsPerUnit: 1
        }
      ]
    },
    {
      title: "Friday Late Show",
      room: "Main Room",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=FR",
      startTime: "22:00",
      duration: 90,
      isOpenMic: false,
      defaultAgeRestriction: "21",
      tiers: [
        {
          name: "Front",
          priceCents: 2500,
          feeCents: 300,
          capacity: 48,
          isTableTier: true,
          seatsPerUnit: 1
        },
        {
          name: "Middle",
          priceCents: 2e3,
          feeCents: 250,
          capacity: 60,
          isTableTier: true,
          seatsPerUnit: 1
        },
        {
          name: "Booth",
          priceCents: 3500,
          feeCents: 350,
          capacity: 36,
          isTableTier: true,
          seatsPerUnit: 1
        },
        {
          name: "Bar rail",
          priceCents: 1400,
          feeCents: 250,
          capacity: 36,
          isTableTier: true,
          seatsPerUnit: 1
        }
      ]
    },
    {
      title: "Saturday Late Show",
      room: "Main Room",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=SA",
      startTime: "22:00",
      duration: 90,
      isOpenMic: false,
      defaultAgeRestriction: "21",
      tiers: [
        {
          name: "Front",
          priceCents: 2700,
          feeCents: 300,
          capacity: 48,
          isTableTier: true,
          seatsPerUnit: 1
        },
        {
          name: "Middle",
          priceCents: 2200,
          feeCents: 250,
          capacity: 60,
          isTableTier: true,
          seatsPerUnit: 1
        },
        {
          name: "Booth",
          priceCents: 3700,
          feeCents: 350,
          capacity: 36,
          isTableTier: true,
          seatsPerUnit: 1
        },
        {
          name: "Bar rail",
          priceCents: 1600,
          feeCents: 250,
          capacity: 36,
          isTableTier: true,
          seatsPerUnit: 1
        }
      ]
    }
  ],
  run: {
    headliner: "Maya Okonkwo",
    title: "Maya Okonkwo Live",
    days: [
      "TH",
      "FR",
      "SA",
      "SU"
    ],
    runFeeCents: 3e5,
    room: "Main Room"
  },
  promoCodes: [
    {
      code: "LAUGH10",
      discountType: "percent_bps",
      value: 1e3,
      maxUses: 200,
      perOrderLimit: 1,
      status: "active"
    },
    {
      code: "INDUSTRY",
      discountType: "comp",
      value: 0,
      maxUses: 50,
      perOrderLimit: 2,
      status: "active"
    }
  ],
  paymentProviders: [
    {
      name: "Stripe",
      code: "pp_stripe",
      adapter: "stripe"
    },
    {
      name: "Manual",
      code: "pp_manual",
      adapter: "manual"
    }
  ]
};

// features/keystone/mutations/seed.ts
var ADAPTERS2 = /* @__PURE__ */ new Set(["stripe", "manual"]);
var need = (ok, message) => {
  if (!ok) throw new Error(message);
};
async function ensureClubOnboardingRecord(_, { entity, data }, context) {
  requirePermission(context, "canManageOnboarding");
  need(data && typeof data === "object" && !Array.isArray(data), "Invalid setup record");
  const db = context.prisma;
  const byName = async (model, where2, create) => {
    const found = await db[model].findFirst({ where: where2 });
    if (found) return { id: found.id, reused: true };
    return { id: (await db[model].create({ data: create })).id, reused: false };
  };
  switch (entity) {
    case "Venue":
      need(data.name && data.timezone, "Venue needs name and timezone");
      new Intl.DateTimeFormat("en", { timeZone: data.timezone });
      return byName("venue", { name: data.name }, data);
    case "VenueSettings": {
      const found = await db.venueSettings.findFirst();
      return found ? { id: found.id, reused: true } : { id: (await db.venueSettings.create({ data: { logoIcon: DEFAULT_STORE_LOGO_ICON, logoColor: DEFAULT_STORE_LOGO_COLOR, ...data, id: 1 } })).id, reused: false };
    }
    case "Room": {
      const venue = await db.venue.findFirst();
      need(venue, "Venue first");
      return byName("room", { name: data.name, venueId: venue.id }, { ...data, active: true, venueId: venue.id });
    }
    case "Section": {
      const room = await db.room.findFirst({ where: { name: data.room } });
      need(room, "Missing room");
      return byName("section", { name: data.name, roomId: room.id }, { name: data.name, sort: data.sort || 0, roomId: room.id });
    }
    case "Table": {
      const room = await db.room.findFirst({ where: { name: data.room } });
      const section = room && await db.section.findFirst({ where: { name: data.section, roomId: room.id } });
      need(section, "Missing section");
      const clash = await db.table.findFirst({ where: { label: data.label, sectionId: { not: section.id }, section: { roomId: room.id } } });
      need(!clash, `Table label ${data.label} is already used in this room`);
      return byName("table", { label: data.label, sectionId: section.id }, { label: data.label, seats: data.seats, x: data.x, y: data.y, shape: data.shape, sectionId: section.id });
    }
    case "Comedian":
      need(data.stageName, "Comedian needs a stage name");
      return byName("comedian", { stageName: data.stageName }, data);
    case "MenuItem":
      need(data.name && Number.isSafeInteger(data.priceCents) && data.priceCents >= 0, "Invalid menu item");
      return byName("menuItem", { name: data.name }, data);
    case "PromoCode":
      return byName("promoCode", { code: data.code.toUpperCase() }, { ...data, code: data.code.toUpperCase() });
    case "PaymentProvider": {
      need(ADAPTERS2.has(data.adapter) && /^pp_[A-Za-z0-9_-]+$/.test(data.code), "Setup accepts registered payment adapters only");
      return byName("paymentProvider", { code: data.code }, { name: data.name, code: data.code, isInstalled: true, createPaymentFunction: data.adapter, capturePaymentFunction: data.adapter, refundPaymentFunction: data.adapter, getPaymentStatusFunction: data.adapter, generatePaymentLinkFunction: data.adapter, handleWebhookFunction: data.adapter });
    }
    case "ShowTemplate": {
      const room = await db.room.findFirst({ where: { name: data.room } });
      need(room, "Missing room");
      const found = await db.showTemplate.findFirst({ where: { title: data.title, roomId: room.id } });
      if (found) return { id: found.id, reused: true };
      const template = await db.showTemplate.create({ data: { title: data.title, roomId: room.id, recurrenceRule: data.recurrenceRule, startTime: data.startTime, duration: data.duration, isOpenMic: data.isOpenMic, defaultAgeRestriction: data.defaultAgeRestriction } });
      for (const tier of data.tiers) await db.priceTier.create({ data: { name: tier.name, priceCents: tier.priceCents, feeCents: tier.feeCents, capacity: tier.capacity, isTableTier: tier.isTableTier, seatsPerUnit: tier.seatsPerUnit, status: "on_sale", templates: { connect: { id: template.id } } } });
      return { id: template.id, reused: false };
    }
    default:
      throw new Error("Unsupported setup record");
  }
}
var DAY_MS = 864e5;
var dayOf = (date, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
var localTime2 = (day, hhmm, tz) => zonedTime(day, hhmm, tz);
async function seedClubOperations(_, { template }, context) {
  requirePermission(context, "canManageOnboarding");
  need(["full", "minimal"].includes(template), "Unknown setup type");
  const db = context.prisma;
  const venue = await db.venue.findFirst({ include: { rooms: true } });
  need(venue, "Venue first");
  const templates = await db.showTemplate.findMany({ include: { room: true } });
  if (await db.show.count()) return { created: 0, reused: true };
  const out = { generated: 0, run: 0, past: 0 };
  const from = /* @__PURE__ */ new Date();
  const limit = template === "minimal" ? 2 : 21;
  for (const t of templates) {
    if (template === "minimal" && t.title !== "Tuesday Showcase") continue;
    const r = await generateShowsFromTemplate(null, { templateId: t.id, from: from.toISOString(), idempotencyKey: `seed:gen:${t.id}` }, context);
    out.generated += r.created;
  }
  const upcoming = await db.show.findMany({ where: { status: "draft" }, orderBy: { startsAt: "asc" }, include: { template: true } });
  const keep = template === "minimal" ? upcoming.slice(0, 2) : upcoming.filter((s) => s.startsAt.getTime() < from.getTime() + limit * DAY_MS);
  const drop = upcoming.filter((s) => !keep.includes(s));
  for (const s of drop) {
    await db.priceTier.deleteMany({ where: { showId: s.id } });
    await db.show.delete({ where: { id: s.id } });
  }
  if (template === "minimal") {
    await db.show.updateMany({ where: { id: { in: keep.map((s) => s.id) } }, data: { status: "on_sale" } });
    return out;
  }
  const comics = await db.comedian.findMany({ orderBy: { stageName: "asc" } });
  const comic = (name) => comics.find((c) => c.stageName === name);
  const slot = (showId, c, role, position, minutes, status = "confirmed") => db.lineupSlot.create({ data: { showId, comedianId: c.id, role, position, setMinutes: minutes, feeCents: c.defaultFeeCents, bonusCents: 0, status, confirmedAt: status === "confirmed" || status === "performed" ? /* @__PURE__ */ new Date() : null } });
  const main = venue.rooms.find((r) => r.name === "Main Room");
  const mainTiers = (await db.showTemplate.findFirst({ where: { title: "Friday Late Show" }, include: { defaultPriceTiers: true } })).defaultPriceTiers;
  const headliner = comic(seed_default.run.headliner);
  const runDays = [[0, ["20:00"]], [1, ["19:30", "21:45"]], [2, ["19:30", "21:45"]], [3, ["18:00", "20:00"]]];
  const thursdayOn = (start, step) => {
    let d = start;
    while (new Intl.DateTimeFormat("en-US", { timeZone: venue.timezone, weekday: "short" }).format(d) !== "Thu") d = new Date(d.getTime() + step * DAY_MS);
    return d;
  };
  const manualTender = await db.paymentProvider.findFirst({ where: { code: "pp_manual" } });
  const makeRun = async (cursor, past2) => {
    const run = await db.run.create({ data: { headlinerId: headliner.id, status: "scheduled", startAt: cursor, endAt: new Date(cursor.getTime() + 3 * DAY_MS), runFeeCents: seed_default.run.runFeeCents, notes: seed_default.run.title } });
    const shows = [];
    for (const [offset, times] of runDays) for (const hhmm of times) {
      const day = dayOf(new Date(cursor.getTime() + offset * DAY_MS + 12 * 36e5), venue.timezone);
      const startsAt = localTime2(day, hhmm, venue.timezone);
      const show = await db.show.create({ data: { roomId: main.id, runId: run.id, title: seed_default.run.title, occurrenceKey: `run:${run.id}:${day}:${hhmm}`, startsAt, doorsAt: new Date(startsAt.getTime() - 36e5), endsAt: new Date(startsAt.getTime() + 54e5), ageRestriction: "21", capacity: main.capacity, status: past2 ? "completed" : "on_sale", isOpenMic: false } });
      const tiers = [];
      for (const t of mainTiers) tiers.push(await db.priceTier.create({ data: { showId: show.id, name: t.name, priceCents: t.priceCents + 1e3, feeCents: t.feeCents, capacity: t.capacity, isTableTier: t.isTableTier, seatsPerUnit: 1, status: "on_sale" } }));
      await slot(show.id, comic("Dex Ramirez"), "host", 1, 8, past2 ? "performed" : "confirmed");
      await slot(show.id, comic("Priya Venkataraman"), "opener", 2, 15, past2 ? "performed" : "confirmed");
      const head = await slot(show.id, headliner, "headliner", 3, 50, past2 ? "performed" : "confirmed");
      if (past2 && shows.length === 0) await db.lineupSlot.update({ where: { id: head.id }, data: { bonusCents: 5e3 } });
      if (past2) {
        for (let p2 = 0; p2 < 4; p2++) {
          const size = [2, 4, 3, 5][p2], tier = tiers[p2 % tiers.length];
          const subtotal = tier.priceCents * size, fee = tier.feeCents * size, tax = Math.floor((subtotal * venue.taxBps + 5e3) / 1e4), total = subtotal + fee + tax;
          const order = await db.ticketOrder.create({ data: { orderNumber: code("CC"), email: `run${shows.length}${p2}@example.invalid`, name: `Guest R${shows.length + 1}-${p2 + 1}`, showId: show.id, status: "paid", subtotalCents: subtotal, feesCents: fee, taxCents: tax, totalCents: total, source: "online", partySize: size, ageAttested: true, secretKey: hash(code()), lines: { create: [{ tierName: tier.name, unitPriceCents: tier.priceCents, unitFeeCents: tier.feeCents, quantity: size, lineTotalCents: subtotal, taxCents: tax, priceTierId: tier.id }] } }, include: { lines: true } });
          await db.payment.create({ data: { idempotencyKey: `seed-pay:${order.id}`, amount: total, currencyCode: "USD", status: "succeeded", paymentMethod: "credit_card", providerPaymentId: `manual_${order.orderNumber}`, processedAt: startsAt, orderId: order.id, paymentProviderId: manualTender?.id } });
          for (let k = 0; k < size; k++) {
            const tc = code("T");
            const ticket = await db.ticket.create({ data: { orderId: order.id, showId: show.id, lineId: order.lines[0].id, ticketCode: tc, tokenHash: hash(ticketToken(tc)), holderName: order.name, status: "checked_in" } });
            await db.checkIn.create({ data: { ticketId: ticket.id, showId: show.id, at: new Date(startsAt.getTime() - 18e5), method: "scan", result: "admitted" } });
          }
          await db.priceTier.update({ where: { id: tier.id }, data: { sold: { increment: size } } });
        }
      }
      shows.push(show);
      out.run++;
    }
    return { run, shows };
  };
  const past = await makeRun(thursdayOn(new Date(from.getTime() - 4 * DAY_MS), -1), true);
  for (const show of past.shows) await closeShow(null, { showId: show.id, idempotencyKey: `seed:close:${show.id}` }, context);
  out.settledRunShows = past.shows.length;
  await makeRun(thursdayOn(new Date(from.getTime() + 8 * DAY_MS), 1), false);
  const hosts = ["Dex Ramirez", "Walt Hollis", "Jun Tanaka"].map(comic);
  const openers = ["Bridget Salazar", "Omar Haddad", "Lena Kowalski", "Theo Banks"].map(comic);
  const features = ["Rosa Delgado", "Gus Pemberton", "Nia Fontaine", "Priya Venkataraman"].map(comic);
  let i = 0;
  for (const s of keep) {
    await db.show.update({ where: { id: s.id }, data: { status: "on_sale" } });
    if (s.isOpenMic) {
      await slot(s.id, hosts[i % 3], "host", 1, 10);
    } else {
      await slot(s.id, hosts[i % 3], "host", 1, 8);
      await slot(s.id, openers[i % 4], "opener", 2, 12);
      await slot(s.id, openers[(i + 1) % 4], "guest_set", 3, 15);
      await slot(s.id, features[i % 4], "feature", 4, 25);
    }
    i++;
  }
  const tonight = await db.show.findFirst({ where: { status: "on_sale", startsAt: { gte: new Date(Date.now() - 12 * 36e5), lt: new Date(Date.now() + 36 * 36e5) }, isOpenMic: false }, orderBy: { startsAt: "asc" }, include: { tiers: true, room: true } });
  const manualProvider = await db.paymentProvider.findFirst({ where: { code: "pp_manual" } });
  if (tonight) {
    const taxBps = venue.taxBps;
    const target = Math.floor(tonight.capacity * 0.66);
    const sizes = [2, 4, 3, 2, 6, 2, 4, 3, 2, 5, 2, 4, 6, 3, 2, 4, 2, 3, 6, 2, 4, 2, 3, 5, 2, 4, 3, 6, 2, 4, 2, 3];
    let soldTotal = 0, i2 = 0, seatedAssignmentId = null;
    const tableTiers = tonight.tiers.filter((t) => t.isTableTier);
    const tableRows = await db.table.findMany({ where: { section: { roomId: tonight.roomId } }, orderBy: { label: "asc" }, include: { section: true } });
    const usedTables = /* @__PURE__ */ new Set();
    const firstName = ["Alex", "Sam", "Jordan", "Casey", "Riley", "Morgan", "Taylor", "Jamie", "Drew", "Quinn"], lastName = ["Nguyen", "Patel", "Garcia", "Smith", "Okafor", "Lopez", "Kim", "Brown", "Haddad", "Silva"];
    while (soldTotal < target) {
      const size = sizes[i2 % sizes.length];
      const tier = tableTiers.find((t) => t.sold + size <= t.capacity && t.name === ["Middle", "Front", "Booth", "Bar rail", "Middle", "Front"][i2 % 6]) || tableTiers.find((t) => t.sold + size <= t.capacity);
      if (!tier || soldTotal + size > tonight.capacity) break;
      const subtotal = tier.priceCents * size, fee = tier.feeCents * size, tax = Math.floor((subtotal * taxBps + 5e3) / 1e4), total = subtotal + fee + tax;
      const name = `${firstName[i2 % 10]} ${lastName[i2 * 3 % 10]}`;
      const order = await db.ticketOrder.create({ data: { orderNumber: code("CC"), email: `${firstName[i2 % 10]}.${lastName[i2 * 3 % 10]}${i2}@example.invalid`.toLowerCase(), name, showId: tonight.id, status: "paid", subtotalCents: subtotal, feesCents: fee, taxCents: tax, totalCents: total, source: "online", partySize: size, ageAttested: true, secretKey: hash(code()), lines: { create: [{ tierName: tier.name, unitPriceCents: tier.priceCents, unitFeeCents: tier.feeCents, quantity: size, lineTotalCents: subtotal, taxCents: tax, priceTierId: tier.id }] } }, include: { lines: true } });
      await db.payment.create({ data: { idempotencyKey: `seed-pay:${order.id}`, amount: total, currencyCode: "USD", status: "succeeded", paymentMethod: "credit_card", providerPaymentId: `manual_${order.orderNumber}`, processedAt: /* @__PURE__ */ new Date(), orderId: order.id, paymentProviderId: manualProvider?.id } });
      const checkedIn = i2 % 3 === 0;
      for (let k = 0; k < size; k++) {
        const tc = code("T");
        const ticket = await db.ticket.create({ data: { orderId: order.id, showId: tonight.id, lineId: order.lines[0].id, ticketCode: tc, tokenHash: hash(ticketToken(tc)), holderName: name, status: checkedIn ? "checked_in" : "valid" } });
        if (checkedIn) await db.checkIn.create({ data: { ticketId: ticket.id, showId: tonight.id, at: /* @__PURE__ */ new Date(), method: "scan", result: "admitted" } });
      }
      await db.priceTier.update({ where: { id: tier.id }, data: { sold: { increment: size } } });
      if (checkedIn && !seatedAssignmentId) {
        const pool = tableRows.filter((t) => t.section.name === tier.name && !usedTables.has(t.id));
        const picked = [];
        let seats = 0;
        for (const t of pool) {
          if (seats >= size) break;
          picked.push(t);
          seats += t.seats;
        }
        if (seats >= size) {
          const seating = await db.seatingAssignment.create({ data: { showId: tonight.id, ticketOrderId: order.id, partySize: size, status: "seated", seatedAt: /* @__PURE__ */ new Date(), serverId: context.session.itemId, tables: { connect: picked.map((t) => ({ id: t.id })) } } });
          for (const t of picked) {
            usedTables.add(t.id);
            await db.tableOccupancy.create({ data: { occupancyKey: `${tonight.id}:${t.id}`, showId: tonight.id, tableId: t.id, assignmentId: seating.id } });
          }
          const drinksList = await db.menuItem.findMany({ where: { countsTowardMinimum: true, active: true }, orderBy: { priceCents: "asc" } });
          const foodList = await db.menuItem.findMany({ where: { category: "food", active: true }, orderBy: { priceCents: "asc" } });
          const cheapest = drinksList[0];
          const check = await db.check.create({ data: { showId: tonight.id, seatingAssignmentId: seating.id, serverId: context.session.itemId, status: "open", guestCount: size, minimumItemsRequired: size * venue.drinkMinimumItems, minimumUnitPriceCents: cheapest.priceCents, minimumCentsFloor: 0, taxBps, currencyCode: "USD" } });
          for (const [m, q] of [[drinksList[1], Math.max(1, size)], [foodList[0], 1]]) await db.checkItem.create({ data: { checkId: check.id, menuItemId: m.id, name: m.name, priceCents: m.priceCents, qty: q, countsTowardMinimum: m.countsTowardMinimum } });
          seatedAssignmentId = seating.id;
        }
      }
      soldTotal += size;
      i2++;
    }
    const totals2 = await db.priceTier.aggregate({ where: { showId: tonight.id }, _sum: { sold: true } });
    if ((totals2._sum.sold || 0) !== await db.ticket.count({ where: { showId: tonight.id, status: { in: ["valid", "checked_in"] } } })) throw new Error("Tonight sold count does not match tickets");
    out.tonight = soldTotal;
  }
  const manual = manualProvider;
  const tz = venue.timezone;
  const tuesday = templates.find((t) => t.title === "Tuesday Showcase");
  const tuesdayTiers = (await db.showTemplate.findUnique({ where: { id: tuesday.id }, include: { defaultPriceTiers: true } })).defaultPriceTiers;
  const drinks = await db.menuItem.findMany({ where: { countsTowardMinimum: true, active: true }, orderBy: { priceCents: "asc" } });
  const food = await db.menuItem.findMany({ where: { category: "food" }, orderBy: { priceCents: "asc" } });
  const settingsRow = await db.venueSettings.findFirst();
  for (let n = 1; n <= 4; n++) {
    const day = dayOf(new Date(from.getTime() - n * 7 * DAY_MS + 12 * 36e5), tz);
    const startsAt = localTime2(day, "20:00", tz);
    const cancelled = n === 4;
    const show = await db.show.create({ data: { roomId: main.id, templateId: tuesday.id, title: tuesday.title, occurrenceKey: `past:${tuesday.id}:${day}`, startsAt, doorsAt: new Date(startsAt.getTime() - 36e5), endsAt: new Date(startsAt.getTime() + 54e5), ageRestriction: "18", capacity: main.capacity, status: cancelled ? "cancelled" : "settled" } });
    const tiers = [];
    for (const t of tuesdayTiers) tiers.push(await db.priceTier.create({ data: { showId: show.id, name: t.name, priceCents: t.priceCents, feeCents: t.feeCents, capacity: t.capacity, isTableTier: t.isTableTier, seatsPerUnit: 1, status: cancelled ? "closed" : "on_sale" } }));
    const slots = [await slot(show.id, hosts[n % 3], "host", 1, 8, cancelled ? "cancelled" : "performed"), await slot(show.id, openers[n % 4], "opener", 2, 12, cancelled ? "cancelled" : "performed"), await slot(show.id, features[n % 4], "feature", 3, 25, cancelled ? "cancelled" : "performed")];
    let ticketGross = 0, fees = 0, refunds = 0, fb = 0, shortfall = 0, tips = 0;
    const parties = [[0, 4], [1, 2], [2, 3], [0, 2], [1, 6]];
    for (let p2 = 0; p2 < parties.length; p2++) {
      const [ti, size] = parties[p2];
      const tier = tiers[ti];
      const subtotal = tier.priceCents * size, fee = tier.feeCents * size, tax = Math.floor((subtotal * venue.taxBps + 5e3) / 1e4), total = subtotal + fee + tax;
      const order = await db.ticketOrder.create({ data: { orderNumber: code("CC"), email: `guest${n}${p2}@example.invalid`, name: `Guest ${n}-${p2 + 1}`, showId: show.id, status: cancelled ? "refunded" : "paid", subtotalCents: subtotal, feesCents: fee, taxCents: tax, totalCents: total, source: "online", partySize: size, ageAttested: true, secretKey: hash(code()), lines: { create: [{ tierName: tier.name, unitPriceCents: tier.priceCents, unitFeeCents: tier.feeCents, quantity: size, lineTotalCents: subtotal, taxCents: tax, priceTierId: tier.id }] } }, include: { lines: true } });
      const payment = await db.payment.create({ data: { idempotencyKey: `seed-pay:${order.id}`, amount: total, currencyCode: "USD", status: cancelled ? "refunded" : "succeeded", paymentMethod: "credit_card", providerPaymentId: `manual_${order.orderNumber}`, processedAt: startsAt, refundedAmount: cancelled ? total : 0, orderId: order.id, paymentProviderId: manual?.id } });
      if (cancelled) {
        await db.refund.create({ data: { idempotencyKey: `seed-refund:${order.id}`, amount: total, currencyCode: "USD", status: "succeeded", reason: "Show cancelled", paymentId: payment.id, orderId: order.id, processedAt: /* @__PURE__ */ new Date() } });
        refunds += total;
      }
      for (let k = 0; k < size; k++) {
        const tc = code("T");
        const ticket = await db.ticket.create({ data: { orderId: order.id, showId: show.id, lineId: order.lines[0].id, ticketCode: tc, tokenHash: hash(ticketToken(tc)), holderName: order.name, status: cancelled ? "refunded" : "checked_in" } });
        if (!cancelled) await db.checkIn.create({ data: { ticketId: ticket.id, showId: show.id, at: new Date(startsAt.getTime() - 18e5), method: "scan", result: "admitted" } });
      }
      if (!cancelled) {
        await db.priceTier.update({ where: { id: tier.id }, data: { sold: { increment: size } } });
        ticketGross += subtotal;
        fees += fee;
        if (p2 < 3) {
          const items = [{ m: drinks[p2 % drinks.length], q: p2 === 1 ? 1 : size * 2 }, { m: food[p2 % food.length], q: 1 }];
          const sub = items.reduce((a, i2) => a + i2.m.priceCents * i2.q, 0);
          const required = size * venue.drinkMinimumItems, have = items[0].q, short = Math.max(0, required - have) * drinks[0].priceCents;
          const total2 = sub + short + Math.floor(((sub + short) * venue.taxBps + 5e3) / 1e4);
          const seating = await db.seatingAssignment.create({ data: { showId: show.id, ticketOrderId: order.id, partySize: size, status: "closed", seatedAt: startsAt } });
          const check = await db.check.create({ data: { showId: show.id, seatingAssignmentId: seating.id, status: "paid", guestCount: size, minimumItemsRequired: required, minimumUnitPriceCents: drinks[0].priceCents, minimumShortfallCents: short, subtotalCents: sub + short, taxBps: venue.taxBps, taxCents: total2 - sub - short, tipCents: Math.round(sub * 0.18), totalCents: total2 + Math.round(sub * 0.18), currencyCode: "USD" } });
          await db.payment.create({ data: { idempotencyKey: `seed-check:${check.id}`, amount: total2 + Math.round(sub * 0.18), currencyCode: "USD", status: "succeeded", paymentMethod: "credit_card", providerPaymentId: `manual_check_${check.id}`, tipAmount: Math.round(sub * 0.18), processedAt: startsAt, checkId: check.id, paymentProviderId: manual?.id } });
          for (const i2 of items) await db.checkItem.create({ data: { checkId: check.id, menuItemId: i2.m.id, name: i2.m.name, priceCents: i2.m.priceCents, qty: i2.q, countsTowardMinimum: i2.m.countsTowardMinimum } });
          fb += sub;
          shortfall += short;
          tips += Math.round(sub * 0.18);
        }
      }
    }
    if (cancelled) {
      await audit(db, context, "cancelled", "Show", show.id, null, { status: "cancelled" }, "Show cancelled");
      continue;
    }
    let talent = 0;
    for (const s of slots) {
      const payout2 = await db.comedianPayout.create({ data: { payoutKey: `${show.id}:${s.comedianId}`, comedianId: s.comedianId, showId: show.id, amountCents: s.feeCents, currencyCode: "USD", status: "paid", paidAt: new Date(startsAt.getTime() + 3 * DAY_MS), method: "check", reference: `CHK-${1e3 + n}-${s.comedianId.slice(-4)}`, lineupSlots: { connect: [{ id: s.id }] } } });
      talent += payout2.amountCents;
    }
    const net = ticketGross + fees + fb + shortfall - talent - refunds;
    await db.showSettlement.create({ data: { show: { connect: { id: show.id } }, ticketGrossCents: ticketGross, feesCents: fees, discountsCents: 0, refundsCents: refunds, compsCount: 0, foodBeverageGrossCents: fb, minimumShortfallRevenueCents: shortfall, tipsCents: tips, talentCostCents: talent, netCents: net, currencyCode: "USD", status: "closed", closedById: context.session.itemId } });
    out.past++;
  }
  const unbalanced = await db.ticketOrder.count({ where: { status: { in: ["paid", "refunded"] }, payments: { none: {} } } });
  if (unbalanced) throw new Error("Seeded orders must each have a matching payment");
  return out;
}

// features/keystone/mutations/seating.ts
init_commands();
var LIVE_SHOW = ["on_sale", "sold_out", "doors_open", "in_progress"];
async function loadSeated(tx, assignmentId) {
  const s = await tx.seatingAssignment.findUnique({ where: { id: assignmentId }, include: { tables: { include: { section: true } }, show: true, checks: { where: { status: { in: ["open", "presented"] } }, select: { id: true } }, occupancies: { where: { occupancyKey: { not: null } } } } });
  if (!s || s.status !== "seated") throw new Error("This party is not seated");
  if (!LIVE_SHOW.includes(s.show.status)) throw new Error("The show is not live");
  return s;
}
async function moveParty(_, a, c) {
  requirePermission(c, "canManageDoor");
  return command(c, "moveParty", a, async (tx) => {
    const first = await tx.seatingAssignment.findUnique({ where: { id: String(a.assignmentId || "") }, select: { showId: true } });
    if (!first) throw new Error("This party is not seated");
    await lockTransactionKey(tx, "show:" + first.showId);
    const s = await loadSeated(tx, a.assignmentId);
    const ids = [...new Set(a.tableIds || [])];
    if (!ids.length) throw new Error("Choose tables");
    const same = ids.length === s.tables.length && ids.every((id2) => s.tables.some((t) => t.id === id2));
    if (same) throw new Error("The party is already at these tables");
    const tables = await tx.table.findMany({ where: { id: { in: ids } }, include: { section: true } });
    if (tables.length !== ids.length || tables.some((t) => t.section.roomId !== s.show.roomId)) throw new Error("Choose tables in this room");
    if (tables.reduce((n, t) => n + t.seats, 0) < (s.partySize || 1)) throw new Error("Not enough seats for the party");
    const order = s.ticketOrderId ? await tx.ticketOrder.findUnique({ where: { id: s.ticketOrderId }, include: { hold: true } }) : null;
    for (const t of tables) {
      const occ = await tx.tableOccupancy.findUnique({ where: { occupancyKey: s.showId + ":" + t.id } });
      if (occ && occ.assignmentId !== s.id && !(order?.hold && occ.holdId === order.hold.id)) throw new Error(`Table ${t.label} is taken`);
    }
    const before = { tables: s.tables.map((t) => t.label) };
    await tx.tableOccupancy.updateMany({ where: { assignmentId: s.id, occupancyKey: { not: null } }, data: { occupancyKey: null } });
    for (const t of tables) {
      const key = s.showId + ":" + t.id;
      const occ = await tx.tableOccupancy.findUnique({ where: { occupancyKey: key } });
      if (occ) await tx.tableOccupancy.update({ where: { id: occ.id }, data: { assignmentId: s.id } });
      else await tx.tableOccupancy.create({ data: { occupancyKey: key, showId: s.showId, tableId: t.id, assignmentId: s.id } });
    }
    await tx.seatingAssignment.update({ where: { id: s.id }, data: { tables: { set: ids.map((id2) => ({ id: id2 })) } } });
    const after = { tables: tables.map((t) => t.label) };
    await audit(tx, c, "moved", "SeatingAssignment", s.id, before, after, String(a.reason || ""));
    return { assignmentId: s.id, ...after };
  });
}
async function unseatParty(_, a, c) {
  requirePermission(c, "canManageDoor");
  return command(c, "unseatParty", a, async (tx) => {
    const first = await tx.seatingAssignment.findUnique({ where: { id: String(a.assignmentId || "") }, select: { showId: true } });
    if (!first) throw new Error("This party is not seated");
    await lockTransactionKey(tx, "show:" + first.showId);
    const s = await loadSeated(tx, a.assignmentId);
    if (s.checks.length) throw new Error("This party has an open check. Close it first");
    const paid = await tx.check.count({ where: { seatingAssignmentId: s.id, status: "paid" } });
    if (paid) throw new Error("This party already paid a check. Their table is freed when the check closes");
    await tx.tableOccupancy.updateMany({ where: { assignmentId: s.id, occupancyKey: { not: null } }, data: { occupancyKey: null } });
    await tx.seatingAssignment.update({ where: { id: s.id }, data: { status: "unseated", ticketOrder: { disconnect: true }, tables: { set: [] } } });
    await audit(tx, c, "unseated", "SeatingAssignment", s.id, { tables: s.tables.map((t) => t.label), partySize: s.partySize, orderId: s.ticketOrderId }, { status: "unseated" }, String(a.reason || ""));
    return { unseated: true, orderId: s.ticketOrderId };
  });
}

// features/keystone/mutations/door.ts
init_access();
var LIVE = ["on_sale", "sold_out", "doors_open", "in_progress", "completed"];
async function doorBoard(_, a, c) {
  const can = { door: permissions.canManageDoor(c), checks: permissions.canManageChecks(c), shows: permissions.canManageShows(c) };
  if (!c.session?.itemId || !(can.door || can.checks || can.shows)) throw new Error("Not authorized");
  const db = c.prisma;
  const num = (v) => Number(v);
  const since = new Date(Date.now() - 6 * 36e5);
  const shows = await db.show.findMany({ where: { startsAt: { gte: since }, status: { in: [...LIVE] } }, orderBy: { startsAt: "asc" }, take: 20, select: { id: true, title: true, startsAt: true, status: true } });
  const current = shows.find((s2) => s2.id === a.showId) || shows[0];
  if (!current) return { shows, show: null, found: [], can };
  const live = { in: ["valid", "checked_in"] };
  const [s, soldCount, heldAgg, checkedInCount, tiers] = await Promise.all([
    db.show.findUnique({
      where: { id: current.id },
      select: {
        id: true,
        title: true,
        startsAt: true,
        doorsAt: true,
        endsAt: true,
        status: true,
        capacity: true,
        ageRestriction: true,
        room: { select: { name: true, seatingMode: true, sections: { select: { name: true, tables: { select: { id: true, label: true, seats: true, x: true, y: true } } } } } },
        lineup: { orderBy: { position: "asc" }, select: { id: true, role: true, position: true, setMinutes: true, status: true, comedian: { select: { stageName: true } } } },
        assignments: { where: { status: "seated" }, select: { id: true, status: true, partySize: true, tables: { select: { id: true, label: true } }, ticketOrder: { select: { name: true, orderNumber: true } }, checks: { where: { status: { in: ["open", "presented"] } }, select: { id: true } } } },
        occupancies: { where: { occupancyKey: { not: null } }, select: { table: { select: { id: true } }, hold: { select: { id: true } }, assignment: { select: { id: true } } } },
        orders: { where: { status: { in: ["paid", "partially_refunded", "comp"] }, tableAssignment: null }, take: 100, select: { id: true, name: true, partySize: true, orderNumber: true } },
        checks: { where: { status: { in: ["open", "presented"] } }, select: { id: true, status: true, guestCount: true, minimumItemsRequired: true, seatingAssignment: { select: { tables: { select: { label: true } } } }, items: { where: { voided: false, countsTowardMinimum: true }, select: { qty: true } } } }
      }
    }),
    db.ticket.count({ where: { showId: current.id, status: live } }),
    db.inventoryHold.aggregate({ where: { showId: current.id, status: "active", expiresAt: { gt: /* @__PURE__ */ new Date() } }, _sum: { quantity: true } }),
    db.ticket.count({ where: { showId: current.id, status: "checked_in" } }),
    db.priceTier.findMany({ where: { showId: current.id }, select: { sold: true, held: true } })
  ]);
  const heldCount = heldAgg._sum.quantity || 0;
  const remaining = Math.max(0, num(s?.capacity) - tiers.reduce((n, t) => n + (t.sold ?? 0) + (t.held ?? 0), 0));
  const show = {
    ...s,
    soldCount,
    heldCount,
    checkedInCount,
    remaining,
    checks: (s?.checks ?? []).map((k) => ({ id: k.id, status: k.status, guestCount: k.guestCount, seatingAssignment: k.seatingAssignment, minimumItemsMet: k.items.reduce((n, i) => n + (i.qty ?? 0), 0) >= num(k.minimumItemsRequired) }))
  };
  const term = String(a.term || "").trim().slice(0, 80);
  const found = term ? await db.ticket.findMany({
    where: { showId: current.id, OR: [{ holderName: { contains: term, mode: "insensitive" } }, { ticketCode: { contains: term, mode: "insensitive" } }, { order: { OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }, { orderNumber: { contains: term, mode: "insensitive" } }] } }] },
    orderBy: { holderName: "asc" },
    take: 25,
    select: { id: true, ticketCode: true, status: true, holderName: true, order: { select: { orderNumber: true, name: true } } }
  }) : [];
  return { shows, show, found, can };
}

// features/keystone/mutations/checkPay.ts
init_commands();
init_money();
init_paymentProviderAdapter();
init_checkoutProviderObservation();
var PROVIDER = "pp_stripe";
var LIVE_PAY = ["pending", "processing", "authorized", "unknown"];
async function stripeProvider(context) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Card payments are not set up");
  const provider = await context.prisma.paymentProvider.findUnique({ where: { code: PROVIDER } });
  if (!provider?.isInstalled) throw new Error("Card payments are not set up");
  return provider;
}
async function startCheckCardPayment(_, a, c) {
  requirePermission(c, "canManageChecks");
  const provider = await stripeProvider(c);
  const tipCents = a.tipCents == null ? 0 : a.tipCents;
  if (!Number.isSafeInteger(tipCents) || tipCents < 0 || tipCents > 1e6) throw new Error("Tip must be zero or more");
  const local = await command(c, "startCheckCardPayment", a, async (tx) => {
    const check = await tx.check.findUnique({ where: { id: String(a.checkId || "") }, include: { items: true } });
    if (!check) throw new Error("Check not found");
    const live = await tx.payment.findFirst({ where: { checkId: check.id, status: { in: LIVE_PAY } } });
    if (live) return { paymentId: live.id, amount: live.amount, resumed: true };
    if (check.status !== "open") throw new Error("Check cannot take a card payment");
    if (await tx.payment.count({ where: { checkId: check.id, status: "succeeded" } })) throw new Error("Check already paid");
    const bill = checkBill({ items: check.items, requiredItems: check.minimumItemsRequired, cheapestCents: check.minimumUnitPriceCents, floorCents: check.minimumCentsFloor, taxBps: check.taxBps, tipCents });
    if (bill.totalCents < 50) throw new Error("Card payments start at $0.50; close the check instead");
    const changed = await tx.check.updateMany({ where: { id: check.id, status: "open" }, data: { status: "presented", ...bill } });
    if (changed.count !== 1) throw new Error("Check changed");
    const attempts = await tx.payment.count({ where: { checkId: check.id } });
    const payment2 = await tx.payment.create({ data: { idempotencyKey: `checkpay:${check.id}:${attempts + 1}`, amount: bill.totalCents, tipAmount: bill.tipCents, currencyCode: check.currencyCode || "USD", status: "pending", paymentMethod: "credit_card", checkId: check.id, paymentProviderId: provider.id, processedById: c.session.itemId } });
    await audit(tx, c, "card_started", "Check", check.id, { status: "open" }, { status: "presented", ...bill, paymentId: payment2.id });
    return { paymentId: payment2.id, amount: payment2.amount, resumed: false };
  }, "check:" + a.checkId);
  const payment = await c.prisma.payment.findUnique({ where: { id: local.paymentId } });
  let intentId = payment.providerPaymentId;
  let clientSecret = payment.data?.clientSecret;
  if (!intentId) {
    const created = await createPayment({ provider, order: { id: "", orderNumber: "", checkPaymentId: payment.id }, amount: payment.amount, currency: payment.currencyCode, idempotencyKey: hash("checkpay:" + payment.id) });
    intentId = created.paymentIntentId;
    clientSecret = created.clientSecret;
    await c.prisma.payment.updateMany({ where: { id: payment.id, providerPaymentId: "" }, data: { providerPaymentId: intentId, status: "processing", data: { clientSecret, checkId: a.checkId } } });
  }
  return { paymentId: payment.id, amountCents: payment.amount, clientSecret, publishableKey: process.env.NEXT_PUBLIC_STRIPE_KEY || "" };
}
async function settleCheckCard(c, paymentId) {
  const payment = await c.prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment?.checkId) throw new Error("Payment not found");
  if (payment.status === "succeeded") return { status: "paid", checkId: payment.checkId };
  if (!LIVE_PAY.includes(payment.status) || !payment.providerPaymentId) return { status: payment.status, checkId: payment.checkId };
  const provider = await stripeProvider(c);
  let observed;
  try {
    observed = await getPaymentStatus({ provider, paymentId: payment.providerPaymentId });
  } catch {
    return { status: "unknown", checkId: payment.checkId };
  }
  if (observed.status !== "succeeded") {
    const declined = observed.status === "canceled" || observed.status === "requires_payment_method" && !!observed.data?.last_payment_error;
    return { status: declined ? "declined" : "pending", checkId: payment.checkId, message: declined ? String(observed.data?.last_payment_error?.message || "Card declined").slice(0, 200) : "" };
  }
  assertCheckoutProviderObservation(observed, payment.amount, payment.currencyCode);
  return c.prisma.$transaction(async (tx) => {
    await lockTransactionKey(tx, "check:" + payment.checkId);
    const p2 = await tx.payment.findUnique({ where: { id: payment.id }, include: { check: true } });
    if (p2.status === "succeeded") return { status: "paid", checkId: p2.checkId };
    if (p2.check.status !== "presented" || p2.check.totalCents !== p2.amount) throw new Error("Check changed while the card was charged; reconcile it");
    await tx.payment.update({ where: { id: p2.id }, data: { status: "succeeded", processedAt: /* @__PURE__ */ new Date(), errorMessage: "" } });
    await tx.check.update({ where: { id: p2.checkId }, data: { status: "paid" } });
    await tx.seatingAssignment.updateMany({ where: { id: p2.check.seatingAssignmentId, status: "seated" }, data: { status: "closed" } });
    await tx.tableOccupancy.updateMany({ where: { assignmentId: p2.check.seatingAssignmentId }, data: { occupancyKey: null } });
    await audit(tx, c, "paid_card", "Check", p2.checkId, { status: "presented" }, { status: "paid", paymentId: p2.id, amount: p2.amount, intent: p2.providerPaymentId });
    return { status: "paid", checkId: p2.checkId };
  }, { timeout: 2e4 });
}
async function completeCheckCardPayment(_, a, c) {
  requirePermission(c, "canManageChecks");
  const payment = await c.prisma.payment.findUnique({ where: { id: String(a.paymentId || "") } });
  if (!payment?.checkId || payment.checkId !== a.checkId) throw new Error("Payment not found");
  return settleCheckCard(c, payment.id);
}
async function cancelCheckCardPayment(_, a, c) {
  requirePermission(c, "canManageChecks");
  const payment = await c.prisma.payment.findUnique({ where: { id: String(a.paymentId || "") } });
  if (!payment?.checkId || payment.checkId !== a.checkId) throw new Error("Payment not found");
  if (!LIVE_PAY.includes(payment.status)) throw new Error("This payment is " + payment.status);
  if (payment.providerPaymentId) {
    const provider = await stripeProvider(c);
    const r = await cancelPayment({ provider, paymentId: payment.providerPaymentId, idempotencyKey: hash("checkpay-cancel:" + payment.id) });
    if (r.status === "succeeded") {
      await settleCheckCard(c, payment.id);
      throw new Error("The card was already charged; the check is paid");
    }
    if (r.status !== "cancelled") throw new Error("Stripe did not cancel the payment; try again");
  }
  return command(c, "cancelCheckCardPayment", a, async (tx) => {
    const p2 = await tx.payment.findUnique({ where: { id: payment.id } });
    if (!LIVE_PAY.includes(p2.status)) throw new Error("This payment is " + p2.status);
    await tx.payment.update({ where: { id: p2.id }, data: { status: "cancelled", errorMessage: String(a.reason || "Cancelled at the table").slice(0, 200) } });
    const reopened = await tx.check.updateMany({ where: { id: p2.checkId, status: "presented" }, data: { status: "open" } });
    await audit(tx, c, "card_cancelled", "Check", p2.checkId, { status: "presented", paymentId: p2.id }, { status: reopened.count ? "open" : "unchanged" }, String(a.reason || ""));
    return { status: "cancelled", checkId: p2.checkId };
  }, "check:" + a.checkId);
}

// features/keystone/mutations/index.ts
init_managerApproval();

// features/keystone/lib/constraint-errors.ts
var import_graphql = require("graphql");
var AMOUNT = "COMEDY_INVALID_AMOUNT";
var CURRENCY = { code: "COMEDY_INVALID_CURRENCY", message: "Currency must be a three-letter code, such as USD." };
var TIME = "COMEDY_INVALID_TIME_RANGE";
var CONSTRAINT_MESSAGES = {
  PriceTier_counts_valid: { code: "COMEDY_CAPACITY_EXCEEDED", message: "Sold and held tickets can\u2019t exceed a tier\u2019s capacity." },
  PriceTier_amounts_valid: { code: AMOUNT, message: "Ticket price and fee can\u2019t be negative, and a unit must seat at least one guest." },
  PriceTier_sale_window: { code: TIME, message: "Ticket sales must end after they start." },
  Show_time_order: { code: TIME, message: "A show must end after it starts, and doors can\u2019t open after the start." },
  Show_capacity_non_negative: { code: "COMEDY_INVALID_CAPACITY", message: "Capacity can\u2019t be negative." },
  Run_time_order: { code: TIME, message: "A run must end after it starts." },
  Run_fee_non_negative: { code: AMOUNT, message: "A run fee can\u2019t be negative." },
  ShowTemplate_duration_positive: { code: TIME, message: "A show\u2019s duration must be longer than zero minutes." },
  Room_capacity_non_negative: { code: "COMEDY_INVALID_CAPACITY", message: "Capacity can\u2019t be negative." },
  Table_seats_positive: { code: "COMEDY_INVALID_CAPACITY", message: "A table needs at least one seat." },
  Venue_rates_valid: { code: "COMEDY_INVALID_RATE", message: "Tax and service fee rates must be between 0% and 100%." },
  Venue_minimum_valid: { code: AMOUNT, message: "The drink minimum can\u2019t be negative." },
  VenueSettings_ranges: { code: "COMEDY_INVALID_SETTING", message: "Hold time must be 1 to 240 minutes, the refund window 0 to 8,760 hours, and approval amounts can\u2019t be negative." },
  VenueSettings_currency_code: CURRENCY,
  Venue_timezone_valid: { code: "COMEDY_INVALID_TIMEZONE", message: "That isn\u2019t a recognised time zone. Use a name such as America/Chicago." },
  TicketOrder_amounts_balance: { code: AMOUNT, message: "An order total must equal subtotal + fees \u2212 discount + tax, with no negative parts." },
  TicketOrder_currency_code: CURRENCY,
  TicketOrder_party_size: { code: "COMEDY_INVALID_QUANTITY", message: "A party needs at least one guest." },
  TicketOrderLine_amounts_valid: { code: AMOUNT, message: "Ticket quantities must be at least one and prices can\u2019t be negative." },
  TicketOrderLine_currency_code: CURRENCY,
  Payment_amounts_valid: { code: AMOUNT, message: "A payment must be positive, and refunds and tips can\u2019t exceed it." },
  Payment_currency_code: CURRENCY,
  Refund_amount_positive: { code: AMOUNT, message: "A refund must be a positive amount." },
  Refund_currency_code: CURRENCY,
  Refund_within_payment: { code: "COMEDY_REFUND_EXCEEDS_PAYMENT", message: "Refunds can\u2019t exceed what was paid, and must be in the payment\u2019s currency." },
  Check_amounts_balance: { code: AMOUNT, message: "A check total must equal subtotal + tax + tip, with no negative parts." },
  Check_tax_rate: { code: "COMEDY_INVALID_RATE", message: "Tax must be between 0% and 100%." },
  Check_currency_code: CURRENCY,
  CheckItem_amounts_valid: { code: AMOUNT, message: "Items need a quantity of at least one and a price that isn\u2019t negative." },
  LineupSlot_amounts_valid: { code: AMOUNT, message: "Set length must be longer than zero; fees and bonuses can\u2019t be negative." },
  ComedianPayout_amount_non_negative: { code: AMOUNT, message: "A payout can\u2019t be negative." },
  ComedianPayout_currency_code: CURRENCY,
  Comp_quantity_positive: { code: "COMEDY_INVALID_QUANTITY", message: "A comp needs at least one ticket." },
  WaitlistEntry_party_size: { code: "COMEDY_INVALID_QUANTITY", message: "A party needs at least one guest." },
  PromoCode_value_valid: { code: AMOUNT, message: "A promo value can\u2019t be negative, and a percentage can\u2019t pass 100%." },
  PromoCode_uses_valid: { code: "COMEDY_PROMO_LIMIT", message: "A promo can\u2019t be used more times than its limit allows." },
  PromoCode_window: { code: TIME, message: "A promo must end after it starts." },
  Room_venue_name_key: { code: "COMEDY_DUPLICATE_NAME", message: "This venue already has a room with that name.", fields: ["venue", "name"] },
  Section_room_name_key: { code: "COMEDY_DUPLICATE_NAME", message: "This room already has a section with that name.", fields: ["room", "name"] },
  Table_section_label_key: { code: "COMEDY_DUPLICATE_NAME", message: "This section already has a table with that label.", fields: ["section", "label"] },
  WaitlistEntry_one_active_per_show_email: { code: "COMEDY_DUPLICATE_WAITLIST", message: "This email is already on the waitlist for that show.", fields: ["show", "email"] },
  LineupSlot_one_host_headliner_per_show: { code: "COMEDY_DUPLICATE_LINEUP_ROLE", message: "This show already has a host and headliner. Cancel the existing slot first.", fields: ["show", "role"] },
  LineupSlot_one_active_per_show_comedian: { code: "COMEDY_DUPLICATE_LINEUP_SLOT", message: "That comedian is already on this show\u2019s lineup.", fields: ["show", "comedian"] },
  Check_one_open_per_seating: { code: "COMEDY_DUPLICATE_CHECK", message: "This party already has an open check.", fields: ["seatingAssignment"] },
  Payment_one_live_per_check: { code: "COMEDY_DUPLICATE_PAYMENT", message: "This check already has a payment in progress or paid.", fields: ["check"] },
  Payment_provider_reference_key: { code: "COMEDY_DUPLICATE_PAYMENT_REFERENCE", message: "That payment reference has already been applied.", fields: ["providerPaymentId"] }
};
function chain(error) {
  const out = [];
  let current = error;
  for (let depth = 0; current && depth < 6; depth++) {
    out.push(current);
    current = current.originalError ?? current.cause;
  }
  return out;
}
function constraintRefusal(error) {
  for (const link of chain(error)) {
    const text44 = [
      link?.message,
      typeof link?.meta === "object" ? JSON.stringify(link.meta) : "",
      link?.extensions?.debug?.message ?? "",
      link?.extensions?.prisma?.meta ? JSON.stringify(link.extensions.prisma.meta) : ""
    ].join(" ");
    for (const [name, rule] of Object.entries(CONSTRAINT_MESSAGES)) if (text44.includes(name)) return rule;
    const listed = /Unique constraint failed on the fields: \((.*?)\)(?:\s|$)/.exec(String(link?.message || ""))?.[1]?.match(/`([^`]+)`/g)?.map((field) => field.slice(1, -1));
    const keyed = /Key \((.*?)\)=\(.*\) already exists/.exec(text44)?.[1]?.split(",").map((field) => field.trim().replace(/^"|"$/g, "").replace(/^lower\((.*)\)$/, "$1"));
    const unwrap = (field) => String(field).replace(/^lower\((.*)\)$/, "$1");
    const fields = (link?.code === "P2002" && Array.isArray(link?.meta?.target) ? link.meta.target : listed ?? keyed)?.map(unwrap);
    if (fields?.length) {
      const target = [...fields].map(String).sort().join(",");
      const match = Object.values(CONSTRAINT_MESSAGES).find((rule) => rule.fields && [...rule.fields].sort().join(",") === target);
      if (match) return match;
    }
  }
  return null;
}
function constraintGraphQLError(error, refusal) {
  return new import_graphql.GraphQLError(refusal.message, { nodes: error.nodes, source: error.source, positions: error.positions, path: error.path, extensions: { code: refusal.code } });
}

// features/keystone/mutations/index.ts
var graphql3 = String.raw;
var UNSAFE = /prisma|invocation|\bat\s+\S+\s*\(|node_modules|postgres(ql)?:\/\/|\bSQL\b|ECONN|query engine|\.ts:\d+|\.js:\d+/i;
var op = (fn) => async (root, args, context) => {
  try {
    return await fn(root, args, context);
  } catch (error) {
    const refusal = constraintRefusal(error);
    if (refusal) throw error instanceof import_graphql2.GraphQLError ? constraintGraphQLError(error, refusal) : new import_graphql2.GraphQLError(refusal.message, { extensions: { code: refusal.code } });
    if (error instanceof import_graphql2.GraphQLError) throw error;
    const message = typeof error?.message === "string" ? error.message : "";
    console.error("Operation failed:", message.slice(0, 300));
    const safe = message && message.length <= 300 && !UNSAFE.test(message) && !error?.code;
    throw new import_graphql2.GraphQLError(safe ? message : "Unable to complete the request. Please try again.", { extensions: { code: "KS_USER_INPUT_ERROR" } });
  }
};
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: graphql3`
      scalar JSON
      type Query {
        redirectToInit: Boolean
        showsOnSale: JSON
        doorBoard(showId: ID, term: String): JSON
        showAvailability(showId: ID!): JSON
        waitlistOffer(holdKey: String!, cartToken: String!): JSON
        slotInvite(slotId: ID!, token: String!): JSON
        holderTicket(ticketCode: String!, token: String!): JSON
        lookupTicketOrder(email: String!, orderNumber: String!): JSON
        ticketOrderConfirmation(orderNumber: String!, orderSecret: String!): JSON
        openMicShows: JSON
        showReport(from: String!, to: String!): JSON
        payStatement(comedianId: ID!, year: Int!): JSON
        previewRoomLayout(roomId: ID!, changes: JSON!): JSON
        seriesCancelProgress(groupId: ID!): JSON
        previewShowSeries(sourceShowId: ID!, dates: [String!], from: String, count: Int, everyDays: Int, startTime: String, copyLineup: Boolean): JSON
        matchingManagerApproval(actionType: String!, targetId: String!, reason: String!, amount: Int): JSON
      }
      input UserUpdateProfileInput { name: String, email: String, password: String, onboardingStatus: String, notificationPreference: Boolean }
      input CustomerInput { name: String!, email: String!, phone: String }
      input HoldLineInput { tierId: ID!, quantity: Int!, tableIds: [ID!] }
      input SlotOrderInput { id: ID!, position: Int!, setMinutes: Int! }
      type Mutation {
        expireHolds(showId: ID): JSON
        createTicketHold(showId: ID!, tierId: ID, quantity: Int, tableIds: [ID!], lines: [HoldLineInput!], idempotencyKey: String!): JSON
        applyPromoToHold(holdKey: String!, cartToken: String!, code: String!, idempotencyKey: String!): JSON
        startTicketCheckout(holdKey: String!, cartToken: String!, customer: CustomerInput!, ageAttested: Boolean, seatingRequest: String, occasion: String, idempotencyKey: String!): JSON
        completeTicketCheckout(orderNumber: String!, orderSecret: String!): JSON
        abandonTicketCheckout(orderNumber: String!, orderSecret: String!): JSON
        cancelMyTicketOrder(orderNumber: String!, email: String!, idempotencyKey: String!): JSON
        transferTicket(orderNumber: String!, orderSecret: String!, ticketCode: String!, name: String!, email: String!, idempotencyKey: String!): JSON
        issueSlotLink(slotId: ID!, idempotencyKey: String!): JSON
        respondToSlot(slotId: ID!, token: String!, response: String!, idempotencyKey: String!): JSON
        joinWaitlist(showId: ID!, name: String!, email: String!, partySize: Int!, idempotencyKey: String!): JSON
        offerWaitlist(showId: ID!, idempotencyKey: String!): JSON
        removeWaitlistEntry(entryId: ID!, reason: String, idempotencyKey: String!): JSON
        openMicSignup(showId: ID!, name: String!, email: String!, comedianId: ID, idempotencyKey: String!): JSON

        generateShowsFromTemplate(templateId: ID!, from: String, idempotencyKey: String!): JSON
        publishShow(showId: ID!, nextStatus: String, idempotencyKey: String!): JSON
        pauseSales(showId: ID!, idempotencyKey: String!): JSON
        resumeSales(showId: ID!, idempotencyKey: String!): JSON
        cancelShow(showId: ID!, reason: String!, idempotencyKey: String!): JSON
        setLineup(showId: ID!, slots: [SlotOrderInput!]!, idempotencyKey: String!): JSON
        offerSlot(showId: ID!, comedianId: ID!, role: String!, position: Int, setMinutes: Int, feeCents: Int, idempotencyKey: String!): JSON
        confirmSlot(slotId: ID!, idempotencyKey: String!): JSON
        setComedianStatus(comedianId: ID!, status: String!, idempotencyKey: String!): JSON
        issueComp(showId: ID!, tierId: ID!, quantity: Int!, recipientName: String!, recipientEmail: String, reason: String!, approvalId: ID, idempotencyKey: String!): JSON
        checkInTicket(tokenOrCode: String!, showId: ID!, method: String, scannedAt: String, idempotencyKey: String!): JSON
        seatParty(orderId: ID!, tableIds: [ID!]!, showId: ID!, serverId: ID, idempotencyKey: String!): JSON
        moveParty(assignmentId: ID!, tableIds: [ID!]!, reason: String, idempotencyKey: String!): JSON
        unseatParty(assignmentId: ID!, reason: String, idempotencyKey: String!): JSON
        openCheck(seatingAssignmentId: ID!, idempotencyKey: String!): JSON
        addCheckItem(checkId: ID!, menuItemId: ID!, qty: Int!, idempotencyKey: String!): JSON
        voidCheckItem(itemId: ID!, checkId: ID!, reason: String!, approvalId: ID!, idempotencyKey: String!): JSON
        startCheckCardPayment(checkId: ID!, tipCents: Int, idempotencyKey: String!): JSON
        completeCheckCardPayment(checkId: ID!, paymentId: ID!): JSON
        cancelCheckCardPayment(checkId: ID!, paymentId: ID!, reason: String, idempotencyKey: String!): JSON
        voidCheck(checkId: ID!, reason: String!, approvalId: ID!, leftVenue: Boolean, idempotencyKey: String!): JSON
        closeCheck(checkId: ID!, tipCents: Int, waive: Boolean, reason: String, approvalId: ID, idempotencyKey: String!): JSON
        runOpenMicLottery(showId: ID!, idempotencyKey: String!): JSON
        addBringerSignup(showId: ID!, name: String!, email: String!, guestsRequired: Int!, idempotencyKey: String!): JSON
        recordBringerArrival(signupId: ID!, guests: Int!, idempotencyKey: String!): JSON
        updatePromoLimit(promoId: ID!, perOrderLimit: Int!, idempotencyKey: String!): JSON
        undoCheckIn(ticketId: ID!, showId: ID!, reason: String!, idempotencyKey: String!): JSON
        setSignupStatus(signupId: ID!, status: String!, idempotencyKey: String!): JSON
        updateSlotStatus(slotId: ID!, status: String!, idempotencyKey: String!): JSON
        setSalesWindow(tierId: ID!, salesStartAt: String, salesEndAt: String, idempotencyKey: String!): JSON
        exportShowReport(from: String!, to: String!, idempotencyKey: String!): JSON
        exportPayStatement(comedianId: ID!, year: Int!, idempotencyKey: String!): JSON
        editRoomLayout(roomId: ID!, changes: JSON!, reason: String, idempotencyKey: String!): JSON
        createShowSeries(sourceShowId: ID!, name: String, dates: [String!], from: String, count: Int, everyDays: Int, startTime: String, copyLineup: Boolean, idempotencyKey: String!): JSON
        editShowSeries(groupId: ID!, edit: JSON!, idempotencyKey: String!): JSON
        cancelShowSeries(groupId: ID!, reason: String!, idempotencyKey: String!): JSON
        closeShow(showId: ID!, idempotencyKey: String!): JSON
        closeRun(runId: ID!, idempotencyKey: String!): JSON
        approvePayout(payoutId: ID!, idempotencyKey: String!): JSON
        recordPayoutPaid(payoutId: ID!, method: String!, reference: String!, idempotencyKey: String!): JSON
        refundTicketOrder(orderId: ID!, amountCents: Int, ticketIds: [ID!], reason: String!, approvalId: ID, idempotencyKey: String!): JSON
        requestApproval(actionType: String!, targetId: String!, reason: String!, amount: Int): JSON
        approveRequest(approvalId: ID!): JSON
        updateActiveUser(data: UserUpdateProfileInput!): User
        ensureClubOnboardingRecord(entity: String!, data: JSON!): JSON
        seedClubOperations(template: String!): JSON
      }
    ` + storeLogoTypeDefs,
    resolvers: {
      Query: {
        storeLogo,
        redirectToInit: redirectToInit_default,
        showsOnSale: op(showsOnSale),
        doorBoard: op(doorBoard),
        showAvailability: op(showAvailability),
        waitlistOffer: op(waitlistOffer),
        slotInvite: op(slotInvite),
        holderTicket: op(holderTicket),
        lookupTicketOrder: op(lookupTicketOrder),
        ticketOrderConfirmation: op(ticketOrderConfirmation),
        openMicShows: op(openMicShows),
        matchingManagerApproval: op(matchingManagerApproval),
        showReport: op(showReport),
        payStatement: op(payStatement),
        previewShowSeries: op(previewShowSeries),
        previewRoomLayout: op(previewRoomLayout),
        seriesCancelProgress: op(seriesCancelProgress)
      },
      Mutation: {
        expireHolds: op(expireHolds),
        createTicketHold: op(createTicketHold),
        applyPromoToHold: op(applyPromoToHold),
        startTicketCheckout: op(startTicketCheckout),
        completeTicketCheckout: op(completeTicketCheckout),
        abandonTicketCheckout: op(abandonTicketCheckout),
        cancelMyTicketOrder: op(cancelMyTicketOrder),
        openMicSignup: op(openMicSignup),
        joinWaitlist: op(joinWaitlist),
        transferTicket: op(transferTicket),
        issueSlotLink: op(issueSlotLink),
        respondToSlot: op(respondToSlot),
        offerWaitlist: op(offerWaitlist),
        removeWaitlistEntry: op(removeWaitlistEntry),
        generateShowsFromTemplate: op(generateShowsFromTemplate),
        publishShow: op(publishShow),
        pauseSales: op(pauseSales),
        resumeSales: op(resumeSales),
        cancelShow: op(cancelShow),
        setLineup: op(setLineup),
        offerSlot: op(offerSlot),
        confirmSlot: op(confirmSlot),
        setComedianStatus: op(setComedianStatus),
        issueComp: op(issueComp),
        checkInTicket: op(checkInTicket),
        seatParty: op(seatParty),
        moveParty: op(moveParty),
        unseatParty: op(unseatParty),
        openCheck: op(openCheck),
        addCheckItem: op(addCheckItem),
        voidCheckItem: op(voidCheckItem),
        voidCheck: op(voidCheck),
        startCheckCardPayment: op(startCheckCardPayment),
        completeCheckCardPayment: op(completeCheckCardPayment),
        cancelCheckCardPayment: op(cancelCheckCardPayment),
        closeCheck: op(closeCheck),
        runOpenMicLottery: op(runOpenMicLottery),
        setSalesWindow: op(setSalesWindow),
        updateSlotStatus: op(updateSlotStatus),
        undoCheckIn: op(undoCheckIn),
        updatePromoLimit: op(updatePromoLimit),
        addBringerSignup: op(addBringerSignup),
        recordBringerArrival: op(recordBringerArrival),
        setSignupStatus: op(setSignupStatus),
        closeShow: op(closeShow),
        exportShowReport: op(exportShowReport),
        exportPayStatement: op(exportPayStatement),
        createShowSeries: op(createShowSeries),
        editRoomLayout: op(editRoomLayout),
        editShowSeries: op(editShowSeries),
        cancelShowSeries: op(cancelShowSeries),
        closeRun: op(closeRun),
        approvePayout: op(approvePayout),
        recordPayoutPaid: op(recordPayoutPaid),
        refundTicketOrder: op(refundTicketOrder),
        requestApproval: op(requestApproval),
        approveRequest: op(approveRequest),
        updateActiveUser: updateActiveUser_default,
        ensureClubOnboardingRecord: op(ensureClubOnboardingRecord),
        seedClubOperations: op(seedClubOperations)
      }
    }
  });
}

// features/keystone/lib/mail.ts
var import_nodemailer = require("nodemailer");

// features/keystone/lib/email-layout.ts
var SUPPORT_EMAIL = "hello@comedy-club.openship.org";
var FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
var C = {
  canvas: "#f4f4f5",
  card: "#ffffff",
  text: "#18181b",
  muted: "#52525b",
  subtle: "#71717a",
  line: "#e4e4e7",
  panel: "#fafafa",
  button: "#18181b",
  buttonText: "#ffffff",
  link: "#18181b"
};
var escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function storeNameFromEnv(fallback = "Comedy Club") {
  const match = /^\s*"?([^"<]+?)"?\s*</.exec(process.env.SMTP_FROM || "");
  return match?.[1]?.trim() || fallback;
}
var p = (html, style = "") => `<p class="em-text" style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:24px;color:${C.text};${style}">${html}</p>`;
var emailParagraph = p;
var emailMuted = (html) => `<p class="em-muted" style="margin:0 0 16px;font-family:${FONT};font-size:14px;line-height:22px;color:${C.muted};">${html}</p>`;
function emailButton(label, href) {
  return `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:8px 0 24px;">
<tr><td class="em-btn" align="center" bgcolor="${C.button}" style="border-radius:8px;background:${C.button};">
<a class="em-btn-a" href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;color:${C.buttonText};text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}
function emailLayout(input) {
  const store = escapeHtml(input.storeName || storeNameFromEnv());
  const support = escapeHtml(input.supportEmail || SUPPORT_EMAIL);
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(input.title)}</title>
<style>
:root { color-scheme: light dark; supported-color-schemes: light dark; }
body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
a { color:${C.link}; }
@media (max-width: 620px) { .em-pad { padding-left:20px !important; padding-right:20px !important; } }
@media (prefers-color-scheme: dark) {
  .em-canvas { background:#09090b !important; }
  .em-card { background:#18181b !important; border-color:#27272a !important; }
  .em-text { color:#fafafa !important; }
  .em-muted { color:#a1a1aa !important; }
  .em-line { border-color:#3f3f46 !important; }
  .em-panel { background:#27272a !important; border-color:#3f3f46 !important; color:#fafafa !important; }
  .em-btn { background:#fafafa !important; }
  .em-btn-a { color:#18181b !important; }
  .em-link { color:#fafafa !important; }
}
[data-ogsc] .em-text { color:#fafafa !important; }
[data-ogsc] .em-muted { color:#a1a1aa !important; }
[data-ogsb] .em-canvas { background:#09090b !important; }
[data-ogsb] .em-card { background:#18181b !important; }
</style>
</head>
<body class="em-canvas" style="margin:0;padding:0;background:${C.canvas};">
${input.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(input.preheader)}</div>` : ""}
<table role="presentation" class="em-canvas" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="${C.canvas}" style="background:${C.canvas};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;">
<tr><td class="em-pad" style="padding:8px 32px 20px;font-family:${FONT};font-size:18px;line-height:24px;font-weight:700;letter-spacing:-0.01em;"><span class="em-text" style="color:${C.text};">${store}</span></td></tr>
<tr><td class="em-card" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:12px;">
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
<tr><td class="em-pad" style="padding:32px 32px 16px;">
<h1 class="em-text" style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:32px;font-weight:700;letter-spacing:-0.02em;color:${C.text};">${escapeHtml(input.title)}</h1>
${input.body}
</td></tr>
</table>
</td></tr>
<tr><td class="em-pad" style="padding:20px 32px 8px;font-family:${FONT};font-size:13px;line-height:20px;color:${C.subtle};">
<span class="em-muted" style="color:${C.subtle};">${input.footerNote ? `${input.footerNote}<br>` : ""}Questions? Email <a class="em-link" href="mailto:${support}" style="color:${C.muted};text-decoration:underline;">${support}</a>.<br>${store}</span>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// features/keystone/lib/mail.ts
function getBaseUrlForEmails() {
  if (process.env.SMTP_STORE_LINK) {
    return process.env.SMTP_STORE_LINK;
  }
  console.warn("SMTP_STORE_LINK not set. Please add SMTP_STORE_LINK to your environment variables for email links to work properly.");
  return "";
}
var transport = (0, import_nodemailer.createTransport)({
  // @ts-ignore
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});
function passwordResetEmail({ url }) {
  return emailLayout({
    preheader: "Use this link to choose a new password.",
    title: "Reset your password",
    body: `${emailParagraph("We received a request to reset the password for your account. Use the button below to choose a new one.")}
${emailButton("Reset password", url)}
${emailMuted("If you did not request this, you can safely ignore this email. Your password will not change.")}`
  });
}
async function sendPasswordResetEmail(resetToken, to, baseUrl) {
  const frontendUrl = baseUrl || getBaseUrlForEmails();
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}/dashboard/reset?token=${resetToken}`
    })
  });
  if (process.env.MAIL_USER?.includes("ethereal.email")) {
    console.log(`\u{1F4E7} Message Sent!  Preview it at ${(0, import_nodemailer.getTestMessageUrl)(info)}`);
  }
}

// features/keystone/mcp-oauth/session.ts
async function resolveMcpAccessToken(context, token, listKey = "User") {
  try {
    const sudo = context.sudo();
    const record = await sudo.db.OAuthToken.findOne({ where: { token: digestToken(token) } });
    if (!record || record.tokenType !== "access_token" || record.isRevoked !== "false" || !record.userId || !record.expiresAt || new Date(record.expiresAt).getTime() <= Date.now()) {
      return void 0;
    }
    const app = await sudo.db.OAuthApp.findOne({ where: { clientId: record.clientId } });
    if (!app || app.status !== "active") return void 0;
    const mcp = {
      clientId: record.clientId,
      scopes: storedScopes(record.scopes),
      tokenId: String(record.id)
    };
    return { itemId: String(record.userId), listKey, mcp };
  } catch {
    return void 0;
  }
}
function withMcpBearerSessions(strategy, listKey = "User") {
  return {
    ...strategy,
    async get({ context }) {
      const token = bearerToken(context?.req?.headers?.authorization);
      if (isMcpAccessToken(token)) return resolveMcpAccessToken(context, token, listKey);
      return strategy.get({ context });
    }
  };
}

// features/keystone/database-url.ts
var POOL_SIZES = { web: 15, worker: 5 };
var OVERRIDE_ENV = {
  web: "DATABASE_CONNECTION_LIMIT",
  worker: "DATABASE_CONNECTION_LIMIT_WORKER"
};
function pooledDatabaseUrl(url, role = "web") {
  if (!url || !/^postgres(ql)?:\/\//.test(url)) return url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.searchParams.has("connection_limit")) return url;
  const override = Number(process.env[OVERRIDE_ENV[role]]);
  parsed.searchParams.set("connection_limit", String(Number.isInteger(override) && override > 0 ? override : POOL_SIZES[role]));
  return parsed.toString();
}

// features/keystone/lib/keystonePrismaErrors.ts
var RAW_METHOD = /^\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe|queryRawTyped|runCommandRaw)$/;
var clients = /* @__PURE__ */ new WeakMap();
var delegates = /* @__PURE__ */ new WeakMap();
function isKeystonePrismaError(value) {
  return value instanceof Error && value.extensions?.code === "KS_PRISMA_ERROR";
}
function rethrowKeystonePrismaError(value) {
  if (!isKeystonePrismaError(value)) return value;
  const prisma = value.extensions.prisma ?? {};
  throw Object.assign(value, { code: prisma.code, meta: prisma.meta, clientVersion: prisma.clientVersion });
}
function throwing(result) {
  if (!result || typeof result.then !== "function") return rethrowKeystonePrismaError(result);
  const settled = () => result.then(rethrowKeystonePrismaError);
  return new Proxy(result, {
    get(target, key) {
      if (key === "then") return (ok, fail) => settled().then(ok, fail);
      if (key === "catch") return (fail) => settled().catch(fail);
      if (key === "finally") return (done) => settled().finally(done);
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}
function throwingDelegate(delegate) {
  const cached = delegates.get(delegate);
  if (cached) return cached;
  const wrapped = new Proxy(delegate, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? (...args) => throwing(value.apply(target, args)) : value;
    }
  });
  delegates.set(delegate, wrapped);
  return wrapped;
}
function throwKeystonePrismaErrors(client) {
  const cached = clients.get(client);
  if (cached) return cached;
  const wrapped = new Proxy(client, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key === "$transaction" && typeof value === "function") {
        return (work, ...options) => {
          if (typeof work === "function") return value.call(target, (tx) => work(throwKeystonePrismaErrors(tx)), ...options);
          return Promise.resolve(value.call(target, work, ...options)).then((results) => Array.isArray(results) ? results.map(rethrowKeystonePrismaError) : results);
        };
      }
      if (key === "$extends" && typeof value === "function") return (...args) => throwKeystonePrismaErrors(value.apply(target, args));
      if (typeof key === "string" && RAW_METHOD.test(key) && typeof value === "function") return (...args) => throwing(value.apply(target, args));
      if (typeof value === "function") return value.bind(target);
      if (typeof key === "string" && !key.startsWith("$") && value && typeof value === "object" && typeof value.findFirst === "function") return throwingDelegate(value);
      return value;
    }
  });
  clients.set(client, wrapped);
  return wrapped;
}

// features/keystone/index.ts
var databaseURL = process.env.DATABASE_URL || "file:./keystone.db";
var sessionConfig = {
  maxAge: 60 * 60 * 24 * 360,
  // How long they stay signed in?
  secret: process.env.SESSION_SECRET || "this secret should only be used in testing"
};
var {
  S3_BUCKET_NAME: bucketName = "keystone-test",
  S3_REGION: region = "ap-southeast-2",
  S3_ACCESS_KEY_ID: accessKeyId = "keystone",
  S3_SECRET_ACCESS_KEY: secretAccessKey = "keystone",
  S3_ENDPOINT: endpoint = "https://sfo3.digitaloceanspaces.com"
} = process.env;
var { withAuth } = (0, import_auth.createAuth)({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  initFirstItem: {
    fields: ["name", "email", "password"],
    itemData: {
      role: {
        create: {
          name: "Admin",
          ...Object.fromEntries(permissionNames.map((name) => [name, true]))
        }
      }
    }
  },
  passwordResetLink: {
    async sendToken(args) {
      await sendPasswordResetEmail(args.token, args.identity);
    }
  },
  sessionData: `
    name
    email
    role {
      id
      name
      ${permissionNames.join("\n")}
    }
  `
});
var keystone_default = withAuth(
  (0, import_core19.config)({
    db: {
      provider: "postgresql",
      url: pooledDatabaseUrl(databaseURL),
      // Keystone returns failed queries as values; this makes them throw so transactions roll back.
      extendPrismaClient: throwKeystonePrismaErrors
    },
    lists: models,
    storage: {
      my_images: {
        kind: "s3",
        type: "image",
        bucketName,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint,
        signed: { expiry: 5e3 },
        forcePathStyle: true
      }
    },
    ui: {
      isAccessAllowed: ({ session }) => session?.data.role?.canAccessDashboard ?? false
    },
    // MCP OAuth bearer tokens resolve to the approving user; everything else is unchanged.
    session: withMcpBearerSessions((0, import_session.statelessSessions)(sessionConfig)),
    graphql: {
      extendGraphqlSchema
    }
  })
);

// keystone.ts
var keystone_default2 = keystone_default;
//# sourceMappingURL=config.js.map
