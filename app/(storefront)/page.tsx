import Link from 'next/link';
import Image from 'next/image';
import { gqlCall, SHOWS_ON_SALE } from '@/features/storefront/lib/data';
import { showTime, ageLabel, price } from '@/features/storefront/lib/format';
import { saleState } from '@/features/keystone/lib/saleWindow';
import { venueContent } from '@/features/storefront/lib/venue';
import { Initials } from '@/features/storefront/components/Initials';
import { ShowFinder } from '@/features/storefront/components/ShowFinder';
import { btnPrimary, btnSoft, card, sectionTitle } from '@/features/storefront/components/ui';

export const dynamic = 'force-dynamic';

const short = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso));

type Tier = { priceCents: number; capacity: number; sold: number; held: number; status?: string; salesStartAt?: string | null; salesEndAt?: string | null };
type SaleShow = { id: string; title: string; startsAt: string; doorsAt: string | null; ageRestriction: string; room: { name: string } | null; tiers: Tier[] };

function fromLabel(s: SaleShow) {
  const open = s.tiers.filter((t) => saleState(t) === 'open' && t.sold + t.held < t.capacity);
  const soon = s.tiers.filter((t) => saleState(t) === 'scheduled');
  const from = open.length ? Math.min(...open.map((t) => t.priceCents)) : null;
  return from === null ? (soon.length ? 'On sale soon' : 'Sold out') : `From ${price(from)}`;
}

