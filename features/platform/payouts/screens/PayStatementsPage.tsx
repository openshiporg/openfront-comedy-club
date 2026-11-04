import Link from 'next/link';
import { q, venueTimezone } from '../../lib/server';
import { money, when, label } from '../../lib/format';
import { Page, Section, Row, Empty, Stat, Meta } from '../../components/ui';
import { ExportStatement } from '../components/ExportStatement';
import { Button } from '@/components/ui/button';
import { yearRange } from '@/features/keystone/lib/payStatement';

const num = 'shrink-0 whitespace-nowrap text-right font-mono text-xs tabular-nums';

export default async function PayStatementsPage({ searchParams }: { searchParams?: Promise<{ year?: string; comedian?: string }> }) {
  const tz = await venueTimezone();
  const sp = (await searchParams) || {};
  const thisYear = Number(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric' }).format(new Date()));
  const year = /^\d{4}$/.test(sp.year || '') ? Number(sp.year) : thisYear;
  const back = '/dashboard/platform/payouts';
  let error = '', statement: any = null, list: { id: string; name: string; cents: number; count: number }[] = [];
  if (sp.comedian) {
    try { statement = (await q<any>(`query($c: ID!, $y: Int!) { payStatement(comedianId: $c, year: $y) }`, { c: sp.comedian, y: year })).payStatement; }
    catch (e: any) { error = /year|Comedian/i.test(e.message) ? e.message : 'The statement could not be built.'; }
  } else {
    const { start, endExclusive } = yearRange(year, tz);
    const { comedianPayouts } = await q<any>(`query($a: DateTime!, $b: DateTime!) { comedianPayouts(where: { status: { equals: paid }, paidAt: { gte: $a, lt: $b } }, take: 2000) { amountCents comedian { id stageName } } }`, { a: start.toISOString(), b: endExclusive.toISOString() });
    const by = new Map<string, { id: string; name: string; cents: number; count: number }>();
    for (const p of comedianPayouts) { if (!p.comedian) continue; const e = by.get(p.comedian.id) || { id: p.comedian.id, name: p.comedian.stageName, cents: 0, count: 0 }; e.cents += p.amountCents || 0; e.count += 1; by.set(p.comedian.id, e); }
    list = [...by.values()].sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
  }
  return (
    <Page title="Pay statements" crumbs={[{ label: 'Payouts', href: back }]}>
      <form method="get" className="flex flex-wrap items-end gap-3">
        {sp.comedian ? <input type="hidden" name="comedian" value={sp.comedian} /> : null}
        <label className="text-sm">Year<input type="number" name="year" min={2000} max={thisYear + 1} defaultValue={year} className="mt-1 block h-10 w-28 rounded-md border bg-background px-3 text-sm" /></label>
        <Button type="submit" variant="outline">Show year</Button>
      </form>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      {statement ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Stat name={`Paid in ${statement.year}`} value={money(statement.paidCents)} />
            <Stat name="Not yet paid" value={`${money(statement.pendingCents)} · ${statement.pendingCount}`} />
          </div>
          <p className="text-xs text-muted-foreground">{statement.comedian.stageName}{statement.comedian.legalName ? ` (${statement.comedian.legalName})` : ''}. Counts payouts marked paid inside the calendar year in the venue timezone; draft and approved payouts are listed as not yet paid.{statement.comedian.payeeDetailsOnFile ? '' : ' No payee details are on file.'}</p>
          {statement.undated ? <p role="alert" className="text-xs text-red-600">{statement.undated} paid payout{statement.undated === 1 ? ' has' : 's have'} no paid date and {statement.undated === 1 ? 'is' : 'are'} not counted in any year.</p> : null}
          <ExportStatement comedianId={statement.comedian.id} year={statement.year} />
          <Section title="Payments">
            {statement.rows.length ? statement.rows.map((r: any) => (
              <Row key={r.id} className="flex-nowrap items-start gap-x-3">
                <span className="min-w-0 flex-1"><span className="block break-words font-medium">{r.label}</span><Meta>{when(r.paidAt, tz, 'day')} · {label(r.method)}{r.reference ? ` · ${r.reference}` : ''}</Meta></span>
                <span className="shrink-0 text-right"><span className={`block ${num}`}>{money(r.amountCents)}</span><span className="block font-mono text-xs tabular-nums text-muted-foreground">YTD {money(r.ytdCents)}</span></span>
              </Row>
            )) : <Empty>Nothing paid in {statement.year}.</Empty>}
          </Section>
          <Link href={`/dashboard/platform/payouts/statements?year=${statement.year}`} className="text-sm underline">All payees for {statement.year}</Link>
        </>
      ) : !sp.comedian ? (
        <Section title={`Paid in ${year}`}>
          {list.length ? list.map((e) => (
            <Row key={e.id} href={`/dashboard/platform/payouts/statements?comedian=${e.id}&year=${year}`} className="flex-nowrap items-start gap-x-3">
              <span className="min-w-0 flex-1"><span className="block break-words font-medium">{e.name}</span><Meta>{e.count} payment{e.count === 1 ? '' : 's'}</Meta></span>
              <span className={num}>{money(e.cents)}</span>
            </Row>
          )) : <Empty>Nothing paid in {year}.</Empty>}
        </Section>
      ) : null}
    </Page>
  );
}
