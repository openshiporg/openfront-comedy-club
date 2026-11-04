export const SLOT_LINK_DAYS = 14;

/** A link works until the show starts, and for at most 14 days. */
export function slotLinkExpiry(now: Date, startsAt: Date) {
  return new Date(Math.min(now.getTime() + SLOT_LINK_DAYS * 864e5, startsAt.getTime()));
}

export type LinkCheck = { ok: true } | { ok: false; reason: 'invalid' | 'expired' };
export function checkSlotLink(slot: { responseTokenHash: string | null; responseTokenExpiresAt: Date | null } | null, tokenHash: string, now: Date): LinkCheck {
  if (!slot || !slot.responseTokenHash || slot.responseTokenHash !== tokenHash) return { ok: false, reason: 'invalid' };
  if (!slot.responseTokenExpiresAt || slot.responseTokenExpiresAt <= now) return { ok: false, reason: 'expired' };
  return { ok: true };
}

export const RESPONSES: Record<string, string> = { confirm: 'confirmed', decline: 'declined' };

/** What the comedian is allowed to see: their own terms for this one slot. */
export function slotTerms(slot: { role: string; setMinutes: number; feeCents: number; bonusCents: number; status: string }) {
  return { role: slot.role, setMinutes: slot.setMinutes, feeCents: slot.feeCents, bonusCents: slot.bonusCents, totalCents: slot.feeCents + slot.bonusCents, status: slot.status, canRespond: slot.status === 'offered' };
}

export function inviteMessage(c: { name: string }, show: { title: string }, link: string, expires: Date) {
  return { subject: `Your slot on ${show.title}`, body: `Hi ${c.name || 'there'}, you have been offered a slot on ${show.title}. Review the set time, length and pay, then confirm or decline here before ${expires.toISOString()}:\n${link}` };
}
