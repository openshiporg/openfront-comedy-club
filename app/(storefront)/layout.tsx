import Link from 'next/link';
import { StoreLogoMark } from '@/features/storefront/components/StoreLogoMark';
import { TopNav, SideNav } from '@/features/storefront/components/NavLinks';

const top = [['/', 'Home'], ['/#shows', 'Shows'], ['/comedians', 'Comedians'], ['/menu', 'Menu'], ['/open-mic', 'Open mic'], ['/lookup', 'Find my order']] as const;
const side = [['/', 'Home'], ['/#shows', 'Shows'], ['/comedians', 'Comedians'], ['/menu', 'Food & drinks'], ['/open-mic', 'Open mic'], ['/#visit', 'Plan your visit'], ['/lookup', 'Find my order']] as const;

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-neutral-950">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
        <Link href="/" className="flex min-h-11 min-w-0 shrink-0 items-center gap-2 text-base font-semibold tracking-tight"><StoreLogoMark /></Link>
        <TopNav items={top} />
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <aside className="hidden lg:block"><SideNav items={side} /></aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
