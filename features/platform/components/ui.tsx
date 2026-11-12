import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { label } from '../lib/format';

const DOT: Record<string, string> = {
  on_sale: 'bg-emerald-500', paid: 'bg-emerald-500', valid: 'bg-emerald-500', confirmed: 'bg-emerald-500', performed: 'bg-emerald-500', succeeded: 'bg-emerald-500', active: 'bg-emerald-500', seated: 'bg-emerald-500', admitted: 'bg-emerald-500', settled: 'bg-emerald-500', closed: 'bg-emerald-500',
  doors_open: 'bg-amber-500', in_progress: 'bg-amber-500', open: 'bg-amber-500', presented: 'bg-amber-500', offered: 'bg-amber-500', pending_payment: 'bg-amber-500', draft: 'bg-amber-500', approved: 'bg-amber-500', waiting: 'bg-amber-500', processing: 'bg-amber-500', paused: 'bg-amber-500',
  sold_out: 'bg-cyan-500', checked_in: 'bg-cyan-500', completed: 'bg-cyan-500', called: 'bg-cyan-500', comp: 'bg-cyan-500',
  cancelled: 'bg-red-500', refunded: 'bg-red-500', declined: 'bg-red-500', no_show: 'bg-red-500', void: 'bg-red-500', voided: 'bg-red-500', failed: 'bg-red-500', duplicate: 'bg-red-500',
};

export function Status({ value, className }: { value?: string | null; className?: string }) {
  if (!value) return null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide', className)}>
      <span className={cn('size-2 shrink-0 rounded-full', DOT[value] || 'bg-muted-foreground/50')} />
      {label(value)}
    </span>
  );
}

export function Page({ title, crumbs = [], children }: { title: string; crumbs?: { label: string; href?: string }[]; children: React.ReactNode }) {
  return (
    <PageContainer
      title={title}
      breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, ...crumbs.map((c) => ({ type: (c.href ? 'link' : 'page') as 'link' | 'page', label: c.label, href: c.href })), { type: 'page', label: title }]}
      header={<h1 className="text-xl font-semibold tracking-tight">{title}</h1>}
    >
      <div className="min-w-0 space-y-6 px-4 pb-10 md:px-6">{children}</div>
    </PageContainer>
  );
}

export function Tabs({ items, active }: { items: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {items.map((i) => (
          <Link key={i.key} href={i.href} className={cn('inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium', i.key === active ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
            {i.label}{i.count !== undefined ? <span className="ml-1.5 font-mono text-xs text-muted-foreground">{i.count}</span> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-3 border-b pb-2">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Row({ children, href, className }: { children: React.ReactNode; href?: string; className?: string }) {
  const cls = cn('flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-3 text-sm last:border-b-0', href && 'hover:bg-muted/40', className);
  return href ? <Link href={href} className={cls}>{children}</Link> : <div className={cls}>{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-sm text-muted-foreground">{children}</p>;
}

export function Stat({ name, value }: { name: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{name}</div>
      <div className="mt-1 break-words text-lg font-semibold">{value}</div>
    </div>
  );
}

export const Meta = ({ children }: { children: React.ReactNode }) => <span className="min-w-0 break-words text-xs text-muted-foreground">{children}</span>;
