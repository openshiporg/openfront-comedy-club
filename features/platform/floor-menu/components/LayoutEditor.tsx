'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { runCommand } from '../../actions/commands';
import { previewLayout } from '../../actions/reports';
import { Button } from '@/components/ui/button';

type Table = { id: string; label: string; seats: number; shape: string };
type Sec = { id: string; name: string; tables: Table[] };
type Change = Record<string, unknown> & { kind: string };
const field = 'mt-1 block h-10 w-full rounded-md border bg-background px-3 text-sm';

const describe = (c: Change, secs: Sec[]) => {
  const t = secs.flatMap((s) => s.tables).find((x) => x.id === c.tableId);
  const s = secs.find((x) => x.id === (c.sectionId as string));
  switch (c.kind) {
    case 'addSection': return `Add section ${c.name}`;
    case 'renameSection': return `Rename ${s?.name} to ${c.name}`;
    case 'removeSection': return `Remove section ${s?.name}`;
    case 'addTable': return `Add table ${c.label} (${c.seats} seats) to ${s?.name}`;
    case 'updateTable': return `Change table ${t?.label}${c.label ? ` → ${c.label}` : ''}${c.seats ? ` → ${c.seats} seats` : ''}${c.shape ? ` → ${c.shape}` : ''}`;
    case 'removeTable': return `Remove table ${t?.label}`;
    default: return c.kind;
  }
};