export default async function Home() {
  const [r, content] = await Promise.all([gqlCall<{ showsOnSale: SaleShow[] }>(SHOWS_ON_SALE), venueContent()]);
  const { comedians, lineups, menu, venue } = content;
  const thumb = (s: SaleShow, i: number) => (/open mic/i.test(s.title) ? '/storefront/mic.webp' : ['/storefront/tables.webp', '/storefront/curtain.webp'][i % 2]);
  const drinks = menu.filter((m) => m.category !== 'food');
  const food = menu.filter((m) => m.category === 'food');
  const shows = r.ok ? r.data.showsOnSale : [];
  const feat = shows[0];
  const rest = shows.slice(1, 5);
  const days = Array.from(new Set(shows.map((s) => dayOf(s.startsAt))));
  const today = dayOf(new Date().toISOString());
  const tonight = shows.filter((s) => dayOf(s.startsAt) === today);
  const finder = shows.map((s) => ({ id: s.id, title: s.title, when: short(s.startsAt), day: dayOf(s.startsAt), age: ageLabel(s.ageRestriction), room: s.room?.name || '', from: fromLabel(s), kind: /open mic/i.test(s.title) ? 'openmic' : 'standup' }));
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="min-w-0 space-y-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Comedy lives here.</h1>
          <p className="mt-1 text-sm text-neutral-500">Stand-up and live comedy every week{venue?.name ? ` at ${venue.name}` : ''}. Pick a show and get tickets.</p>
        </div>
        {!r.ok ? <p role="alert" className="text-sm text-red-600">{r.error}</p> : null}
        {r.ok && !shows.length ? <p className="text-sm text-neutral-500">No shows on sale.</p> : null}
        {feat ? (
          <section className={`${card} overflow-hidden`}>
            <div className="relative h-56 overflow-hidden rounded-t-3xl bg-neutral-950 sm:h-80">
              <Image src="/storefront/hero.webp" alt="The stage: a brick wall, red curtains, a microphone and a stool" fill priority sizes="(min-width: 1024px) 640px, 100vw" className="object-cover" />
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4 p-5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Featured show</p>
                <h2 className="text-xl font-semibold tracking-tight">{feat.title}</h2>
                <p className="text-sm text-neutral-500">{showTime(feat.startsAt)} · {feat.room?.name} · {ageLabel(feat.ageRestriction)}</p>
                {lineups[feat.id]?.length ? <p className="mt-1 text-sm text-neutral-700">With {lineups[feat.id].join(', ')}</p> : null}
              </div>
              <div className="flex gap-2"><Link href={`/shows/${feat.id}`} className={btnPrimary}>Get tickets →</Link><Link href="/#shows" className={btnSoft}>All shows</Link></div>
            </div>
          </section>
        ) : null}
        {rest.length ? (
          <section id="shows" className="scroll-mt-6">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold tracking-tight text-neutral-950">Upcoming shows</h2>{shows.length > 5 ? <Link href="/#find" className="inline-flex min-h-11 items-center text-xs text-neutral-600 hover:text-neutral-950">View all {shows.length} →</Link> : null}</div>
            <ul className={`${card} divide-y divide-neutral-100 px-4`}>
              {rest.map((s, i) => (
                <li key={s.id} className="flex flex-wrap items-center gap-4 py-4">
                  <span className="relative size-16 shrink-0 overflow-hidden rounded-2xl bg-neutral-100 sm:size-20"><Image src={thumb(s, i)} alt="" fill sizes="80px" className="object-cover" /></span>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="font-semibold">{s.title}</p>
                    {lineups[s.id]?.length ? <p className="truncate text-sm text-neutral-600">With {lineups[s.id].join(', ')}</p> : null}
                    <p className="text-sm text-neutral-500">{short(s.startsAt)} · {s.room?.name} · {ageLabel(s.ageRestriction)}</p>
                  </div>
                  <Link href={`/shows/${s.id}`} className={btnSoft}>{fromLabel(s)} · Get tickets</Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {shows.length ? <ShowFinder shows={finder} days={days} /> : null}
        {shows.length ? (
          <section>
            <h2 className={sectionTitle}>On sale now{venue?.name ? ` at ${venue.name}` : ''}</h2>
            <div className={`${card} grid grid-cols-3 divide-x divide-neutral-100 py-5 text-center`}>
              <div><p className="text-2xl font-semibold">{shows.length}</p><p className="text-xs text-neutral-500">Shows on sale</p></div>
              <div><p className="text-2xl font-semibold">{comedians.length}</p><p className="text-xs text-neutral-500">Comedians</p></div>
              <div><p className="text-2xl font-semibold">{finder.filter((f) => f.kind === 'openmic').length}</p><p className="text-xs text-neutral-500">Open mics</p></div>
            </div>
          </section>
        ) : null}
        {menu.length ? (
          <section>
            <h2 className={sectionTitle}>Food & drinks</h2>
            <div className={`${card} grid overflow-hidden sm:grid-cols-2`}>
              <div className="flex flex-col items-start justify-center gap-3 p-6">
                <h3 className="text-lg font-semibold tracking-tight">Make it a night out.</h3>
                <p className="text-sm text-neutral-600">{[drinks.length ? `${drinks.length} drinks` : '', food.length ? `${food.length} plates` : ''].filter(Boolean).join(' and ')} served at your table{venue?.drinkMinimumItems ? `. ${venue.drinkMinimumItems}-item minimum per guest` : ''}.</p>
                <p className="text-sm text-neutral-500">{[...drinks.slice(0, 2), ...food.slice(0, 2)].map((m) => m.name).join(' · ')}</p>
                <Link href="/menu" className={btnSoft}>View menu →</Link>
              </div>
              <div className="relative min-h-48 bg-neutral-950 sm:min-h-56"><Image src="/storefront/food.webp" alt="A margarita and a plate of nachos on a table by the stage" fill sizes="(min-width: 640px) 320px, 100vw" className="object-cover" /></div>
            </div>
          </section>
        ) : null}
        {comedians.length ? (
          <section>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold tracking-tight text-neutral-950">Meet the comedians</h2><Link href="/comedians" className="inline-flex min-h-11 items-center text-xs text-neutral-600 hover:text-neutral-950">View all →</Link></div>
            <ul className={`${card} grid grid-cols-2 gap-3 p-3 sm:grid-cols-4`}>
              {comedians.slice(0, 4).map((c) => (
                <li key={c.id}>
                  <Link href={`/shows/${c.nextShowId}`} className="block">
                    {c.headshot ? <img src={c.headshot} alt="" loading="lazy" className="aspect-square w-full rounded-2xl bg-neutral-100 object-cover" /> : <Initials name={c.stageName} className="aspect-square w-full rounded-2xl text-3xl" />}
                    <p className="mt-2 truncate text-center text-sm font-medium">{c.stageName}</p>
                    {c.homeCity ? <p className="truncate text-center text-xs text-neutral-500">{c.homeCity}</p> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {venue ? (
          <section id="visit" className="scroll-mt-6">
            <h2 className={sectionTitle}>Plan your visit</h2>
            <div className={`${card} overflow-hidden`}>
              <div className="relative h-40 bg-neutral-950 sm:h-52"><Image src="/storefront/tables.webp" alt="Candlelit tables facing the stage" fill sizes="(min-width: 1024px) 640px, 100vw" className="object-cover" /></div>
              <dl className="grid gap-4 p-5 text-sm sm:grid-cols-3">
                {venue.address ? <div><dt className="font-semibold">Location</dt><dd className="text-neutral-600">{venue.address}</dd></div> : null}
                <div><dt className="font-semibold">Age</dt><dd className="text-neutral-600">{ageLabel(venue.defaultAgeRestriction || 'all')} unless the show says otherwise</dd></div>
                {venue.policies ? <div><dt className="font-semibold">House rules</dt><dd className="text-neutral-600">{venue.policies}</dd></div> : null}
              </dl>
            </div>
          </section>
        ) : null}
        <section className="rounded-3xl bg-neutral-950 p-6 text-white">
          <h2 className="text-xl font-semibold">Want the mic?</h2>
          <p className="mt-1 text-sm text-neutral-300">Sign up for an open mic slot.</p>
          <Link href="/open-mic" className={`${btnPrimary} mt-4`}>Open mic →</Link>
        </section>
        {shows.length ? (
          <section className="relative overflow-hidden rounded-3xl bg-neutral-950 text-white">
            <Image src="/storefront/crowd.webp" alt="The crowd laughing at a show" fill sizes="(min-width: 1024px) 640px, 100vw" className="object-cover object-right" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-transparent" />
            <div className="relative p-6 sm:p-8">
              <h2 className="max-w-[12ch] text-2xl font-semibold tracking-tight">Ready for a good laugh?</h2>
              <p className="mt-1 text-sm text-neutral-200">See what&apos;s on next{venue?.name ? ` at ${venue.name}` : ''}.</p>
              <Link href="/#find" className={`${btnPrimary} mt-4`}>Browse shows →</Link>
            </div>
          </section>
        ) : null}
      </div>
      <aside className="hidden space-y-4 xl:block">
        <div className="text-sm">
          <p className="mb-3 flex items-center gap-2 font-semibold">{tonight.length ? 'Open tonight' : 'Next show'} <span className="size-2 rounded-full bg-green-500" /></p>
          {(tonight[0] || feat) ? <p className="text-neutral-600">{(tonight[0] || feat).title}<br />{(tonight[0] || feat).doorsAt ? <>Doors {showTime((tonight[0] || feat).doorsAt || '', 'time')}<br /></> : null}Show {showTime((tonight[0] || feat).startsAt, 'time')} · {(tonight[0] || feat).room?.name}{venue?.address ? <><br />{venue.address}</> : null}</p> : null}
        </div>
        {feat ? <Link href={`/shows/${(tonight[0] || feat).id}`} className={`${btnSoft} w-full justify-between`}>Get tickets <span>→</span></Link> : null}
        <div className="border-t pt-4 text-sm">
          <p className="mb-2 font-semibold">This week</p>
          <ul className="space-y-2">{shows.slice(0, 4).map((s) => <li key={s.id} className="flex gap-3"><span className="w-14 shrink-0 whitespace-nowrap rounded-full bg-neutral-100 px-2 py-0.5 text-center text-xs">{dayOf(s.startsAt).split(' ')[0].replace(',', '')}</span><span className="min-w-0 truncate">{s.title}</span></li>)}</ul>
        </div>
      </aside>
    </div>
  );
}
