import Link from 'next/link';

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl px-4 py-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <Link href="/" className="text-lg font-semibold">Shows</Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          <Link href="/open-mic" className="underline underline-offset-4">Open mic</Link>
          <Link href="/lookup" className="underline underline-offset-4">Find my order</Link>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
