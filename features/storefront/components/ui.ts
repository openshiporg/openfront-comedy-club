// Shared storefront look: white canvas, soft grey pills, one accent. The accent is --brand-accent, set once in app/(storefront)/layout.tsx.
export const ACCENT = 'bg-[var(--brand-accent)] text-white hover:bg-[var(--brand-accent-hover)]';
export const btnPrimary = `inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:opacity-50 ${ACCENT}`;
export const btnSoft = 'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-neutral-100 px-5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200 disabled:opacity-50';
export const card = 'rounded-3xl border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]';
// 16px text: anything smaller makes an iPhone zoom the page when the field is tapped.
export const inputCls = 'h-11 w-full rounded-full border border-neutral-200 bg-white px-4 text-base';
export const btnOutline = 'inline-flex h-11 items-center justify-center rounded-full border border-neutral-200 bg-white px-4 text-sm font-medium transition hover:bg-neutral-50 disabled:opacity-50';
export const sectionTitle = 'mb-3 text-base font-semibold tracking-tight text-neutral-950';
