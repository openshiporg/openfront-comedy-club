'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Item = readonly [href: string, label: string];

const isActive = (href: string, path: string) => !href.includes('#') && (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));

/** Header pills: the page you are on is the raised white pill. */
export function TopNav({ items }: { items: readonly Item[] }) {
  const path = usePathname() || '/';
  return (
    <nav className="flex w-full items-center gap-1 overflow-x-auto whitespace-nowrap rounded-full bg-neutral-100 p-1 text-sm sm:w-auto">
      {items.map(([href, label]) => {
        const on = isActive(href, path);
        return <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-full px-3 sm:px-4 ${on ? 'bg-white font-medium shadow-sm' : 'text-neutral-600'}`}>{label}</Link>;
      })}
    </nav>
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
