'use client';

// ImportCsvButton — product_admin bulk CSV upload (Slice 3). Reads the picked
// file as text and POSTs it to /api/products/import (upsert-on-slug). Shows a
// created/updated/errors summary; if any rows failed, offers a downloadable
// error report so the admin can fix + re-upload.

import { useRef, useState } from 'react';
import s from './catalog.module.css';
import { importProductsCsv, type ImportResult } from '@/lib/products';

export function ImportCsvButton({ onDone }: { onDone: () => void | Promise<void> }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [err, setErr] = useState('');

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setBusy(true); setErr(''); setResult(null);
    try {
      const text = await file.text();
      const res = await importProductsCsv(text);
      setResult(res);
      await onDone();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  function downloadErrors() {
    if (!result?.errors.length) return;
    const rows = [['row', 'slug', 'error'], ...result.errors.map((x) => [x.row, x.slug, x.error])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'import-errors.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <input ref={ref} type="file" accept=".csv,text/csv" hidden onChange={onFile} data-testid="import-csv-input" />
      <button type="button" className={s.btn} disabled={busy} data-testid="import-csv" onClick={() => ref.current?.click()}>
        {busy ? 'Importing…' : 'Import CSV'}
      </button>
      {(result || err) && (
        <span
          role="status"
          style={{ fontSize: 12, marginLeft: 4, color: err ? 'var(--rd)' : 'var(--grey)', display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          {err
            ? err
            : `Imported: ${result!.created} new, ${result!.updated} updated${result!.errors.length ? `, ${result!.errors.length} failed` : ''}`}
          {result && result.errors.length > 0 && (
            <button type="button" className={s.ebtnGhost} style={{ padding: '2px 8px', fontSize: 11 }} onClick={downloadErrors}>
              Download errors
            </button>
          )}
        </span>
      )}
    </>
  );
}
