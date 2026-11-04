'use server';

import { randomUUID } from 'node:crypto';
import { gqlCall } from './data';

const HOLD = `mutation($showId: ID!, $tierId: ID!, $quantity: Int!, $tableIds: [ID!], $k: String!) { createTicketHold(showId: $showId, tierId: $tierId, quantity: $quantity, tableIds: $tableIds, idempotencyKey: $k) }`;
const PROMO = `mutation($holdKey: String!, $cartToken: String!, $code: String!, $k: String!) { applyPromoToHold(holdKey: $holdKey, cartToken: $cartToken, code: $code, idempotencyKey: $k) }`;
const START = `mutation($holdKey: String!, $cartToken: String!, $customer: CustomerInput!, $ageAttested: Boolean, $seatingRequest: String, $occasion: String, $k: String!) { startTicketCheckout(holdKey: $holdKey, cartToken: $cartToken, customer: $customer, ageAttested: $ageAttested, seatingRequest: $seatingRequest, occasion: $occasion, idempotencyKey: $k) }`;
const COMPLETE = `mutation($n: String!, $s: String!) { completeTicketCheckout(orderNumber: $n, orderSecret: $s) }`;
const ABANDON = `mutation($n: String!, $s: String!) { abandonTicketCheckout(orderNumber: $n, orderSecret: $s) }`;
const CANCEL = `mutation($n: String!, $e: String!, $k: String!) { cancelMyTicketOrder(orderNumber: $n, email: $e, idempotencyKey: $k) }`;
const MIC = `mutation($showId: ID!, $name: String!, $email: String!, $k: String!) { openMicSignup(showId: $showId, name: $name, email: $email, idempotencyKey: $k) }`;

const JOIN = `mutation($showId: ID!, $name: String!, $email: String!, $partySize: Int!, $k: String!) { joinWaitlist(showId: $showId, name: $name, email: $email, partySize: $partySize, idempotencyKey: $k) }`;
const OFFER = `query($holdKey: String!, $cartToken: String!) { waitlistOffer(holdKey: $holdKey, cartToken: $cartToken) }`;

const INVITE = `query($slotId: ID!, $token: String!) { slotInvite(slotId: $slotId, token: $token) }`;
const RESPOND = `mutation($slotId: ID!, $token: String!, $response: String!, $k: String!) { respondToSlot(slotId: $slotId, token: $token, response: $response, idempotencyKey: $k) }`;

const TRANSFER = `mutation($n: String!, $s: String!, $t: String!, $name: String!, $email: String!, $k: String!) { transferTicket(orderNumber: $n, orderSecret: $s, ticketCode: $t, name: $name, email: $email, idempotencyKey: $k) }`;

const HOLDER = `query($c: String!, $t: String!) { holderTicket(ticketCode: $c, token: $t) }`;

async function unwrap(p: ReturnType<typeof gqlCall>, key: string) { const r = await p; return r.ok ? { ok: true as const, data: (r.data as any)[key] } : { ok: false as const, error: r.error }; }

export async function createHold(v: { showId: string; tierId: string; quantity: number; tableIds?: string[] }) { return unwrap(gqlCall(HOLD, { ...v, k: randomUUID() }), 'createTicketHold'); }
export async function applyPromo(v: { holdKey: string; cartToken: string; code: string }) { return unwrap(gqlCall(PROMO, { ...v, k: randomUUID() }), 'applyPromoToHold'); }
export async function startCheckout(v: { holdKey: string; cartToken: string; customer: { name: string; email: string; phone?: string }; ageAttested: boolean; seatingRequest?: string; occasion?: string }) { return unwrap(gqlCall(START, { ...v, k: randomUUID() }), 'startTicketCheckout'); }
export async function completeCheckout(n: string, s: string) { return unwrap(gqlCall(COMPLETE, { n, s }), 'completeTicketCheckout'); }
export async function abandonCheckout(n: string, s: string) { return unwrap(gqlCall(ABANDON, { n, s }), 'abandonTicketCheckout'); }
export async function cancelOrder(n: string, e: string) { return unwrap(gqlCall(CANCEL, { n, e, k: randomUUID() }), 'cancelMyTicketOrder'); }
export async function micSignup(v: { showId: string; name: string; email: string }) { return unwrap(gqlCall(MIC, { ...v, k: randomUUID() }), 'openMicSignup'); }
export async function joinWaitlist(v: { showId: string; name: string; email: string; partySize: number }) { return unwrap(gqlCall(JOIN, { ...v, k: randomUUID() }), 'joinWaitlist'); }
export async function claimWaitlistOffer(holdKey: string, cartToken: string) { return unwrap(gqlCall(OFFER, { holdKey, cartToken }), 'waitlistOffer'); }
export async function loadSlotInvite(slotId: string, token: string) { return unwrap(gqlCall(INVITE, { slotId, token }), 'slotInvite'); }
export async function answerSlot(slotId: string, token: string, response: 'confirm' | 'decline') { return unwrap(gqlCall(RESPOND, { slotId, token, response, k: randomUUID() }), 'respondToSlot'); }
export async function transferTicket(v: { orderNumber: string; orderSecret: string; ticketCode: string; name: string; email: string }) { return unwrap(gqlCall(TRANSFER, { n: v.orderNumber, s: v.orderSecret, t: v.ticketCode, name: v.name, email: v.email, k: randomUUID() }), 'transferTicket'); }
export async function loadHolderTicket(ticketCode: string, token: string) { return unwrap(gqlCall(HOLDER, { c: ticketCode, t: token }), 'holderTicket'); }
