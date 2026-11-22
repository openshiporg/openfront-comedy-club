'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Item = readonly [href: string, label: string];

const isActive = (href: string, path: string) => !href.includes('#') && (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));

/**
 * Header nav. From `md` up: pills, the page you are on is the raised white pill.
 * Below `md`: a menu button that opens a dropdown under the header.
 */
export function TopNav({ items, mobileItems = items }: { items: readonly Item[]; mobileItems?: readonly Item[] }) {
  const path = usePathname() || '/';
  // Open only for the page it was opened on, so any navigation closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const setOpen = (v: boolean) => setOpenAt(v ? path : null);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpenAt(null); button.current?.focus(); } };
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpenAt(null); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open]);

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-1 whitespace-nowrap rounded-full bg-neutral-100 p-1 text-sm md:flex">
        {items.map(([href, label]) => {
          const on = isActive(href, path);
          return <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 ${on ? 'bg-white font-medium shadow-sm' : 'text-neutral-600'}`}>{label}</Link>;
        })}
      </nav>
      <div ref={wrap} className="md:hidden">
        <button
          ref={button}
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="storefront-mobile-menu"
          onClick={() => setOpen(!open)}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-900"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        {open && (
          <nav id="storefront-mobile-menu" aria-label="Main" className="absolute inset-x-4 top-full z-50 rounded-2xl border border-neutral-200 bg-white p-2 text-base shadow-lg">
            {mobileItems.map(([href, label]) => {
              const on = isActive(href, path);
              return <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={on ? 'page' : undefined} className={`flex min-h-12 items-center rounded-xl px-4 ${on ? 'bg-neutral-100 font-medium' : 'text-neutral-700'}`}>{label}</Link>;
            })}
          </nav>
        )}
      </div>
    </>
  );
}

export function SideNav({ items }: { items: readonly Item[] }) {
  const path = usePathname() || '/';
  return (
    <ul className="sticky top-6 space-y-1 text-sm">
      {items.map(([href, label]) => {
        const on = isActive(href, path);
        return <li key={href}><Link href={href} aria-current={on ? 'page' : undefined} className={`flex min-h-9 items-center rounded-full px-3 ${on ? 'bg-neutral-100 font-medium' : 'text-neutral-600 hover:bg-neutral-50'}`}>{label}</Link></li>;
      })}
    </ul>
  );
}
