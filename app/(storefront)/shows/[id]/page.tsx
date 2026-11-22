import { notFound } from 'next/navigation';
import { gqlCall, SHOW_AVAILABILITY } from '@/features/storefront/lib/data';
import { showTime, ageLabel } from '@/features/storefront/lib/format';
import { venueTimeZone } from '@/features/storefront/lib/venue';
import { HoldForm } from '@/features/storefront/components/HoldForm';

export const dynamic = 'force-dynamic';

export default async function ShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await gqlCall<{ showAvailability: any }>(SHOW_AVAILABILITY, { id });
  if (!r.ok) {
    if (/not available/i.test(r.error)) notFound();
    return <p role="alert" className="text-sm text-red-600">{r.error}</p>;
  }
  const show = r.data.showAvailability;
  const zone = await venueTimeZone();
  const taken = new Set<string>((show.occupancies || []).map((o: any) => o.tableId));
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{show.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{[showTime(show.startsAt, 'date', zone), show.doorsAt ? `Doors ${showTime(show.doorsAt, 'time', zone)}` : '', `Show ${showTime(show.startsAt, 'time', zone)}`, show.room?.name, ageLabel(show.ageRestriction)].filter(Boolean).join(' · ')}</p>
        {show.publicNote ? <p className="mt-2 text-sm">{show.publicNote}</p> : null}
      </div>
      {show.lineup?.length ? (
        <section>
          <h2 className="mb-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">Lineup</h2>
          <ul>{show.lineup.map((l: any, i: number) => <li key={i} className="py-1 text-sm"><span className="font-medium">{l.comedian.stageName}</span> <span className="text-muted-foreground">{l.role.replace('_', ' ')}</span></li>)}</ul>
        </section>
      ) : null}
      {show.status !== 'on_sale' || new Date(show.startsAt) <= new Date() ? <p className="text-sm text-muted-foreground">{show.status === 'sold_out' ? 'This show is sold out.' : 'Ticket sales have ended for this show.'}</p> : <HoldForm
        showId={show.id}
        title={show.title}
        ageRestriction={show.ageRestriction}
        tiers={show.tiers}
        sections={show.room.seatingMode === 'tables' ? show.room.sections.map((s: any) => ({ name: s.name, tables: s.tables.map((t: any) => ({ ...t, taken: taken.has(t.id) })) })) : []}
      />}
    </div>
  );
}
