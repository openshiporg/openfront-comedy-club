import Image from 'next/image';
import { venueContent } from '@/features/storefront/lib/venue';
import { price } from '@/features/storefront/lib/format';
import { card, sectionTitle } from '@/features/storefront/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Food & drinks' };

const GROUPS = [['drink', 'Drinks'], ['food', 'Food'], ['na', 'Non-alcoholic']] as const;

export default async function MenuPage() {
  const { menu, venue } = await venueContent();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Food & drinks</h1>
        <p className="mt-1 text-sm text-neutral-500">Served at your table during the show{venue?.drinkMinimumItems ? `. ${venue.drinkMinimumItems}-item minimum per guest` : ''}.</p>
      </div>
      <div className="relative h-44 overflow-hidden rounded-3xl bg-neutral-950 sm:h-64"><Image src="/storefront/bar.webp" alt="The bar, with the stage behind it" fill priority sizes="(min-width: 1024px) 800px, 100vw" className="object-cover" /></div>
      {!menu.length ? <p className="text-sm text-neutral-500">The menu is not posted yet.</p> : null}
      {GROUPS.map(([key, label]) => {
        const items = menu.filter((m) => m.category === key);
        return items.length ? (
          <section key={key}>
            <h2 className={sectionTitle}>{label}</h2>
            <ul className={`${card} divide-y divide-neutral-100 px-4`}>
              {items.map((m) => <li key={m.id} className="flex min-h-12 items-center justify-between gap-3 py-3 text-sm"><span className="font-medium">{m.name}</span><span className="tabular-nums text-neutral-600">{price(m.priceCents)}</span></li>)}
            </ul>
          </section>
        ) : null;
      })}
    </div>
  );
}
