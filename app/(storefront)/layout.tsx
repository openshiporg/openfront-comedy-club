import Link from 'next/link';
import { StoreLogoMark } from '@/features/storefront/components/StoreLogoMark';

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl px-4 py-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <Link href="/" className="flex min-h-11 items-center gap-2 text-lg font-semibold"><StoreLogoMark /></Link>
        <nav className="flex flex-wrap gap-x-4 text-sm">
          <Link href="/" className="inline-flex min-h-11 min-w-11 items-center justify-center underline underline-offset-4">Shows</Link>
          <Link href="/open-mic" className="inline-flex min-h-11 items-center underline underline-offset-4">Open mic</Link>
          <Link href="/lookup" className="inline-flex min-h-11 items-center underline underline-offset-4">Find my order</Link>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
