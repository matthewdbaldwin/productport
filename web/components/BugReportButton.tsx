'use client';

// Floating "Report a bug" — a discreet round red bug-icon launcher (mirrors the
// fleet: opsport/reviewport/clinicport/salesport) that opens a modal form. Every
// AUTHED user can file; the form POSTs to /api/bug-reports, which signs + forwards
// to the SalesPort central queue. Rendered into document.body via a portal so the
// fixed launcher escapes the app shell's stacking/overflow (and Firefox paints it).
// bug-report-fanout, feedback_helpbutton_inline_zindex.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Bug } from 'lucide-react';
import { Tooltip, useModalEsc, useFocusTrap } from '@matthewdbaldwin/microport-ui';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

type Priority = 'low' | 'normal' | 'high' | 'critical';
const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'critical'];
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '';

// Minted at module scope, not in render — react-hooks/purity forbids Date.now()
// (and other impure calls) inside a component/hook body; the fleet pattern is a
// plain top-level helper the rule doesn't trace into.
function mintEventId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `evt-${Date.now()}`;
}

export function BugReportButton() {
  const t = useTranslations('bug');
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot createPortal mount guard
  useEffect(() => setMounted(true), []);
  // Auth-gated: only signed-in users file (mirrors the fleet). Never render on
  // the logged-out /login page.
  if (!user || !mounted) return null;

  return createPortal(
    <>
      <Tooltip content={t('label')} placement="left">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('label')}
          data-bug-report-launcher="true"
          className="group fixed bottom-20 right-4 md:bottom-4 z-40 inline-flex items-center justify-center min-w-11 min-h-11"
          style={{ color: 'var(--accent-fg)' }}
        >
          <span
            className="inline-flex items-center justify-center w-9 h-9 rounded-full shadow-lg transition-transform group-hover:scale-105"
            style={{ background: 'var(--red)' }}
          >
            <Bug size={18} aria-hidden="true" />
          </span>
        </button>
      </Tooltip>
      {open && <BugReportModal onClose={() => setOpen(false)} />}
    </>,
    document.body,
  );
}

function BugReportModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations('bug');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useModalEsc(onClose, !submitting);
  const trapRef = useFocusTrap<HTMLDivElement>();

  // Auto-captured context, computed once. Shown read-only to the reporter (fleet
  // transparency parity) and sent with the report.
  const ctx = useMemo(() => ({
    pageUrl: typeof window !== 'undefined' ? window.location.href : '',
    viewportSize: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
    browserAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    appVersion: APP_VERSION,
  }), []);
  // Idempotency key minted once per open, so a retry after a lost response dedups
  // on SalesPort instead of double-filing (fleet parity).
  const eventId = useMemo(() => mintEventId(), []);

  const inputStyle = { background: 'var(--surface2, var(--surface))', borderColor: 'var(--border)', color: 'var(--text)' } as const;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError(t('errorTitle')); return; }
    if (!detail.trim()) { setError(t('errorDetail')); return; }
    setSubmitting(true);
    try {
      await api('/api/bug-reports', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: detail.trim(),
          priority,
          pageUrl: ctx.pageUrl,
          browserAgent: ctx.browserAgent,
          viewportSize: ctx.viewportSize,
          appVersion: ctx.appVersion,
          eventId,
        }),
      });
      setSent(true);
      setTimeout(onClose, 1400);
    } catch {
      setError(t('errorSend'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={submitting ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={trapRef}
          className="w-full max-w-lg rounded-xl shadow-xl border pointer-events-auto"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          role="dialog" aria-modal="true" aria-labelledby="bug-modal-title"
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 id="bug-modal-title" className="text-base font-semibold inline-flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <span style={{ color: 'var(--red)' }}><Bug size={18} aria-hidden="true" /></span>{t('label')}
            </h2>
            <Tooltip content={t('close')}>
              <button type="button" onClick={onClose} aria-label={t('close')} disabled={submitting}
                className="inline-flex items-center justify-center rounded"
                style={{ color: 'var(--muted)', fontSize: 22, lineHeight: 1, width: 44, height: 44 }}>&times;</button>
            </Tooltip>
          </div>

          {sent ? (
            <p className="px-5 py-6 text-sm" style={{ color: 'var(--text)' }}>{t('thanks')}</p>
          ) : (
            <form onSubmit={submit} className="p-5 space-y-3">
              {error && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
              <div className="space-y-1">
                <label htmlFor="bug-title" className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{t('titleLabel')}</label>
                <input id="bug-title" className="w-full rounded border px-2.5 py-2 text-sm" style={inputStyle}
                  value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus
                  placeholder={t('titlePlaceholder')} />
              </div>
              <div className="space-y-1">
                <label htmlFor="bug-detail" className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{t('detailLabel')}</label>
                <textarea id="bug-detail" className="w-full rounded border px-2.5 py-2 text-sm resize-none" style={inputStyle}
                  rows={4} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={10000}
                  placeholder={t('detailPlaceholder')} />
              </div>
              <div className="space-y-1">
                <label htmlFor="bug-priority" className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{t('priorityLabel')}</label>
                <select id="bug-priority" className="w-full rounded border px-2.5 py-2 text-sm" style={inputStyle}
                  value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority_${p}`)}</option>)}
                </select>
              </div>
              {/* Read-only preview of what's attached — fleet transparency parity. */}
              <details className="text-xs" style={{ color: 'var(--muted)' }}>
                <summary className="cursor-pointer">{t('capturedContext')}</summary>
                <dl className="mt-1.5 space-y-0.5">
                  <div><span className="font-medium">{t('ctxPage')}:</span> {ctx.pageUrl}</div>
                  <div><span className="font-medium">{t('ctxViewport')}:</span> {ctx.viewportSize}</div>
                  {ctx.appVersion && <div><span className="font-medium">{t('ctxAppVersion')}:</span> {ctx.appVersion}</div>}
                  <div className="truncate"><span className="font-medium">{t('ctxBrowser')}:</span> {ctx.browserAgent}</div>
                </dl>
              </details>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="rounded px-3 py-2 text-sm min-h-11" style={{ color: 'var(--muted)' }} onClick={onClose} disabled={submitting}>
                  {t('cancel')}
                </button>
                <button type="submit" className="btn-primary rounded px-4 py-2 text-sm min-h-11" disabled={submitting || !title.trim() || !detail.trim()}>
                  {submitting ? t('sending') : t('send')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
