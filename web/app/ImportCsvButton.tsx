'use client';

// ImportCsvButton — product_admin bulk CSV upload (Slice 3). Reads the picked
// file as text and POSTs it to /api/products/import (upsert-on-slug). Shows a
// created/updated/errors summary; if any rows failed, offers a downloadable
// error report so the admin can fix + re-upload.
//
// "Verify (dry run)" runs the same server-side validation + tally WITHOUT
// writing — so an admin can preflight a file before committing it. Either action
// is rejected (400) by the server if the CSV header is old/incompatible (missing
// a canonical column), because the import replaces every column and a partial
// header would erase data; the rejection message names the missing columns.

import { csvRow } from '@matthewdbaldwin/microport-contracts/csv';
import { useRef, useState } from 'react';
import s from './catalog.module.css';
import { importProductsCsv, type ImportResult } from '@/lib/products';
import { testId } from '@/lib/i18nIds';

const NS = 'importCsv';

export function ImportCsvButton({ onDone }: { onDone: () => void | Promise<void> }) {
  const ref = useRef<HTMLInputElement>(null);
  // Carries the chosen mode (verify vs import) across the file-picker round-trip:
  // the <input> onChange fires after the dialog closes, so we can't close over it.
  const dryRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [err, setErr] = useState('');

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    const dryRun = dryRef.current;
    setBusy(true); setErr(''); setResult(null);
    try {
      const text = await file.text();
      const res = await importProductsCsv(text, { dryRun });
      setResult(res);
      if (!res.dryRun) await onDone(); // a preview changed nothing — no reload
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  function pick(dryRun: boolean) {
    dryRef.current = dryRun;
    ref.current?.click();
  }

  function downloadErrors() {
    if (!result?.errors.length) return;
    // Cells go through the fleet-shared formula-safe writer: `slug` and
    // `error` echo content back from the uploaded file, so an uploaded CSV
    // could otherwise plant a formula that fires when the admin opens the
    // error report in Excel. (2026-07-27 fleet export sweep, client finding.)
    const rows = [['row', 'slug', 'error'], ...result.errors.map((x) => [x.row, x.slug, x.error])];
    const csv = rows.map((r) => csvRow(r)).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'import-errors.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const summary = result
    ? `${result.dryRun ? 'Preview' : 'Imported'}: ${result.created} new, ${result.updated} updated`
      + `${result.errors.length ? `, ${result.errors.length} ${result.dryRun ? 'would fail' : 'failed'}` : ''}`
      + `${result.unknownColumns?.length ? ` · ignored unknown column(s): ${result.unknownColumns.join(', ')}` : ''}`
    : '';

  return (
    <>
      <input ref={ref} type="file" accept=".csv,text/csv" hidden onChange={onFile} {...testId(NS, 'input')} />
      <button type="button" className={s.btn} disabled={busy} {...testId(NS, 'verify')} onClick={() => pick(true)}>
        {busy ? 'Working…' : 'Verify (dry run)'}
      </button>
      <button type="button" className={s.btn} disabled={busy} {...testId(NS, 'import')} onClick={() => pick(false)}>
        {busy ? 'Importing…' : 'Import CSV'}
      </button>
      {(result || err) && (
        <span
          role="status"
          style={{ fontSize: 12, marginLeft: 4, color: err ? 'var(--rd)' : 'var(--grey)', display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          {err ? err : summary}
          {result && result.errors.length > 0 && (
            <button type="button" className={s.ebtnGhost} style={{ padding: '2px 8px', fontSize: 11 }} onClick={downloadErrors} {...testId(NS, 'downloadErrors')}>
              Download errors
            </button>
          )}
        </span>
      )}
    </>
  );
}
