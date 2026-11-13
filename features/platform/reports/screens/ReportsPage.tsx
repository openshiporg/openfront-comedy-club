import { q, venueTimezone } from '../../lib/server';
import { money, when } from '../../lib/format';
import { Page, Section, Row, Empty, Stat, Meta } from '../../components/ui';
import { ExportReport } from '../components/ExportReport';
import { Button } from '@/components/ui/button';

const ymd = (d: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const num = 'shrink-0 whitespace-nowrap text-right font-mono text-xs tabular-nums';

export default async function ReportsPage({ searchParams }: { searchParams?: Promise<{ from?: string; to?: string }> }) {
  const tz = await venueTimezone();
  const sp = (await searchParams) || {};
  const to = sp.to || ymd(new Date(), tz), from = sp.from || ymd(new Date(Date.now() - 29 * 864e5), tz);
  let report: any = null, error = '';
  try { report = (await q<any>(`query($from: String!, $to: String!) { showReport(from: $from, to: $to) }`, { from, to })).showReport; }
  catch (e: any) { error = /Dates|date|period|before|Invalid/.test(e.message) ? e.message : 'The report could not run. Check the dates.'; }
  const { authenticatedItem: me } = await q<{ authenticatedItem?: { role?: { canManageShows?: boolean } } }>(`{ authenticatedItem { ... on User { role { canManageShows } } } }`);
  const showLinks = !!me?.role?.canManageShows;
  const t = report?.totals;
  return (
    <Page title="Reports">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-sm">From<input type="date" name="from" defaultValue={from} className="mt-1 block h-10 rounded-md border bg-background px-3 text-sm" /></label>
        <label className="text-sm">To<input type="date" name="to" defaultValue={to} className="mt-1 block h-10 rounded-md border bg-background px-3 text-sm" /></label>
        <Button type="submit" variant="outline">Run report</Button>
      </form>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      {report && t ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat name="Shows" value={`${t.shows} · ${t.settledShows} settled`} />
            <Stat name="Tickets" value={`${t.sold} sold · ${t.comp} comp`} />
            <Stat name="Checked in" value={`${t.checkedIn} · ${t.noShow} no-show`} />
            <Stat name="Net" value={money(t.netCents)} />
            <Stat name="Ticket revenue" value={money(t.ticketCents)} />
            <Stat name="Food & drink" value={money(t.fbCents)} />
            <Stat name="Talent cost" value={money(t.talentCents)} />
            <Stat name="Run fees" value={money(t.runFeeCents)} />
          </div>
          <p className="text-xs text-muted-foreground">Revenue, talent cost and net count settled nights only; attendance counts every show. Talent cost is the per-night pay. A headliner run fee is paid once for the whole run, never inside a night, so it is its own line, subtracted in the period holding the run's last show. Net = tickets + food &amp; drink − talent cost − run fees.</p>
          <ExportReport from={from} to={to} />
          {report.runs.length ? (
            <Section title="Headliner runs">
              {report.runs.map((r: any) => (
                <Row key={r.id} className="flex-nowrap items-start gap-x-3">
                  <span className="min-w-0 flex-1"><span className="font-medium">{r.headliner}</span> <Meta>{r.settled} of {r.shows} nights settled · nights {money(r.nightsNetCents)} · {r.runFeeCents ? `run fee ${money(r.runFeeCents)}` : r.feeInLaterPeriod ? 'run fee counted in a later period' : 'no run fee'}</Meta></span>
                  <span className={num}>{money(r.netCents)}</span>
                </Row>
              ))}
            </Section>
          ) : null}
          <Section title="Shows">
            {report.shows.length ? report.shows.map((s: any) => (
              <Row key={s.id} href={showLinks ? `/dashboard/platform/shows/${s.id}` : undefined} className="flex-nowrap items-start gap-x-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.title}</span>
                  <Meta>{when(s.startsAt, tz, 'day')} · {s.sold} sold{s.comp ? ` · ${s.comp} comp` : ''} · {s.checkedIn} in{s.noShow !== null ? ` · ${s.noShow} no-show` : ''}</Meta>
                  {s.settled ? <span className="mt-0.5 block text-xs text-muted-foreground">Tickets {money(s.ticketCents)} · F&amp;B {money(s.fbCents)} · talent {money(s.talentCents)}</span> : <span className="mt-0.5 block font-mono text-xs uppercase tracking-wide text-muted-foreground">Not settled</span>}
                </span>
                <span className={num}>{s.settled ? money(s.netCents) : ''}</span>
              </Row>
            )) : <Empty>No shows in this period.</Empty>}
          </Section>
        </>
      ) : null}
    </Page>
  );
}
