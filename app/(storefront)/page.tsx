import Link from 'next/link';
import { gqlCall, SHOWS_ON_SALE } from '@/features/storefront/lib/data';
import { showTime, ageLabel, price } from '@/features/storefront/lib/format';
import { saleState } from '@/features/keystone/lib/saleWindow';
import { ShowFinder } from '@/features/storefront/components/ShowFinder';
import { btnPrimary, btnSoft, card, sectionTitle } from '@/features/storefront/components/ui';

export const dynamic = 'force-dynamic';

const short = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso));

function fromLabel(s: any) {
  const open = s.tiers.filter((t: any) => saleState(t) === 'open' && t.sold + t.held < t.capacity);
  const soon = s.tiers.filter((t: any) => saleState(t) === 'scheduled');
  const from = open.length ? Math.min(...open.map((t: any) => t.priceCents)) : null;
  return from === null ? (soon.length ? 'On sale soon' : 'Sold out') : `From ${price(from)}`;
}

export default async function Home() {
  const r = await gqlCall<{ showsOnSale: any[] }>(SHOWS_ON_SALE);
  const shows = r.ok ? r.data.showsOnSale : [];
  const feat = shows[0];
  const rest = shows.slice(1);
  const days = Array.from(new Set(shows.map((s) => dayOf(s.startsAt))));
  const today = dayOf(new Date().toISOString());
  const tonight = shows.filter((s) => dayOf(s.startsAt) === today);
  const finder = shows.map((s) => ({ id: s.id, title: s.title, when: short(s.startsAt), day: dayOf(s.startsAt), age: ageLabel(s.ageRestriction), room: s.room?.name || '', from: fromLabel(s), kind: /open mic/i.test(s.title) ? 'openmic' : 'standup' }));
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="min-w-0 space-y-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Comedy lives here.</h1>
          <p className="mt-1 text-sm text-neutral-500">Stand-up and live comedy every week. Pick a show and get tickets.</p>
        </div>
        {!r.ok ? <p role="alert" className="text-sm text-red-600">{r.error}</p> : null}
        {r.ok && !shows.length ? <p className="text-sm text-neutral-500">No shows on sale.</p> : null}
        {feat ? (
          <section className={`${card} overflow-hidden`}>
            <div className="relative flex h-56 items-end justify-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_30%,#7a1d1d_0%,#3a0d0d_55%,#150606_100%)] sm:h-72">
              <div className="absolute inset-x-0 top-0 h-full bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.18)_0_2px,transparent_2px_22px)]" />
              <p className="absolute inset-x-0 top-1/3 -translate-y-1/2 text-center text-3xl font-semibold italic text-[#ff6b4a] [text-shadow:0_0_18px_#ff3b1f,0_0_40px_#ff3b1f] sm:text-5xl">{feat.room?.name ? 'Live tonight' : 'Live comedy'}</p>
              <div className="h-16 w-full bg-gradient-to-t from-black to-transparent" />
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4 p-5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Featured show</p>
                <h2 className="text-xl font-semibold tracking-tight">{feat.title}</h2>
                <p className="text-sm text-neutral-500">{showTime(feat.startsAt)} · {feat.room?.name} · {ageLabel(feat.ageRestriction)}</p>
              </div>
              <div className="flex gap-2"><Link href={`/shows/${feat.id}`} className={btnPrimary}>Get tickets →</Link><Link href="/#shows" className={btnSoft}>All shows</Link></div>
            </div>
          </section>
        ) : null}
        {rest.length ? (
          <section id="shows" className="scroll-mt-6">
            <h2 className={sectionTitle}>Upcoming shows</h2>
            <ul className={`${card} divide-y divide-neutral-100 px-4`}>
              {rest.map((s: any) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0"><p className="font-semibold">{s.title}</p><p className="text-sm text-neutral-500">{showTime(s.startsAt)} · {s.room?.name} · {ageLabel(s.ageRestriction)}</p></div>
                  <Link href={`/shows/${s.id}`} className={btnSoft}>{fromLabel(s)} · Get tickets</Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {shows.length ? <ShowFinder shows={finder} days={days} /> : null}
        {shows.length ? (
          <section>
            <h2 className={sectionTitle}>This month</h2>
            <div className={`${card} grid grid-cols-3 divide-x divide-neutral-100 py-5 text-center`}>
              <div><p className="text-2xl font-semibold">{shows.length}</p><p className="text-xs text-neutral-500">Shows on sale</p></div>
              <div><p className="text-2xl font-semibold">{tonight.length}</p><p className="text-xs text-neutral-500">Tonight</p></div>
              <div><p className="text-2xl font-semibold">{finder.filter((f) => f.kind === 'openmic').length}</p><p className="text-xs text-neutral-500">Open mics</p></div>
            </div>
          </section>
        ) : null}
        <section className="rounded-3xl bg-neutral-950 p-6 text-white">
          <h2 className="text-xl font-semibold">Want the mic?</h2>
          <p className="mt-1 text-sm text-neutral-300">Sign up for an open mic slot.</p>
          <Link href="/open-mic" className={`${btnPrimary} mt-4`}>Open mic →</Link>
        </section>
      </div>
      <aside className="hidden space-y-4 xl:block">
        <div className="text-sm">
          <p className="mb-3 flex items-center gap-2 font-semibold">{tonight.length ? 'Open tonight' : 'Next show'} <span className="size-2 rounded-full bg-green-500" /></p>
          {(tonight[0] || feat) ? <p className="text-neutral-600">{(tonight[0] || feat).title}<br />{showTime((tonight[0] || feat).startsAt, 'time')} · {(tonight[0] || feat).room?.name}</p> : null}
        </div>
        {feat ? <Link href={`/shows/${(tonight[0] || feat).id}`} className={`${btnSoft} w-full justify-between`}>Get tickets <span>→</span></Link> : null}
        <div className="border-t pt-4 text-sm">
          <p className="mb-2 font-semibold">This week</p>
          <ul className="space-y-2">{shows.slice(0, 4).map((s) => <li key={s.id} className="flex gap-3"><span className="w-14 shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-center text-xs">{dayOf(s.startsAt).split(' ')[0]}</span><span className="min-w-0 truncate">{s.title}</span></li>)}</ul>
        </div>
      </aside>
    </div>
  );
}
