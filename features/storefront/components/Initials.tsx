const TONES = ['bg-[var(--brand-accent)] text-white', 'bg-neutral-900 text-white', 'bg-rose-100 text-rose-900', 'bg-violet-100 text-violet-900', 'bg-amber-100 text-amber-900', 'bg-sky-100 text-sky-900'];

/** A performer's mark when the club has not uploaded a headshot: their initials. */
export function Initials({ name, className = '' }: { name: string; className?: string }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  const tone = TONES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length];
  return <span aria-hidden className={`flex items-center justify-center font-semibold tracking-tight ${tone} ${className}`}>{letters}</span>;
}
