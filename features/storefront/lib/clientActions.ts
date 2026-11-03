'use server';

import { gqlCall, CONFIRMATION, LOOKUP, OPEN_MIC } from './data';

export async function loadConfirmation(n: string, s: string) {
  const r = await gqlCall<{ ticketOrderConfirmation: any }>(CONFIRMATION, { n, s });
  return r.ok ? { ok: true as const, order: r.data.ticketOrderConfirmation } : { ok: false as const, error: r.error };
}
export async function lookupOrder(e: string, n: string) {
  const r = await gqlCall<{ lookupTicketOrder: any }>(LOOKUP, { e, n: n.trim().toUpperCase() });
  return r.ok ? { ok: true as const, order: r.data.lookupTicketOrder } : { ok: false as const, error: r.error };
}
export async function loadOpenMic() {
  const r = await gqlCall<{ openMicShows: any[] }>(OPEN_MIC);
  return r.ok ? r.data.openMicShows : [];
}
