'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { runCommand } from '../../actions/commands';
import { previewSeries, seriesProgress } from '../../actions/reports';
import { Button } from '@/components/ui/button';

type Preview = { rows: { day: string; time: string; problem: string | null }[]; problems: number; tiers: number; lineupSlots: number };
const input = 'mt-1 block h-10 w-full rounded-md border bg-background px-3 text-sm';

/** Repeat this show on later dates (preview first; all or nothing), and edit or cancel the future shows of its series together. */
export function SeriesPanel({ cancelling, cancelDone, canRepeat, showId, groupId, groupName, futureCount, startTime }: { cancelling: boolean; cancelDone: boolean; canRepeat: boolean; showId: string; groupId: string | null; groupName: string | null; futureCount: number; startTime: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [from, setFrom] = React.useState(''); const [count, setCount] = React.useState('4'); const [every, setEvery] = React.useState('7');
  const [time, setTime] = React.useState(''); const [lineup, setLineup] = React.useState(false);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [name, setName] = React.useState(''); const [title, setTitle] = React.useState(''); const [note, setNote] = React.useState(''); const [age, setAge] = React.useState(''); const [cap, setCap] = React.useState(''); const [newTime, setNewTime] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [message, setMessage] = React.useState(''); const [firstId, setFirstId] = React.useState(''); const [error, setError] = React.useState('');
  const pattern = () => ({ sourceShowId: showId, from, count: Number(count), everyDays: Number(every), startTime: time || undefined, copyLineup: lineup });
  /** Starts (first=true) or resumes the recorded cancellation, one call at a time, until the server says every show is done. The intent is saved on the first call, so closing the tab does not lose it: press Continue to finish the rest. */
  const finishCancel = async (first: boolean) => {
    let refunded = 0, failed = 0, lastDone = -1; const problems: string[] = [];
    for (let i = 0; i < 60; i++) {
      const r = await runCommand('cancelShowSeries', { groupId, reason: reason.trim() || 'Series cancelled' }, ['/dashboard/platform/shows']);
      if (!r.ok) { if (i === 0 && first) { fail(r.error); return; } problems.push(r.error); break; }
      refunded += r.data.refunded; failed += r.data.failed; problems.push(...r.data.problems);
      setMessage(`Cancelling: ${r.data.done} of ${r.data.total} done`);
      if (r.data.completed || r.data.problems.length) break;
      if (r.data.done === lastDone && r.data.failed) break; // a refund keeps failing: stop here, press Continue to retry
      lastDone = r.data.done;
    }
    const p = await seriesProgress(groupId!);
    setMessage(p.ok ? `${p.data.completed ? 'Cancelled' : 'Cancelling'}: ${p.data.done} of ${p.data.total} done${p.data.ran ? ` · ${p.data.ran} ran before it was reached` : ''}${p.data.refundsWaiting ? ` · ${p.data.refundsWaiting} refunds waiting` : ''} · ${refunded} refunded${failed ? ` · ${failed} refunds need attention` : ''}${problems.length ? ` · ${problems.join('; ')}` : ''}${p.data.completed ? '' : ' · it will finish on its own, or press Continue'}` : '');
    setError(''); router.refresh();
  };
  const reset = () => { setPreview(null); setMessage(''); setError(''); setFirstId(''); };
  const fail = (e: string) => { setError(e); setMessage(''); };
  return (
    <div className="space-y-6">
      {canRepeat ? <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Copy this show, its ticket types{lineup ? ' and lineup offers' : ''} to later dates in the venue's time. Nothing is created until every date passes the preview.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block text-sm">First date<input type="date" className={input} value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} /></label>
          <label className="block text-sm">Shows<input type="number" min={1} max={26} className={input} value={count} onChange={(e) => { setCount(e.target.value); reset(); }} /></label>
          <label className="block text-sm">Days apart<input type="number" min={1} max={60} className={input} value={every} onChange={(e) => { setEvery(e.target.value); reset(); }} /></label>
          <label className="col-span-2 block text-sm">Start time (blank keeps {startTime})<input type="time" className={input} value={time} onChange={(e) => { setTime(e.target.value); reset(); }} /></label>
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={lineup} onChange={(e) => { setLineup(e.target.checked); reset(); }} />Also copy the lineup as new offers</label>
          <label className="col-span-2 block text-sm">Series name (optional)<input className={input} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={pending || !from} onClick={() => start(async () => { reset(); const r = await previewSeries(pattern()); if (r.ok) setPreview(r.data); else fail(r.error); })}>Preview dates</Button>
          {preview && !preview.problems ? <Button type="button" disabled={pending} onClick={() => start(async () => {
            const r = await runCommand('createShowSeries', { ...pattern(), name }, ['/dashboard/platform/shows']);
            if (r.ok) { setMessage(`${r.data.created} draft shows created`); setFirstId(r.data.showIds?.[0] || ''); setPreview(null); router.refresh(); } else fail(r.error);
          })}>Create {preview.rows.length} shows</Button> : null}
        </div>
        {preview ? (
          <div className="space-y-1">
            <p className="font-mono text-xs uppercase tracking-wide">{preview.rows.length} dates · {preview.tiers} ticket types{lineup ? ` · ${preview.lineupSlots} lineup offers` : ''}</p>
            {preview.rows.map((r) => <p key={r.day} className={`break-words text-sm ${r.problem ? 'text-red-600' : ''}`}>{r.day} at {r.time}{r.problem ? ` — ${r.problem}` : ''}</p>)}
            {preview.problems ? <p role="alert" className="text-xs text-red-600">Fix the dates marked above. Nothing is created while any date has a problem.</p> : <p className="text-xs text-muted-foreground">Created as drafts. Publish each when ready.</p>}
          </div>
        ) : null}
      </div> : null}
      {groupId && cancelling ? (
        <div className="space-y-2 border-t pt-4">
          <p className="font-mono text-xs uppercase tracking-wide">Cancelling this series</p>
          <p className="text-sm text-muted-foreground">The cancellation is recorded and will finish even if you leave this page.</p>
          <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => { await finishCancel(false); })}>Continue cancelling</Button>
        </div>
      ) : null}
      {groupId && cancelDone && !futureCount ? <p className="border-t pt-4 font-mono text-xs uppercase tracking-wide">Series cancelled</p> : null}
      {groupId && futureCount > 0 && !cancelling ? (
        <div className="space-y-3 border-t pt-4">
          <p className="font-medium">{groupName || 'Series'} <span className="text-sm font-normal text-muted-foreground">· {futureCount} future show{futureCount === 1 ? '' : 's'}</span></p>
          <p className="text-xs text-muted-foreground">Changes apply to every future show in the series, or to none. Time and age rules cannot change once tickets are sold or held on any of them.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 block text-sm">Title<input className={input} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Leave blank to keep" /></label>
            <label className="col-span-2 block text-sm">Public note<input className={input} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Leave blank to keep" /></label>
            <label className="block text-sm">Age<select className={input} value={age} onChange={(e) => setAge(e.target.value)}><option value="">Keep</option><option value="all">All ages</option><option value="18">18+</option><option value="21">21+</option></select></label>
            <label className="block text-sm">Capacity<input type="number" min={1} className={input} value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Keep" /></label>
            <label className="col-span-2 block text-sm">New start time<input type="time" className={input} value={newTime} onChange={(e) => setNewTime(e.target.value)} /></label>
          </div>
          <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => {
            const edit: Record<string, unknown> = {};
            if (title.trim()) edit.title = title.trim(); if (note.trim()) edit.publicNote = note.trim(); if (age) edit.ageRestriction = age; if (cap) edit.capacity = Number(cap); if (newTime) edit.startTime = newTime;
            const r = await runCommand('editShowSeries', { groupId, edit }, ['/dashboard/platform/shows']);
            if (r.ok) { setMessage(`${r.data.edited} shows updated${r.data.skipped ? `, ${r.data.skipped} past or closed left alone` : ''}`); setError(''); router.refresh(); } else fail(r.error);
          })}>Apply to {futureCount} future show{futureCount === 1 ? '' : 's'}</Button>
          <div className="space-y-2 border-t pt-3">
            <label className="block text-sm">Reason for cancelling the series<input className={input} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></label>
            <Button type="button" variant="outline" disabled={pending || !reason.trim()} onClick={() => { if (!window.confirm(`Cancel ${futureCount} future show${futureCount === 1 ? '' : 's'} and refund every order?`)) return; start(async () => {
              await finishCancel(true);
            }); }}>Cancel future shows in this series</Button>
          </div>
        </div>
      ) : null}
      {message ? <p role="status" className="break-words text-sm">{message}</p> : null}
      {firstId ? <Link href={`/dashboard/platform/shows/${firstId}`} className="text-sm underline underline-offset-4">Open the first new show to manage the series</Link> : null}
      {error ? <p role="alert" className="break-words text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
