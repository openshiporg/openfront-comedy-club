'use client';

import * as React from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { runCommand } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';
import { money } from '../../lib/format';

declare global { interface Window { Stripe?: any } }

/** Keyed card payment for one check: freezes the bill, takes the card in the Stripe Payment Element, settles from Stripe. */
export function CardTender({ checkId, tipCents, presented, onError }: { checkId: string; tipCents: number; presented: boolean; onError: (m: string) => void }) {
  const router = useRouter();
  const [pay, setPay] = React.useState<{ paymentId: string; amountCents: number; clientSecret: string; publishableKey: string } | null>(null);
  const [ready, setReady] = React.useState(typeof window !== 'undefined' && !!window.Stripe);
  const [pending, start] = React.useTransition();
  const mountRef = React.useRef<HTMLDivElement>(null);
  const stripe = React.useRef<any>(null);
  const elements = React.useRef<any>(null);
  const card = React.useRef<any>(null);

  React.useEffect(() => {
    if (!pay || !ready || !mountRef.current || elements.current) return;
    stripe.current = window.Stripe(pay.publishableKey);
    // keyed card only (card, expiry, CVC, ZIP): no wallets, bank or Link at the table
    elements.current = stripe.current.elements();
    card.current = elements.current.create('card', { hidePostalCode: false, disableLink: true, style: { base: { fontSize: '16px' } } });
    card.current.mount(mountRef.current);
  }, [pay, ready]);

  const begin = () => start(async () => {
    onError('');
    const r = await runCommand('startCheckCardPayment', { checkId, tipCents });
    if (!r.ok) return onError(r.error);
    if (!r.data?.clientSecret || !r.data?.publishableKey) return onError('Card payments are not set up');
    setPay(r.data); router.refresh();
  });
  const charge = () => start(async () => {
    onError('');
    const { error } = await stripe.current.confirmCardPayment(pay!.clientSecret, { payment_method: { card: card.current } });
    if (error && error.type === 'validation_error') return onError(error.message || 'Check the card details');
    const c = await runCommand('completeCheckCardPayment', { checkId, paymentId: pay!.paymentId });
    if (!c.ok) return onError(c.error);
    if (c.data?.status === 'paid') { setPay(null); elements.current = null; router.refresh(); return; }
    onError(error?.message || c.data?.message || 'Card not charged yet');
  });
  const cancel = () => start(async () => {
    onError('');
    const r = await runCommand('cancelCheckCardPayment', { checkId, paymentId: pay!.paymentId, reason: 'Cancelled at the table' });
    if (!r.ok) { onError(r.error); router.refresh(); return; }
    setPay(null); elements.current = null; router.refresh();
  });

  return (
    <>
      <Script src="https://js.stripe.com/v3/" onLoad={() => setReady(true)} onReady={() => setReady(true)} />
      {pay ? (
        <div className="w-full basis-full space-y-3 border-t pt-3" data-testid="card-tender">
          <p className="font-mono text-xs uppercase tracking-wide">Card · {money(pay.amountCents)}</p>
          <div ref={mountRef} className="rounded-md border bg-background px-3 py-3" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={pillClass + ' border'} disabled={pending || !ready} onClick={charge}>{pending ? 'Working' : `Charge ${money(pay.amountCents)}`}</button>
            <button type="button" className={pillClass} disabled={pending} onClick={cancel}>Cancel card</button>
          </div>
        </div>
      ) : (
        <button type="button" className={pillClass + ' border'} disabled={pending} onClick={begin}>{presented ? 'Resume card' : 'Pay by card'}</button>
      )}
    </>
  );
}
