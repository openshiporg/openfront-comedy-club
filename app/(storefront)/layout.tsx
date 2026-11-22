import Link from 'next/link';
import { StoreLogoMark } from '@/features/storefront/components/StoreLogoMark';
import { TopNav, SideNav } from '@/features/storefront/components/NavLinks';

const top = [['/', 'Home'], ['/#shows', 'Shows'], ['/comedians', 'Comedians'], ['/menu', 'Menu'], ['/open-mic', 'Open mic'], ['/lookup', 'Find my order']] as const;
const side = [['/', 'Home'], ['/#shows', 'Shows'], ['/comedians', 'Comedians'], ['/menu', 'Food & drinks'], ['/open-mic', 'Open mic'], ['/#visit', 'Plan your visit'], ['/lookup', 'Find my order']] as const;

// The storefront's one accent: the red of the club's neon sign. White text on it is 4.74:1, on the hover shade 5.89:1.
const brand = { '--brand-accent': '#dc2c27', '--brand-accent-hover': '#c2241f', '--brand-accent-soft': '#fdeceb' } as React.CSSProperties;

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-neutral-950" style={brand}>
      <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
        <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2 text-base font-semibold tracking-tight"><StoreLogoMark /></Link>
        <TopNav items={top} mobileItems={side} />
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <aside className="hidden lg:block"><SideNav items={side} /></aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
