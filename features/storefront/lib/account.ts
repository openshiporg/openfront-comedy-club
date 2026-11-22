'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { gqlCall } from './data';

export type AccountState = { error: string; email: string; name?: string };

const SIGN_IN = `mutation($email: String!, $password: String!) { authenticateUserWithPassword(email: $email, password: $password) {
  ... on UserAuthenticationWithPasswordSuccess { sessionToken }
  ... on UserAuthenticationWithPasswordFailure { message } } }`;
const REGISTER = `mutation($name: String!, $email: String!, $password: String!) { registerTicketBuyer(name: $name, email: $email, password: $password) }`;
const MINE = `{ myTicketOrders }`;

// Same session cookie as the staff sign-in (features/dashboard/actions/auth.ts).
async function startSession(email: string, password: string) {
  const r = await gqlCall<{ authenticateUserWithPassword: { sessionToken?: string; message?: string } }>(SIGN_IN, { email, password });
  const token = r.ok ? r.data.authenticateUserWithPassword?.sessionToken : undefined;
  if (!token) return false;
  (await cookies()).set('keystonejs-session', token, { secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', httpOnly: true, maxAge: 60 * 60 * 24 * 30 });
  return true;
}

/** Only a path on this site, so a crafted link cannot send the buyer elsewhere after sign-in. */
function back(to: FormDataEntryValue | null) {
  const s = typeof to === 'string' ? to : '';
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/dashboard') && !/[\\\s]/.test(s) ? s : '/account';
}

export async function signInBuyer(_: AccountState, form: FormData): Promise<AccountState> {
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  // accounts made here are stored in lower case; staff accounts keep the case they were made with
  if (!(await startSession(email, password)) && !(email !== email.toLowerCase() && await startSession(email.toLowerCase(), password))) return { error: 'That email and password do not match an account.', email };
  revalidatePath('/', 'layout');
  redirect(back(form.get('next')));
}

export async function signUpBuyer(_: AccountState, form: FormData): Promise<AccountState> {
  const name = String(form.get('name') || '').trim();
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  const r = await gqlCall(REGISTER, { name, email, password });
  if (!r.ok) return { error: r.error, email, name };
  if (!(await startSession(email.toLowerCase(), password))) return { error: 'Your account is ready. Sign in to continue.', email, name };
  revalidatePath('/', 'layout');
  redirect(back(form.get('next')));
}

export async function signOutBuyer() {
  await gqlCall('mutation { endSession }', {}, true);
  (await cookies()).set('keystonejs-session', '', { maxAge: -1, path: '/' });
  revalidatePath('/', 'layout');
  redirect('/');
}

export type MyTickets = {
  name: string; email: string;
  orders: { orderNumber: string; upcoming: boolean; status: string; totalCents: number; partySize: number; show: { id: string; title: string; startsAt: string; doorsAt: string | null; room: { name: string } | null }; tickets: { ticketCode: string; status: string; token: string | null }[] }[];
};

/** The signed-in buyer and their orders, or null when nobody is signed in. */
export async function myTickets(): Promise<MyTickets | null> {
  if (!(await cookies()).get('keystonejs-session')?.value) return null;
  const r = await gqlCall<{ myTicketOrders: MyTickets }>(MINE, {}, true);
  return r.ok ? r.data.myTicketOrders : null;
}
