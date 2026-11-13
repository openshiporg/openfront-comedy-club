import Link from 'next/link';
import { q, venueTimezone } from '../../lib/server';
import { money, when } from '../../lib/format';
import { Page, Section, Row, Empty, Stat, Status, Meta } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { DoorScanner } from '../components/DoorScanner';
import { SeatingBoard } from '../components/SeatingBoard';
import { ShowSwitcher } from '../components/ShowSwitcher';
import { GuestSearch, GuestTicketRow } from '../components/GuestList';

export default async function TonightPage({ searchParams }: { searchParams?: Promise<{ show?: string; q?: string }> }) {
  const tz = await venueTimezone();
  const params = (await searchParams) || {};
  const { doorBoard } = await q<{ doorBoard: { shows: any[]; show: any; found: any[]; can: { door: boolean; checks: boolean; shows: boolean } } }>(
    `query($id: ID, $term: String) { doorBoard(showId: $id, term: $term) }`,
    { id: params.show || null, term: (params.q || '').trim().slice(0, 80) || null },
  );
  const { shows, show, found, can } = doorBoard;
  if (!show) {
    return <Page title="Tonight"><Empty>No upcoming shows.{can.shows ? ' Open Shows to generate them from a template.' : ''}</Empty></Page>;
  }
  const term = (params.q || '').trim().slice(0, 80);
  const seated = new Set<string>(); const held = new Set<string>();
  for (const o of show.occupancies) { if (o.assignment) seated.add(o.table.id); else held.add(o.table.id); }
  const tables = (show.room?.sections || []).flatMap((s: any) => s.tables.map((t: any) => ({ ...t, section: s.name, state: seated.has(t.id) ? 'seated' : held.has(t.id) ? 'held' : 'free' })));
  const setTotal = show.lineup.filter((l: any) => !['declined', 'cancelled'].includes(l.status)).reduce((n: number, l: any) => n + l.setMinutes, 0);

  return (
    <Page title="Tonight">
      <div className="flex flex-wrap items-center gap-3">
        <ShowSwitcher currentId={show.id} shows={shows.map((s) => ({ id: s.id, title: s.title, when: when(s.startsAt, tz) }))} />
        {can.shows ? <Link href={`/dashboard/platform/shows/${show.id}`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Show detail</Link> : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Status value={show.status} />
        <Meta>{show.room ? `${show.room.name} · ` : ''}doors {when(show.doorsAt, tz, 'time')} · show {when(show.startsAt, tz, 'time')} · {show.ageRestriction === 'all' ? 'All ages' : `${show.ageRestriction}+`}</Meta>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="Checked in" value={`${show.checkedInCount} / ${show.soldCount}`} />
        <Stat name="Remaining" value={show.remaining} />
        <Stat name="Held" value={show.heldCount} />
        <Stat name="Open checks" value={show.checks.length} />
      </div>
      <div className="flex flex-wrap gap-2">
        {!can.shows ? null : show.status === 'on_sale' || show.status === 'sold_out' ? <ActionButton op="publishShow" vars={{ showId: show.id, nextStatus: 'doors_open' }}>Open doors</ActionButton> : null}
        {can.shows && show.status === 'doors_open' ? <ActionButton op="publishShow" vars={{ showId: show.id, nextStatus: 'in_progress' }}>Start show</ActionButton> : null}
        {can.shows && show.status === 'in_progress' ? <ActionButton op="publishShow" vars={{ showId: show.id, nextStatus: 'completed' }}>End show</ActionButton> : null}
      </div>

      {can.door ? <>
      <Section title="Door"><DoorScanner showId={show.id} startsAt={show.startsAt} endsAt={show.endsAt} /></Section>

      <Section title="Guest list">
        <GuestSearch showId={show.id} q={term} />
        {term ? (found.length ? found.map((t: any) => <GuestTicketRow key={t.id} ticket={t} showId={show.id} orderNumber={t.order?.orderNumber || ''} orderName={t.order?.name || ''} />) : <Empty>No guest matches.</Empty>) : <Meta>Search to check in a guest without a code, or undo a mistaken check-in.</Meta>}
      </Section>

      </> : null}

      <Section title="Running order" aside={<Meta>{setTotal} min of sets</Meta>}>
        {show.lineup.length ? show.lineup.map((l: any) => (
          <Row key={l.id}>
            <span className="min-w-0"><span className="font-medium">{l.position}. {l.comedian?.stageName}</span> <Meta>{l.role.replace('_', ' ')} · {l.setMinutes} min</Meta></span>
            <Status value={l.status} />
          </Row>
        )) : <Empty>No lineup yet. Book comedians under Lineups & talent.</Empty>}
      </Section>

      {can.door ? <Section title="Seating">
        {!show.room ? <Empty>This show has no room yet.</Empty> : show.room.seatingMode === 'tables' ? <SeatingBoard showId={show.id} tables={tables} orders={show.orders} seated={show.assignments.map((x: any) => ({ id: x.id, partySize: x.partySize, name: x.ticketOrder?.name || 'Party', orderNumber: x.ticketOrder?.orderNumber || '', tableIds: x.tables.map((t: any) => t.id), tableLabels: x.tables.map((t: any) => t.label), openCheck: x.checks.length > 0 }))} /> : <Empty>General admission room: no table assignments.</Empty>}
      </Section> : null}

      <Section title="Open checks">
        {show.checks.length ? show.checks.map((c: any) => (
          <Row key={c.id}>
            <span className="min-w-0"><span className="font-medium">{(c.seatingAssignment?.tables || []).map((t: any) => t.label).join(', ') || 'Table'}</span> <Meta>{c.guestCount} guests · {c.minimumItemsMet ? 'minimum met' : 'minimum open'}</Meta></span>
            <span className="inline-flex items-center gap-3"><Status value={c.status} />{can.shows ? <Link className="inline-flex min-h-11 items-center text-sm underline underline-offset-4" href={`/dashboard/platform/shows/${show.id}?check=${c.id}`}>Open</Link> : null}</span>
          </Row>
        )) : <Empty>No open checks.</Empty>}
      </Section>
    </Page>
  );
}
