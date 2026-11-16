'use client';

import * as React from 'react';
import Link from 'next/link';
import { btnPrimary, card, sectionTitle } from './ui';

export type FinderShow = { id: string; title: string; when: string; day: string; age: string; room: string; from: string; kind: string };

const KINDS = [['all', 'All shows'], ['standup', 'Stand-up'], ['openmic', 'Open mic']] as const;

export function ShowFinder({ shows, days }: { shows: FinderShow[]; days: string[] }) {
  const [kind, setKind] = React.useState<string>('all');
  const [day, setDay] = React.useState('');
  const hits = shows.filter((s) => (kind === 'all' || s.kind === kind) && (!day || s.day === day));
  return (
    <section id="find" className="scroll-mt-6">
      <h2 className={sectionTitle}>Find a show</h2>
      <div className={`${card} space-y-3 p-4`}>
        <div className="flex justify-end">
          <div className="inline-flex rounded-full bg-neutral-100 p-1 text-xs" role="tablist">
            {KINDS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`rounded-full px-3 py-1.5 ${kind === k ? 'bg-white font-medium shadow-sm' : 'text-neutral-500'}`}>{l}</button>)}
          </div>
        </div>
        <select aria-label="Date" value={day} onChange={(e) => setDay(e.target.value)} className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 text-sm">
          <option value="">Any date</option>
          {days.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <ul className="divide-y divide-neutral-100">
          {hits.map((s) => (
            <li key={s.id}><Link href={`/shows/${s.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0 truncate font-medium">{s.title}</span><span className="shrink-0 text-neutral-500">{s.when}</span></Link></li>
          ))}
          {!hits.length ? <li className="py-3 text-sm text-neutral-500">No shows match.</li> : null}
        </ul>
        <a href="#find" className={`${btnPrimary} w-full`} onClick={(e) => e.preventDefault()}>{hits.length} {hits.length === 1 ? 'show' : 'shows'}</a>
      </div>
    </section>
  );
}
