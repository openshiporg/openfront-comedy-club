import { cache } from 'react';
import { keystoneContext } from '@/features/keystone/context';
import { DEFAULT_TIME_ZONE } from './format';

/** The venue's time zone (Venue.timezone), read once per request. Server only. */
export const venueTimeZone = cache(async (): Promise<string> => {
  try {
    const rows = (await keystoneContext.sudo().query.Venue.findMany({ take: 1, query: 'timezone' })) as readonly { timezone: string | null }[];
    const zone = rows[0]?.timezone || DEFAULT_TIME_ZONE;
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
});

export type PublicComedian = { id: string; stageName: string; homeCity: string; headshot: string | null; nextShowId: string; headliner: boolean };
export type PublicMenuItem = { id: string; name: string; category: string; priceCents: number; image: string | null };
export type PublicVenue = { name: string; address: string; policies: string; drinkMinimumItems: number; defaultAgeRestriction: string };

type SlotRow = { role: string; position: number | null; show: { id: string; startsAt: string } | null; comedian: { id: string; stageName: string; homeCity: string; headshot: { url: string } | null } | null };
type MenuRow = { id: string; name: string; category: string; priceCents: number | null; image: { url: string } | null };

/** Public venue facts for the storefront: the confirmed lineups of shows on sale, the active menu and the venue card. Server only, fixed fields. */
export async function venueContent(): Promise<{ comedians: PublicComedian[]; lineups: Record<string, string[]>; menu: PublicMenuItem[]; venue: PublicVenue | null }> {
  try {
    const q = keystoneContext.sudo().query;
    const [slots, menu, venues] = await Promise.all([
      q.LineupSlot.findMany({
        where: { status: { equals: 'confirmed' }, show: { status: { in: ['on_sale', 'sold_out'] }, startsAt: { gt: new Date().toISOString() } } },
        orderBy: [{ position: 'asc' }],
        take: 400,
        query: 'role position show { id startsAt } comedian { id stageName homeCity headshot { url } }',
      }) as Promise<readonly SlotRow[]>,
      q.MenuItem.findMany({ where: { active: { equals: true } }, orderBy: [{ category: 'asc' }, { name: 'asc' }], take: 200, query: 'id name category priceCents image { url }' }) as Promise<readonly MenuRow[]>,
      q.Venue.findMany({ take: 1, query: 'name address policies drinkMinimumItems defaultAgeRestriction' }) as Promise<readonly PublicVenue[]>,
    ]);
    const lineups: Record<string, string[]> = {};
    const byId = new Map<string, PublicComedian & { at: string }>();
    for (const s of [...slots].sort((a, b) => (a.show?.startsAt || '').localeCompare(b.show?.startsAt || '') || (a.position || 0) - (b.position || 0))) {
      if (!s.show || !s.comedian?.stageName) continue;
      (lineups[s.show.id] ||= []).push(s.comedian.stageName);
      const seen = byId.get(s.comedian.id);
      if (seen) { seen.headliner ||= s.role === 'headliner'; continue; }
      byId.set(s.comedian.id, { id: s.comedian.id, stageName: s.comedian.stageName, homeCity: s.comedian.homeCity || '', headshot: s.comedian.headshot?.url || null, nextShowId: s.show.id, headliner: s.role === 'headliner', at: s.show.startsAt });
    }
    const comedians = [...byId.values()].sort((a, b) => Number(b.headliner) - Number(a.headliner) || a.at.localeCompare(b.at)).map((c) => ({ id: c.id, stageName: c.stageName, homeCity: c.homeCity, headshot: c.headshot, nextShowId: c.nextShowId, headliner: c.headliner }));
    return {
      comedians,
      lineups,
      menu: menu.map((m) => ({ id: m.id, name: m.name, category: m.category, priceCents: m.priceCents || 0, image: m.image?.url || null })),
      venue: venues[0] || null,
    };
  } catch (error) {
    console.error('Storefront venue content failed:', error instanceof Error ? error.message : 'unknown');
    return { comedians: [], lineups: {}, menu: [], venue: null };
  }
}
