import { q, venueTimezone } from '../../lib/server';
import { money, when } from '../../lib/format';
import { Page, Tabs, Section, Row, Empty, Stat, Status, Meta } from '../../components/ui';

const TABS = ['draft', 'approved', 'paid', 'void'];
export default async function PayoutsPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  const tz = await venueTimezone();
  const tab = ((await searchParams) || {}).tab || 'draft';
  const [{ comedianPayouts }, { showSettlements }] = await Promise.all([
    q<any>(`query($s: ComedianPayoutStatusType!) { comedianPayouts(where: { status: { equals: $s } }, orderBy: { createdAt: desc }, take: 60) { id amountCents method reference comedian { stageName } show { title startsAt } } }`, { s: tab }),
    q<any>(`{ showSettlements(orderBy: { createdAt: desc }, take: 20) { id status netCents ticketGrossCents feesCents refundsCents foodBeverageGrossCents minimumShortfallRevenueCents tipsCents talentCostCents show { title startsAt } } }`),
  ]);
  return (
    <Page title="Payouts">
      <Tabs active={tab} items={TABS.map((t) => ({ key: t, label: t, href: `/dashboard/platform/payouts?tab=${t}` }))} />
      <div>
        {comedianPayouts.length ? comedianPayouts.map((p: any) => (
          <Row key={p.id}>
            <span className="min-w-0"><span className="font-medium">{p.comedian?.stageName}</span> <Meta>{p.show?.title} · {when(p.show?.startsAt, tz, 'day')} · {p.method}{p.reference ? ` ${p.reference}` : ''}</Meta></span>
            <span className="font-mono text-xs">{money(p.amountCents)}</span>
          </Row>
        )) : <Empty>No payouts here.</Empty>}
      </div>
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
