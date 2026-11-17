import Link from 'next/link';
import Image from 'next/image';
import { venueContent } from '@/features/storefront/lib/venue';
import { Initials } from '@/features/storefront/components/Initials';
import { card } from '@/features/storefront/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Comedians' };

export default async function ComediansPage() {
  const { comedians } = await venueContent();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Comedians</h1>
        <p className="mt-1 text-sm text-neutral-500">On the lineup for shows on sale now.</p>
      </div>
      <div className="relative h-44 overflow-hidden rounded-3xl bg-neutral-950 sm:h-64"><Image src="/storefront/curtain.webp" alt="A spotlight on the stage curtain" fill priority sizes="(min-width: 1024px) 800px, 100vw" className="object-cover" /></div>
      {!comedians.length ? <p className="text-sm text-neutral-500">No lineups are posted yet.</p> : null}
      {comedians.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {comedians.map((c) => (
            <li key={c.id} className={`${card} p-3`}>
              <Link href={`/shows/${c.nextShowId}`} className="block">
                {c.headshot ? <img src={c.headshot} alt="" loading="lazy" className="aspect-square w-full rounded-2xl bg-neutral-100 object-cover" /> : <Initials name={c.stageName} className="aspect-square w-full rounded-2xl text-4xl" />}
                <p className="mt-2 truncate text-sm font-semibold">{c.stageName}</p>
                <p className="truncate text-xs text-neutral-500">{[c.headliner ? 'Headliner' : '', c.homeCity].filter(Boolean).join(' · ')}</p>
                <p className="mt-2 text-xs font-medium text-neutral-900">Next show →</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
