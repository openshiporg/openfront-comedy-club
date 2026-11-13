'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { claimWaitlistOffer } from '../lib/actions';
import { showTime } from '../lib/format';

/** The emailed link carries the hold token in the fragment, so it never reaches a server log. */
export function WaitlistClaim({ holdKey }: { holdKey: string }) {
  const router = useRouter();
  const [state, setState] = React.useState<{ kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'offer'; o: any }>({ kind: 'loading' });
  React.useEffect(() => {
    const token = window.location.hash.slice(1);
    if (!token) { setState({ kind: 'error', message: 'This link is incomplete. Open it again from your email.' }); return; }
    claimWaitlistOffer(holdKey, token).then((r) => {
      if (!r.ok) { setState({ kind: 'error', message: 'This offer was not found.' }); return; }
      if (!r.data.live) { setState({ kind: 'error', message: 'This offer has expired and the seats were passed to the next party.' }); return; }
      sessionStorage.setItem(`hold:${holdKey}`, JSON.stringify({ cartToken: token, expiresAt: r.data.expiresAt, showId: r.data.showId, ageRestriction: r.data.ageRestriction }));
      setState({ kind: 'offer', o: r.data });
    });
  }, [holdKey]);
  if (state.kind === 'loading') return <p className="text-sm text-muted-foreground">Checking your offer.</p>;
  if (state.kind === 'error') return <p role="alert" className="text-sm">{state.message} <a className="underline" href="/">Browse shows</a>.</p>;
  const o = state.o;
  return (
    <div className="space-y-3">
      <p className="text-sm">{o.quantity} seat{o.quantity === 1 ? '' : 's'} held for <span className="font-medium">{o.title}</span>. Complete checkout by {showTime(o.expiresAt)}.</p>
      <button type="button" className="inline-flex h-11 items-center justify-center rounded-md border bg-foreground px-4 text-sm font-medium text-background" onClick={() => router.push(`/checkout?hold=${encodeURIComponent(holdKey)}`)}>Continue to checkout</button>
    </div>
  );
}
