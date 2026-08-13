'use client';
// Right slide-over profile panel — matches the fleet's ProfileModal shape
// (SalesPort/ReviewPort/OpsPort/ClinicPort) and is the canonical home for the
// ThemePicker.
//
// ProductPort is SSO-only ("ProductPort sign-in — SSO only via SalesPort"):
// identity (name/email/role) is owned by the hub IdP, so this panel shows it
// READ-ONLY rather than proxying name/password edits like the CRM-backed
// satellites. "Manage your account" points back to the hub for identity
// changes. Portaled to <body> so it escapes catalog.module.css's `.page`
// scope (which locally shadows --blue/--red/--bg/etc. for the brand-matched
// catalog surface) and picks up the real platform theme tokens.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, UserCircle, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Tooltip, useModalEsc, useFocusTrap } from '@matthewdbaldwin/microport-ui';
import { useAuth } from '@/contexts/AuthContext';
import { ThemePicker } from '@/components/ui/ThemePicker';
import { testId } from '@/lib/i18nIds';

const NS = 'profileModal';

function initials(nameOrEmail: string) {
  return nameOrEmail.slice(0, 2).toUpperCase();
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ProfileModal({ open, onClose }: Props) {
  const { user } = useAuth();
  const t = useTranslations('profile');

  useModalEsc(onClose);
  const trapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || !user || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0" style={{ background: 'var(--overlay)' }} onClick={onClose} />

      <div
        ref={trapRef}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex flex-col w-full max-w-md border-l shadow-2xl"
        style={{ background: 'var(--surface)', borderColor: 'var(--border2)' }}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="text-base font-semibold" style={{ color: 'var(--fg)' }}>{t('title')}</div>
          <Tooltip content={t('close')} placement="left">
            <button
              {...testId(NS, 'close')}
              onClick={onClose}
              aria-label={t('close')}
              className="inline-flex items-center justify-center min-w-11 min-h-11 rounded-lg transition-colors"
              style={{ color: 'var(--muted)' }}
            >
              <X size={18} />
            </button>
          </Tooltip>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-6">
          {/* Identity card (read-only) */}
          <div className="flex items-center gap-3">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
              style={{ background: 'var(--accent-soft, var(--surface2))', color: 'var(--accent)' }}
            >
              {initials(user.name || user.email) || <UserCircle size={24} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate" style={{ color: 'var(--fg)' }}>{user.name || user.email}</div>
              <div className="text-sm truncate" style={{ color: 'var(--muted)' }}>{user.email}</div>
              <span className="inline-block mt-1 text-xs rounded-full px-2 py-0.5 capitalize"
                style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                {user.role}
              </span>
            </div>
          </div>

          <p className="text-xs" style={{ color: 'var(--muted)' }}>{t('ssoNote')}</p>

          {/* Theme */}
          <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-medium mb-3" style={{ color: 'var(--fg)' }}>{t('theme')}</p>
            <ThemePicker className="max-w-sm" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}>
          <a
            href="https://hub.microport.com/portal"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm"
            style={{ color: 'var(--muted)' }}
          >
            <ExternalLink size={14} />{t('manageAccount')}
          </a>
          <button type="button" onClick={onClose} className="btn-secondary" {...testId(NS, 'done')}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
