'use client';

import * as React from 'react';
import Link from 'next/link';
import { signInBuyer, signUpBuyer, type AccountState } from '../lib/account';
import { btnPrimary, inputCls } from './ui';

const field = 'block text-sm';

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = React.useActionState(signInBuyer, { error: '', email: '' } as AccountState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next || ''} />
      <label className={field}>Email<input className={inputCls} name="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="email" required defaultValue={state.email} /></label>
      <label className={field}>Password<input className={inputCls} name="password" type="password" autoComplete="current-password" required /></label>
      {state.error ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button className={btnPrimary} disabled={pending}>{pending ? 'Signing in' : 'Sign in'}</button>
        <Link href={next ? `/account/signup?next=${encodeURIComponent(next)}` : '/account/signup'} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Create an account</Link>
      </div>
    </form>
  );
}

export function SignUpForm({ next }: { next?: string }) {
  const [state, action, pending] = React.useActionState(signUpBuyer, { error: '', email: '', name: '' } as AccountState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next || ''} />
      <label className={field}>Name<input className={inputCls} name="name" autoComplete="name" required defaultValue={state.name} /></label>
      <label className={field}>Email<input className={inputCls} name="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="email" required defaultValue={state.email} /></label>
      <label className={field}>Password<input className={inputCls} name="password" type="password" autoComplete="new-password" minLength={8} required aria-describedby="pw-hint" /></label>
      <p id="pw-hint" className="text-xs text-neutral-500">At least 8 characters.</p>
      {state.error ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button className={btnPrimary} disabled={pending}>{pending ? 'Creating account' : 'Create account'}</button>
        <Link href={next ? `/account?next=${encodeURIComponent(next)}` : '/account'} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">I have an account</Link>
      </div>
    </form>
  );
}
