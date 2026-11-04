'use client';

import * as React from 'react';
import { exportShowReport } from '../../actions/reports';
import { Button } from '@/components/ui/button';

/** The CSV is built and audited on the server; the browser only saves the returned file. */
export function ExportReport({ from, to }: { from: string; to: string }) {
  const [pending, start] = React.useTransition();
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState('');
  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => {
        setError(''); setNote('');
        const r = await exportShowReport(from, to);
        if (!r.ok) { setError(r.error); return; }
        const url = URL.createObjectURL(new Blob([r.data.csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = r.data.fileName; a.click(); URL.revokeObjectURL(url);
        setNote(`${r.data.rows} rows exported`);
      })}>{pending ? 'Working' : 'Export CSV'}</Button>
      {note ? <p role="status" className="text-xs text-muted-foreground">{note}</p> : null}
      {error ? <p role="alert" className="break-words text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
