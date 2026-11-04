import Link from 'next/link';
import { q, venueTimezone } from '../../lib/server';
import { money, when } from '../../lib/format';
import { Page, Tabs, Section, Row, Empty, Stat, Status, Meta } from '../../components/ui';
import { CloseRun } from '../components/CloseRun';
import { PayoutActions } from '../components/PayoutActions';

const TABS = ['draft', 'approved', 'paid', 'void'];
export default async function PayoutsPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  const tz = await venueTimezone();
  const tab = ((await searchParams) || {}).tab || 'draft';
  const [{ comedianPayouts }, { showSettlements }, { runs }] = await Promise.all([
    q<any>(`query($s: ComedianPayoutStatusType!) { comedianPayouts(where: { status: { equals: $s } }, orderBy: { createdAt: desc }, take: 60) { id status amountCents method reference comedian { stageName } show { title startsAt } run { notes startAt } } }`, { s: tab }),
    q<any>(`{ showSettlements(orderBy: { createdAt: desc }, take: 20) { id status netCents ticketGrossCents feesCents refundsCents foodBeverageGrossCents minimumShortfallRevenueCents tipsCents talentCostCents show { title startsAt } } }`),
    q<any>(`{ runs(orderBy: { startAt: desc }, take: 10) { id status runFeeCents startAt notes headliner { stageName } shows { status } } }`),
  ]);
  return (
    <Page title="Payouts">
      <p className="text-sm"><Link href="/dashboard/platform/payouts/statements" className="underline">Pay statements by year</Link></p>
      <Tabs active={tab} items={TABS.map((t) => ({ key: t, label: t, href: `/dashboard/platform/payouts?tab=${t}` }))} />
      <div>
        {comedianPayouts.length ? comedianPayouts.map((p: any) => (
          <Row key={p.id} className="flex-nowrap items-start gap-x-3">
            <div className="min-w-0 flex-1 space-y-2">
  <span className="block min-w-0"><span className="font-medium">{p.comedian?.stageName}</span> <Meta>{p.show ? `${p.show.title} · ${when(p.show.startsAt, tz, 'day')}` : p.run ? `Run fee · ${p.run.notes || ''} · ${when(p.run.startAt, tz, 'day')}` : 'Manual payout'} · {p.method}{p.reference ? ` ${p.reference}` : ''}</Meta></span>
              <PayoutActions id={p.id} status={p.status} />
            </div>
            <span className="shrink-0 whitespace-nowrap text-right font-mono text-xs tabular-nums">{money(p.amountCents)}</span>
          </Row>
        )) : <Empty>No payouts here.</Empty>}
      </div>
      <Section title="Headliner runs">
        {runs.length ? runs.map((r: any) => {
          const open = r.shows.filter((x: any) => !['settled', 'cancelled'].includes(x.status)).length;
          return (
            <Row key={r.id}>
              <span className="min-w-0"><span className="font-medium">{r.headliner?.stageName}</span> <Meta>{r.notes} · {when(r.startAt, tz, 'day')} · {money(r.runFeeCents)} run fee · {r.shows.length} shows{open ? ` · ${open} to settle` : ''}</Meta></span>
              <span className="inline-flex items-center gap-3"><Status value={r.status} />{r.status !== 'closed' && !open ? <CloseRun runId={r.id} /> : null}</span>
            </Row>
          );
        }) : <Empty>No runs.</Empty>}
      </Section>
      <Section title="Nightly settlements">
        {showSettlements.length ? showSettlements.map((s: any) => (
          <div key={s.id} className="space-y-3 border-b py-4 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{s.show?.title} <Meta>{when(s.show?.startsAt, tz, 'day')}</Meta></span><Status value={s.status} /></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat name="Tickets" value={money(s.ticketGrossCents)} /><Stat name="Food and drink" value={money(s.foodBeverageGrossCents)} /><Stat name="Talent" value={money(s.talentCostCents)} /><Stat name="Net" value={money(s.netCents)} />
            </div>
          </div>
        )) : <Empty>No settlements yet.</Empty>}
      </Section>
    </Page>
  );
}
