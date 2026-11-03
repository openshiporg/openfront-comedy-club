import { q, venueTimezone } from '../../lib/server';
import { when } from '../../lib/format';
import { Page, Section, Row, Empty, Status, Meta } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';

export default async function OpenMicPage() {
  const tz = await venueTimezone();
  const now = new Date(Date.now() - 6 * 3600000).toISOString();
  const { shows } = await q<any>(`query($now: DateTime!) { shows(where: { isOpenMic: { equals: true }, startsAt: { gte: $now }, status: { not: { equals: cancelled } } }, orderBy: { startsAt: asc }, take: 6) { id title startsAt signupOpensAt signups(orderBy: [{ lotteryNumber: asc }, { createdAt: asc }]) { id name email lotteryNumber status method } } }`, { now });
  return (
    <Page title="Open mic">
      {shows.length ? shows.map((s: any) => (
        <Section key={s.id} title={`${s.title} · ${when(s.startsAt, tz, 'day')}`} aside={<ActionButton op="runOpenMicLottery" vars={{ showId: s.id }} confirm="Draw the order for everyone waiting?">Run lottery</ActionButton>}>
          <Meta>Signups open {when(s.signupOpensAt, tz, 'day')}</Meta>
          {s.signups.length ? s.signups.map((x: any) => (
            <Row key={x.id}><span className="min-w-0"><span className="font-mono text-xs">{x.lotteryNumber ? `#${x.lotteryNumber}` : '—'}</span> <span className="font-medium">{x.name}</span> <Meta>{x.method.replace('_', ' ')}</Meta></span><Status value={x.status} /></Row>
          )) : <Empty>No signups yet.</Empty>}
        </Section>
      )) : <Empty>No upcoming open mic shows.</Empty>}
    </Page>
  );
}