/** Stage floor-plan changes, preview them with the server's real rules (rolled back), then apply all or none. */
export function LayoutEditor({ roomId, sections }: { roomId: string; sections: Sec[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [staged, setStaged] = React.useState<Change[]>([]);
  const [preview, setPreview] = React.useState<{ capacityBefore: number; capacityAfter: number; tables: number } | null>(null);
  const [error, setError] = React.useState(''); const [message, setMessage] = React.useState('');
  const [secName, setSecName] = React.useState('');
  const [tSec, setTSec] = React.useState(sections[0]?.id || ''); const [tLabel, setTLabel] = React.useState(''); const [tSeats, setTSeats] = React.useState('4'); const [tShape, setTShape] = React.useState('round');
  const [edit, setEdit] = React.useState<{ id: string; label: string; seats: string; shape: string } | null>(null);
  const stage = (c: Change) => { setStaged((x) => [...x, c]); setPreview(null); setError(''); setMessage(''); };
  const unstage = (i: number) => { setStaged((x) => x.filter((_, j) => j !== i)); setPreview(null); };
  return (
    <div className="space-y-5">
      {sections.map((s) => (
        <div key={s.id} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs uppercase tracking-wide">{s.name}</span>
            <span className="flex gap-3 text-sm">
              <button type="button" className="underline underline-offset-4" onClick={() => { const n = window.prompt('Section name', s.name); if (n && n.trim() !== s.name) stage({ kind: 'renameSection', sectionId: s.id, name: n.trim() }); }}>Rename</button>
              {!s.tables.length ? <button type="button" className="underline underline-offset-4" onClick={() => stage({ kind: 'removeSection', sectionId: s.id })}>Remove</button> : null}
            </span>
          </div>
          {s.tables.map((t) => edit?.id === t.id ? (
            <div key={t.id} className="grid grid-cols-3 gap-2 rounded-md border p-2">
              <label className="block text-sm">Label<input className={field} value={edit.label} maxLength={20} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></label>
              <label className="block text-sm">Seats<input type="number" min={1} max={24} className={field} value={edit.seats} onChange={(e) => setEdit({ ...edit, seats: e.target.value })} /></label>
              <label className="block text-sm">Shape<select className={field} value={edit.shape} onChange={(e) => setEdit({ ...edit, shape: e.target.value })}><option value="round">Round</option><option value="square">Square</option><option value="rectangle">Rectangle</option></select></label>
              <div className="col-span-3 flex gap-2">
                <Button type="button" variant="outline" onClick={() => { const c: Change = { kind: 'updateTable', tableId: t.id }; if (edit.label.trim() !== t.label) c.label = edit.label; if (Number(edit.seats) !== t.seats) c.seats = Number(edit.seats); if (edit.shape !== t.shape) c.shape = edit.shape; if (Object.keys(c).length > 2) stage(c); setEdit(null); }}>Stage change</Button>
                <Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 break-words"><span className="font-mono">{t.label}</span> · {t.seats} seats · {t.shape}</span>
              <span className="flex shrink-0 gap-3">
                <button type="button" className="underline underline-offset-4" onClick={() => setEdit({ id: t.id, label: t.label, seats: String(t.seats), shape: t.shape })}>Edit</button>
                <button type="button" className="underline underline-offset-4" onClick={() => stage({ kind: 'removeTable', tableId: t.id })}>Remove</button>
              </span>
            </div>
          ))}
          {!s.tables.length ? <p className="text-sm text-muted-foreground">No tables.</p> : null}
        </div>
      ))}

      <div className="space-y-2 border-t pt-4">
        <p className="font-mono text-xs uppercase tracking-wide">Add</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">Section<select className={field} value={tSec} onChange={(e) => setTSec(e.target.value)}>{sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="block text-sm">Table label<input className={field} value={tLabel} maxLength={20} onChange={(e) => setTLabel(e.target.value)} /></label>
          <label className="block text-sm">Seats<input type="number" min={1} max={24} className={field} value={tSeats} onChange={(e) => setTSeats(e.target.value)} /></label>
          <label className="block text-sm">Shape<select className={field} value={tShape} onChange={(e) => setTShape(e.target.value)}><option value="round">Round</option><option value="square">Square</option><option value="rectangle">Rectangle</option></select></label>
        </div>
        <Button type="button" variant="outline" disabled={!tSec || !tLabel.trim()} onClick={() => { stage({ kind: 'addTable', sectionId: tSec, label: tLabel, seats: Number(tSeats), shape: tShape }); setTLabel(''); }}>Stage table</Button>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <label className="block text-sm">New section<input className={field} value={secName} maxLength={40} onChange={(e) => setSecName(e.target.value)} /></label>
          <Button type="button" variant="outline" disabled={!secName.trim()} onClick={() => { stage({ kind: 'addSection', name: secName }); setSecName(''); }}>Stage</Button>
        </div>
      </div>

      {staged.length ? (
        <div className="space-y-2 border-t pt-4">
          <p className="font-mono text-xs uppercase tracking-wide">{staged.length} staged change{staged.length === 1 ? '' : 's'}</p>
          {staged.map((c, i) => <p key={i} className="flex items-start justify-between gap-2 break-words text-sm"><span className="min-w-0">{describe(c, sections)}</span><button type="button" className="shrink-0 underline underline-offset-4" onClick={() => unstage(i)}>Undo</button></p>)}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => { setError(''); const r = await previewLayout(roomId, staged); if (r.ok) setPreview(r.data); else { setPreview(null); setError(r.error); } })}>Check changes</Button>
            {preview ? <Button type="button" disabled={pending} onClick={() => start(async () => {
              const r = await runCommand('editRoomLayout', { roomId, changes: staged, reason: 'Layout edit' }, ['/dashboard/platform/floor-menu']);
              if (r.ok) { setMessage(`Layout saved · ${r.data.tables} tables · ${r.data.capacityAfter} seats`); setStaged([]); setPreview(null); router.refresh(); } else { setError(r.error); setPreview(null); }
            })}>Apply {staged.length}</Button> : null}
            <Button type="button" variant="outline" onClick={() => { setStaged([]); setPreview(null); setError(''); }}>Discard</Button>
          </div>
          {preview ? <p role="status" className="text-sm">OK: {preview.tables} tables, room capacity {preview.capacityBefore} → {preview.capacityAfter}. Nothing is saved until you apply.</p> : null}
        </div>
      ) : null}
      {message ? <p role="status" className="text-sm">{message}</p> : null}
      {error ? <p role="alert" className="break-words text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
