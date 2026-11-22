import { redirect } from 'next/navigation';
import { myTickets } from '@/features/storefront/lib/account';
import { SignUpForm } from '@/features/storefront/components/AccountForms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create an account' };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await myTickets()) redirect('/account');
  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <p className="text-sm text-neutral-600">Tickets you buy while signed in show up under My tickets. Buying without an account still works.</p>
      <SignUpForm next={next} />
    </div>
  );
}
