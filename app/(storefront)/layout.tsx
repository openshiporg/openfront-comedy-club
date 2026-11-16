import Link from 'next/link';
import { StoreLogoMark } from '@/features/storefront/components/StoreLogoMark';

const side = [['/', 'Home'], ['/#shows', 'Shows'], ['/open-mic', 'Open mic'], ['/lookup', 'Find my order']] as const;

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-neutral-950">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
        <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2 text-base font-semibold tracking-tight"><StoreLogoMark /></Link>
        <nav className="flex items-center gap-1 rounded-full bg-neutral-100 p-1 text-sm">
          <Link href="/" className="inline-flex min-h-11 items-center rounded-full bg-white px-4 font-medium shadow-sm">Home</Link>
          <Link href="/#shows" className="inline-flex min-h-11 items-center rounded-full px-3 text-neutral-600 sm:px-4">Shows</Link>
          <Link href="/open-mic" className="inline-flex min-h-11 items-center rounded-full px-3 text-neutral-600 sm:px-4">Open mic</Link>
          <Link href="/lookup" className="inline-flex min-h-11 items-center rounded-full px-3 text-neutral-600 sm:px-4">Find my order</Link>
        </nav>
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <ul className="sticky top-6 space-y-1 text-sm">
            {side.map(([h, l], i) => <li key={h}><Link href={h} className={`flex min-h-9 items-center rounded-full px-3 ${i === 0 ? 'bg-neutral-100 font-medium' : 'text-neutral-600 hover:bg-neutral-50'}`}>{l}</Link></li>)}
          </ul>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
