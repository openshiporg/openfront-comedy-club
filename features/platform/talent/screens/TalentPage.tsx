import { q, venueTimezone } from '../../lib/server';
import { money, when } from '../../lib/format';
import { Page, Section, Row, Empty, Status, Meta } from '../../components/ui';
import { OfferForm } from '../components/OfferForm';
import { ActionButton } from '../../components/ActionButton';

export default async function TalentPage() {
  const tz = await venueTimezone();
  const now = new Date().toISOString();
  const [{ comedians }, { shows }] = await Promise.all([
    q<any>(`{ comedians(orderBy: { stageName: asc }, take: 200) { id stageName homeCity defaultFeeCents status payeeDetailsOnFile } }`),
    q<any>(`query($now: DateTime!) { shows(where: { startsAt: { gte: $now }, status: { notIn: [cancelled, settled] } }, orderBy: { startsAt: asc }, take: 30) { id title startsAt lineup { id role status comedian { id } } } }`, { now }),
  ]);
  const active = comedians.filter((c: any) => c.status !== 'inactive');
  const retired = comedians.filter((c: any) => c.status === 'inactive');
  const slotFor = (showId: string, comedianId: string) => shows.find((s: any) => s.id === showId)?.lineup.find((l: any) => l.comedian?.id === comedianId);
  return (
    <Page title="Lineups & talent">
      <Section title="Offer a slot"><OfferForm comedians={active.map((c: any) => ({ id: c.id, name: c.stageName, fee: c.defaultFeeCents }))} shows={shows.map((s: any) => ({ id: s.id, name: `${s.title} · ${when(s.startsAt, tz, 'day')}` }))} /></Section>
      <Section title="Booking grid">
        {shows.length ? (
          <div className="max-w-full overflow-x-auto rounded-lg border">
            <table className="w-full min-w-max text-left text-xs">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="sticky left-0 bg-muted/40 px-3 py-2 font-mono font-normal uppercase tracking-wide">Comedian</th>
                  {shows.map((s: any) => <th key={s.id} className="px-3 py-2 font-mono font-normal uppercase tracking-wide"><div>{when(s.startsAt, tz, 'day')}</div><div className="text-muted-foreground normal-case">{s.title}</div></th>)}
                </tr>
              </thead>
              <tbody>
                {active.map((c: any) => (
                  <tr key={c.id} className="border-b last:border-b-0">
                    <td className="sticky left-0 bg-background px-3 py-2 text-sm font-medium">{c.stageName}</td>
                    {shows.map((s: any) => { const l = slotFor(s.id, c.id); return <td key={s.id} className="px-3 py-2">{l ? <Status value={l.status} /> : <span className="text-muted-foreground">·</span>}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No upcoming shows.</Empty>}
      </Section>
      <Section title="Comedians">
        {active.map((c: any) => (
          <Row key={c.id}>
            <span className="min-w-0"><span className="font-medium">{c.stageName}</span> <Meta>{c.homeCity}</Meta></span>
            <span className="inline-flex flex-wrap items-center justify-end gap-3"><Meta>{money(c.defaultFeeCents)} default · payee {c.payeeDetailsOnFile ? 'on file' : 'missing'}</Meta><Status value={c.status} /><ActionButton op="setComedianStatus" vars={{ comedianId: c.id, status: 'inactive' }} confirm={`Retire ${c.stageName}? They leave booking pickers; past shows and pay stay.`}>Retire</ActionButton></span>
          </Row>
        ))}
      </Section>
      {retired.length ? (
        <Section title="Retired">
          {retired.map((c: any) => (
            <Row key={c.id}>
              <span className="min-w-0"><span className="font-medium">{c.stageName}</span> <Meta>{c.homeCity}</Meta></span>
              <span className="inline-flex flex-wrap items-center justify-end gap-3"><Status value={c.status} /><ActionButton op="setComedianStatus" vars={{ comedianId: c.id, status: 'active' }}>Reactivate</ActionButton></span>
            </Row>
          ))}
        </Section>
      ) : null}
    </Page>
  );
}
