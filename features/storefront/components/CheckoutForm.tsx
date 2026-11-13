'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { applyPromo, startCheckout, completeCheckout, abandonCheckout } from '../lib/actions';
import { price } from '../lib/format';

declare global { interface Window { Stripe?: any } }
const btn = 'inline-flex h-11 items-center justify-center rounded-md border bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50';
const input = 'h-11 w-full rounded-md border bg-background px-3 text-sm';

export function CheckoutForm({ holdKey }: { holdKey: string }) {
  const router = useRouter();
  const [hold, setHold] = React.useState<{ cartToken: string; expiresAt: string; ageRestriction: string; mixed?: boolean } | null>(null);
  const [left, setLeft] = React.useState(0);
  const [form, setForm] = React.useState({ name: '', email: '', phone: '', seatingRequest: '', occasion: '' });
  const [age, setAge] = React.useState(false);
  const [promo, setPromo] = React.useState('');
  const [promoMsg, setPromoMsg] = React.useState('');
  const [error, setError] = React.useState('');
  const [stage, setStage] = React.useState<'details' | 'pay'>('details');
  const [order, setOrder] = React.useState<{ orderNumber: string; orderSecret: string; clientSecret: string; publishableKey: string; totalCents: number } | null>(null);
  const [stripeReady, setStripeReady] = React.useState(false);
  const [pending, start] = React.useTransition();
  const cardRef = React.useRef<HTMLDivElement>(null);
  const stripeRef = React.useRef<any>(null);
  const cardEl = React.useRef<any>(null);

  React.useEffect(() => {
    const raw = sessionStorage.getItem(`hold:${holdKey}`);
    if (raw) { const h = JSON.parse(raw); setHold(h); setLeft(Math.max(0, Math.floor((new Date(h.expiresAt).getTime() - Date.now()) / 1000))); }
  }, [holdKey]);
  React.useEffect(() => {
    if (!hold || stage === 'pay') return;
    const t = setInterval(() => setLeft(Math.max(0, Math.floor((new Date(hold.expiresAt).getTime() - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [hold, stage]);
  React.useEffect(() => {
    if (stage !== 'pay' || !order || !stripeReady || !cardRef.current || cardEl.current) return;
    stripeRef.current = window.Stripe(order.publishableKey);
    const elements = stripeRef.current.elements({ clientSecret: order.clientSecret });
    cardEl.current = elements.create('payment');
    cardEl.current.mount(cardRef.current);
    (stripeRef.current as any)._elements = elements;
  }, [stage, order, stripeReady]);

  if (!hold) return <p className="text-sm text-muted-foreground">This hold is not available in this browser. <a className="underline" href="/">Choose tickets again</a>.</p>;
  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
  const expired = stage === 'details' && left === 0;
  const needsAge = hold.ageRestriction !== 'all';

  const submitDetails = () => start(async () => {
    setError('');
    const r = await startCheckout({ holdKey, cartToken: hold.cartToken, customer: { name: form.name, email: form.email, phone: form.phone }, ageAttested: age, seatingRequest: form.seatingRequest, occasion: form.occasion });
    if (!r.ok) { setError(r.error); return; }
    sessionStorage.setItem(`order:${r.data.orderNumber}`, r.data.orderSecret);
    setOrder(r.data); setStage('pay');
  });
  const pay = () => start(async () => {
    setError('');
    const { error: stripeError } = await stripeRef.current.confirmPayment({ elements: stripeRef.current._elements, redirect: 'if_required', confirmParams: { return_url: window.location.origin + `/orders/${order!.orderNumber}#${order!.orderSecret}` } });
    if (stripeError && stripeError.type !== 'validation_error') {
      setError(stripeError.message || 'Payment failed');
      const a = await abandonCheckout(order!.orderNumber, order!.orderSecret);
      if (a.ok && ['cancelled'].includes(a.data.status)) { setError((stripeError.message || 'Payment failed') + ' Your hold was released.'); }
      return;
    }
    if (stripeError) return;
    const c = await completeCheckout(order!.orderNumber, order!.orderSecret);
    if (!c.ok) { setError(c.error); return; }
    router.push(`/orders/${order!.orderNumber}#${order!.orderSecret}`);
  });

  return (
    <div className="space-y-6">
      <Script src="https://js.stripe.com/v3/" onLoad={() => setStripeReady(true)} onReady={() => setStripeReady(true)} />
      {stage === 'details' ? <p className={`font-mono text-xs uppercase tracking-wide ${left < 60 ? 'text-red-600' : ''}`} role="timer">Held for {mm}:{ss}</p> : <p className="font-mono text-xs uppercase tracking-wide">Total {price(order!.totalCents)}</p>}
      {expired ? <p role="alert" className="text-sm text-red-600">Your hold expired. <a className="underline" href="/">Choose tickets again</a>.</p> : null}
      {stage === 'details' && !expired ? (
        <div className="space-y-3">
          <label className="block text-sm">Name<input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" /></label>
          <label className="block text-sm">Email<input className={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" /></label>
          <label className="block text-sm">Phone<input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" /></label>
          <label className="block text-sm">Seating request<input className={input} value={form.seatingRequest} onChange={(e) => setForm({ ...form, seatingRequest: e.target.value })} /></label>
          <label className="block text-sm">Occasion<input className={input} value={form.occasion} onChange={(e) => setForm({ ...form, occasion: e.target.value })} /></label>
          <div className="flex gap-2">
            <input className={input} placeholder="Promo code" value={promo} onChange={(e) => setPromo(e.target.value)} />
            <button type="button" className="h-11 rounded-md border px-4 text-sm" disabled={pending || !promo.trim()} onClick={() => start(async () => { const r = await applyPromo({ holdKey, cartToken: hold.cartToken, code: promo }); setPromoMsg(r.ok ? 'Code applied' : r.error); })}>Apply</button>
          </div>
          {promoMsg ? <p role="status" className="text-sm">{promoMsg}</p> : null}
          {needsAge ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={age} onChange={(e) => setAge(e.target.checked)} />Everyone in my party is {hold.ageRestriction} or older and will show ID.</label> : null}
          <button type="button" className={btn} disabled={pending || !form.name || !form.email || (needsAge && !age)} onClick={submitDetails}>{pending ? 'Working' : 'Continue to payment'}</button>
        </div>
      ) : null}
      {stage === 'pay' ? (
        <div className="space-y-4">
          <div ref={cardRef} className="min-h-24" />
          <button type="button" className={btn} disabled={pending || !stripeReady} onClick={pay}>{pending ? 'Paying' : `Pay ${price(order!.totalCents)}`}</button>
        </div>
      ) : null}
      {error ? <p role="alert" className="break-words text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
