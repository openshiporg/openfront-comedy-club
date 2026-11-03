import { q, venueTimezone } from '../../lib/server';
import { money, when } from '../../lib/format';
import { Page, Tabs, Row, Empty, Status, Meta } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';

const TABS = [
  { key: 'upcoming', label: 'Upcoming' }, { key: 'draft', label: 'Draft' }, { key: 'sold_out', label: 'Sold out' },
  { key: 'past', label: 'Past' }, { key: 'cancelled', label: 'Cancelled' },
];

export default async function ShowsPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  const tz = await venueTimezone();
  const tab = ((await searchParams) || {}).tab || 'upcoming';
  const now = new Date().toISOString();
  const where: any = tab === 'draft' ? { status: { equals: 'draft' } }
    : tab === 'sold_out' ? { status: { equals: 'sold_out' } }
    : tab === 'cancelled' ? { status: { equals: 'cancelled' } }
    : tab === 'past' ? { status: { in: ['completed', 'settled'] } }
    : { startsAt: { gte: now }, status: { in: ['on_sale', 'sold_out', 'doors_open', 'in_progress'] } };
  const counts = await q<any>(`{ draft: showsCount(where: { status: { equals: draft } }) upcoming: showsCount(where: { startsAt: { gte: "${now}" }, status: { in: [on_sale, sold_out, doors_open, in_progress] } }) sold_out: showsCount(where: { status: { equals: sold_out } }) past: showsCount(where: { status: { in: [completed, settled] } }) cancelled: showsCount(where: { status: { equals: cancelled } }) }`);
  const { shows } = await q<any>(
    `query($where: ShowWhereInput!) { shows(where: $where, orderBy: { startsAt: ${tab === 'past' ? 'desc' : 'asc'} }, take: 60) { id title startsAt status ageRestriction capacity soldCount remaining room { name } lineup(where: { status: { in: [confirmed, performed] } }, orderBy: { position: asc }, take: 6) { comedian { stageName } } } }`,
    { where },
  );
  const { showTemplates } = await q<any>(`{ showTemplates(orderBy: { title: asc }) { id title recurrenceRule } }`);
  return (
    <Page title="Shows">
      <Tabs active={tab} items={TABS.map((t) => ({ ...t, href: `/dashboard/platform/shows?tab=${t.key}`, count: counts[t.key] }))} />
      {tab === 'draft' || tab === 'upcoming' ? (
        <div className="flex flex-wrap items-center gap-2">
          {showTemplates.map((t: any) => <ActionButton key={t.id} op="generateShowsFromTemplate" vars={{ templateId: t.id }} paths={['/dashboard/platform/shows']}>Generate {t.title}</ActionButton>)}
        </div>
      ) : null}
      <div>
        {shows.length ? shows.map((s: any) => (
          <Row key={s.id} href={`/dashboard/platform/shows/${s.id}`}>
            <span className="min-w-0">
              <span className="block font-medium">{s.title}</span>
              <Meta>{when(s.startsAt, tz)} · {s.room?.name} · {s.ageRestriction === 'all' ? 'All ages' : `${s.ageRestriction}+`}</Meta>
              <span className="mt-0.5 block"><Meta>{s.lineup.map((l: any) => l.comedian.stageName).join(', ') || 'No lineup'}</Meta></span>
            </span>
            <span className="flex flex-col items-end gap-1"><Status value={s.status} /><Meta>{s.soldCount} sold · {s.remaining} left</Meta></span>
          </Row>
        )) : <Empty>No shows here.</Empty>}
      </div>
    </Page>
  );
}
