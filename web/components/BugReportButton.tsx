'use client';

// Floating "Report a bug" — a discreet round red bug-icon launcher (mirrors the
// fleet: clinicport/salesport) that opens a proper modal form. Every AUTHED user
// can file; the form POSTs to /api/bug-reports, which signs + forwards to the
// SalesPort central queue. Rendered into document.body via a portal so the fixed
// launcher escapes the app shell's stacking/overflow (and Firefox paints it).
// bug-report-fanout, feedback_helpbutton_inline_zindex.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Tooltip, useModalEsc } from '@matthewdbaldwin/microport-ui';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

type Priority = 'low' | 'normal' | 'high' | 'critical';
const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'critical'];

// Inline bug glyph — avoids a lucide-react dependency for one icon.
function BugIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6Z" />
      <path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M4 3l16 16M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </svg>
  );
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
          className="fixed bottom-20 right-4 md:bottom-4 z-40 inline-flex items-center justify-center p-2.5 rounded-full shadow-lg transition-transform hover:scale-105"
          style={{ background: 'var(--danger, #dc2626)', color: 'var(--danger-fg, #fff)' }}
        >
          <BugIcon size={18} />
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

  const inputStyle = { background: 'var(--surface2, var(--surface))', borderColor: 'var(--border)', color: 'var(--fg)' } as const;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError(t('errorTitle')); return; }
    setSubmitting(true);
    try {
      await api('/api/bug-reports', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: detail.trim(),
          pageUrl: window.location.href,
          browserAgent: navigator.userAgent,
          viewportSize: `${window.innerWidth}x${window.innerHeight}`,
          priority,
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
          className="w-full max-w-md rounded-xl shadow-xl border pointer-events-auto"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          role="dialog" aria-modal="true" aria-labelledby="bug-modal-title"
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 id="bug-modal-title" className="text-base font-semibold inline-flex items-center gap-2" style={{ color: 'var(--fg)' }}>
              <span style={{ color: 'var(--danger, #dc2626)' }}><BugIcon size={18} /></span>{t('label')}
            </h2>
            <button type="button" onClick={onClose} aria-label={t('close')} className="btn-close" disabled={submitting}
              style={{ color: 'var(--muted)', fontSize: 22, lineHeight: 1 }}>&times;</button>
          </div>

          {sent ? (
            <p className="px-5 py-6 text-sm" style={{ color: 'var(--fg)' }}>{t('thanks')}</p>
          ) : (
            <form onSubmit={submit} className="p-5 space-y-3">
              {error && <p role="alert" className="text-sm" style={{ color: 'var(--danger, #dc2626)' }}>{error}</p>}
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
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="rounded px-3 py-2 text-sm min-h-11" style={{ color: 'var(--muted)' }} onClick={onClose} disabled={submitting}>
                  {t('cancel')}
                </button>
                <button type="submit" className="btn-primary rounded px-4 py-2 text-sm min-h-11" disabled={submitting || !title.trim()}>
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
