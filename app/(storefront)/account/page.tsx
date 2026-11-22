import Link from 'next/link';
import { myTickets, signOutBuyer } from '@/features/storefront/lib/account';
import { SignInForm } from '@/features/storefront/components/AccountForms';
import { venueTimeZone } from '@/features/storefront/lib/venue';
import { price, showTime } from '@/features/storefront/lib/format';
import { btnOutline, btnSoft, card } from '@/features/storefront/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My tickets' };

const STATUS: Record<string, string> = { paid: 'Paid', partially_refunded: 'Partly refunded', refunded: 'Refunded', cancelled: 'Cancelled', comp: 'Guest list' };
const TICKET: Record<string, string> = { valid: 'Valid', checked_in: 'Checked in', void: 'Void', refunded: 'Refunded', transferred: 'Passed on' };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const me = await myTickets();
  if (!me) {
    return (
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-neutral-600">See every ticket you have bought while signed in. You can still buy without an account.</p>
        <SignInForm next={next} />
        <p className="text-sm text-neutral-600">Bought as a guest? <Link href="/lookup" className="inline-flex min-h-11 items-center underline underline-offset-4">Find my order</Link> with your email and order number.</p>
      </div>
    );
  }
  const tz = await venueTimeZone();
  const upcoming = me.orders.filter((o) => o.upcoming).reverse(); // soonest first
  const past = me.orders.filter((o) => !o.upcoming).slice(0, 20);
  const list = (orders: typeof me.orders) => orders.map((o) => (
    <li key={o.orderNumber} className={`${card} space-y-3 p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link href={`/shows/${o.show.id}`} className="inline-flex min-h-11 items-center text-base font-semibold underline-offset-4 hover:underline">{o.show.title}</Link>
        <span className="font-mono text-xs uppercase tracking-wide text-neutral-600">{STATUS[o.status] || o.status}</span>
      </div>
      <p className="text-sm text-neutral-700">
        {showTime(o.show.startsAt, 'date', tz)} · {o.show.doorsAt ? `Doors ${showTime(o.show.doorsAt, 'time', tz)} · ` : ''}Show {showTime(o.show.startsAt, 'time', tz)}{o.show.room ? ` · ${o.show.room.name}` : ''}
      </p>
      <ul className="divide-y divide-neutral-100">
        {o.tickets.map((t) => (
          <li key={t.ticketCode} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 py-1">
            {t.token ? <Link href={`/tickets/${t.ticketCode}#${t.token}`} className="inline-flex min-h-11 items-center font-mono text-sm underline underline-offset-4">{t.ticketCode}</Link> : <span className="font-mono text-sm text-neutral-500">{t.ticketCode}</span>}
            <span className="font-mono text-xs uppercase tracking-wide text-neutral-600">{TICKET[t.status] || t.status}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-neutral-500">Order <span className="font-mono">{o.orderNumber}</span> · {price(o.totalCents)}</p>
    </li>
  ));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My tickets</h1>
          <p className="text-sm text-neutral-600">Signed in as {me.email}</p>
        </div>
        <form action={signOutBuyer}><button className={btnOutline}>Sign out</button></form>
      </div>
      {upcoming.length ? <ul className="space-y-3">{list(upcoming)}</ul> : (
        <div className={`${card} space-y-3 p-4`}>
          <p className="text-sm">No upcoming tickets on this account.</p>
          <div className="flex flex-wrap gap-2"><Link href="/#shows" className={btnSoft}>See shows</Link><Link href="/lookup" className={btnOutline}>Find a guest order</Link></div>
        </div>
      )}
      {upcoming.length ? <p className="text-sm text-neutral-600">Bought without signing in? <Link href="/lookup" className="inline-flex min-h-11 items-center underline underline-offset-4">Find my order</Link> with your email and order number.</p> : null}
      {past.length ? <section className="space-y-3"><h2 className="text-base font-semibold">Past shows</h2><ul className="space-y-3">{list(past)}</ul></section> : null}
    </div>
  );
}
