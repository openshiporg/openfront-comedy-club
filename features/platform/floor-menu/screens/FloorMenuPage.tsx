import Link from 'next/link';
import { LayoutEditor } from '../components/LayoutEditor';
import { q } from '../../lib/server';
import { money } from '../../lib/format';
import { Page, Section, Row, Status, Meta } from '../../components/ui';

export default async function FloorMenuPage() {
  const [{ rooms }, { menuItems }] = await Promise.all([
    q<any>(`{ rooms(orderBy: { name: asc }) { id name capacity seatingMode active sections(orderBy: { sort: asc }) { id name tables(orderBy: { label: asc }) { id label seats x y shape } } } }`),
    q<any>(`{ menuItems(orderBy: [{ category: asc }, { name: asc }], take: 200) { id name category priceCents countsTowardMinimum active } }`),
  ]);
  return (
    <Page title="Floor & menu">
      {rooms.map((r: any) => (
        <Section key={r.id} title={`${r.name} · ${r.capacity} seats · ${r.seatingMode}`} aside={<Link className="text-sm underline underline-offset-4" href={`/dashboard/rooms/${r.id}`}>Edit</Link>}>
          {r.sections.map((s: any) => (
            <div key={s.id} className="mb-4">
              <div className="mb-2 font-mono text-xs uppercase tracking-wide">{s.name} <span className="text-muted-foreground">{s.tables.length} tables · {s.tables.reduce((n: number, t: any) => n + t.seats, 0)} seats</span></div>
              <div className="flex flex-wrap gap-2">
                {s.tables.map((t: any) => <Link key={t.id} href={`/dashboard/tables/${t.id}`} className={`flex size-12 flex-col items-center justify-center border text-xs ${t.shape === 'round' ? 'rounded-full' : 'rounded-md'}`}><span className="font-mono font-semibold">{t.label}</span><span className="text-muted-foreground">{t.seats}</span></Link>)}
              </div>
            </div>
          ))}
          {r.seatingMode === 'tables' ? (
            <details className="mt-2 border-t pt-3">
              <summary className="cursor-pointer text-sm underline underline-offset-4">Edit layout</summary>
              <div className="mt-3"><LayoutEditor roomId={r.id} sections={r.sections.map((s: any) => ({ id: s.id, name: s.name, tables: s.tables.map((t: any) => ({ id: t.id, label: t.label, seats: t.seats, shape: t.shape || 'round' })) }))} /></div>
            </details>
          ) : null}
          {!r.sections.length && r.seatingMode !== 'tables' ? <Meta>General admission, no tables.</Meta> : null}
        </Section>
      ))}
      <Section title="Menu" aside={<Link className="text-sm underline underline-offset-4" href="/dashboard/menu-items/create">Add item</Link>}>
        {menuItems.map((m: any) => (
          <Row key={m.id} href={`/dashboard/menu-items/${m.id}`}>
            <span className="min-w-0"><span className="font-medium">{m.name}</span> <Meta>{m.category}{m.countsTowardMinimum ? ' · counts toward minimum' : ''}</Meta></span>
            <span className="inline-flex gap-3"><span className="font-mono text-xs">{money(m.priceCents)}</span><Status value={m.active ? 'active' : 'paused'} /></span>
          </Row>
        ))}
      </Section>
    </Page>
  );
}
