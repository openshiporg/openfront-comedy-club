import Link from 'next/link';
import { gqlCall, SHOWS_ON_SALE } from '@/features/storefront/lib/data';
import { showTime, ageLabel, price } from '@/features/storefront/lib/format';
import { saleState } from '@/features/keystone/lib/saleWindow';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const r = await gqlCall<{ showsOnSale: any[] }>(SHOWS_ON_SALE);
  const shows = r.ok ? r.data.showsOnSale : [];
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Upcoming shows</h1>
      {!r.ok ? <p role="alert" className="text-sm text-red-600">{r.error}</p> : null}
      {r.ok && !shows.length ? <p className="text-sm text-muted-foreground">No shows on sale.</p> : null}
      <ul>
        {shows.map((s: any) => {
          const open = s.tiers.filter((t: any) => saleState(t) === 'open' && t.sold + t.held < t.capacity);
          const soon = s.tiers.filter((t: any) => saleState(t) === 'scheduled');
          const from = open.length ? Math.min(...open.map((t: any) => t.priceCents)) : null;
          return (
            <li key={s.id} className="border-b py-4 last:border-b-0">
              <Link href={`/shows/${s.id}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="min-w-0">
                  <span className="block font-medium">{s.title}</span>
                  <span className="block text-sm text-muted-foreground">{showTime(s.startsAt)} · {s.room?.name} · {ageLabel(s.ageRestriction)}</span>
                </span>
                <span className="font-mono text-xs uppercase tracking-wide">{from === null ? (soon.length ? 'On sale soon' : 'Sold out') : `From ${price(from)}`}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
