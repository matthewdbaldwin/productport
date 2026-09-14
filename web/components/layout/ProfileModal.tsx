'use client';
// Right slide-over profile panel — now the shared microport-ui `ProfileModal`
// (v0.60, variant="panel"), which owns the portal, scrim, focus trap, Esc,
// body-scroll lock and the separator rhythm between sections. ProductPort keeps
// its own slot CONTENTS: the read-only SSO identity, the language pills, the
// ThemePicker and SignOutSection.
//
// ProductPort is SSO-only ("ProductPort sign-in — SSO only via SalesPort"):
// identity (name/email/role) is owned by the hub IdP, so this panel shows it
// READ-ONLY rather than proxying name/password edits like the CRM-backed
// satellites. "Manage your account" points back to the hub for identity
// changes. The lib portals to <body> so it escapes catalog.module.css's `.page`
// scope (which locally shadows --blue/--red/--bg/etc. for the brand-matched
// catalog surface) and picks up the real platform theme tokens.
//
// Sign-out lives here (hubport#113, 2026-09-02): the fleet decision (hubport#101)
// puts the sign-out control in the profile area everywhere. ProductPort has no
// sidebar, so this is its only sign-out — and, with no sidebar, the panel docks
// on the right (the lib's default `sidebarSide="left"`). profile/SignOutSection
// delegates to AuthContext.logout, which awaits the server logout before
// routing to /login.
import { ExternalLink, UserCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { ProfileModal as ProfileModalShell } from '@matthewdbaldwin/microport-ui';
import { useAuth } from '@/contexts/AuthContext';
import { ThemePicker } from '@/components/ui/ThemePicker';
import { SignOutSection } from '@/components/profile/SignOutSection';
import { testId } from '@/lib/i18nIds';
import { LOCALES } from '@/lib/locales';

const NS = 'profileModal';

function initials(nameOrEmail: string) {
  return nameOrEmail.slice(0, 2).toUpperCase();
}

// productport#8: web/i18n.ts resolves the locale from the NEXT_LOCALE cookie,
// and this is the only thing that writes it. A full reload (not
// router.refresh) so the server re-reads the cookie and every client bundle
// picks up the new messages. Same shape as finport 8f96c3e.
function setLocale(next: string) {
  document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ProfileModal({ open, onClose }: Props) {
  const { user } = useAuth();
  const locale = useLocale();
  const t = useTranslations('profile');

  if (!user) return null;

  return (
    <ProfileModalShell
      open={open}
      onClose={onClose}
      variant="panel"
      title={t('title')}
      // 28rem — the width this panel has always had; the panel default is 32rem.
      maxWidth="28rem"
      identity={
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
      }
      // Read-only SSO note in place of the editable profile form the CRM-backed
      // satellites put here.
      form={<p className="text-xs" style={{ color: 'var(--muted)' }}>{t('ssoNote')}</p>}
      sections={[
        // Language — writes NEXT_LOCALE (productport#8)
        <div key="language">
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--fg)' }}>{t('language')}</p>
          <div className="flex flex-wrap gap-2">
            {LOCALES.map((opt) => {
              const active = locale === opt.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  {...testId(NS, `locale-${opt.code}`)}
                  onClick={() => { if (!active) setLocale(opt.code); }}
                  aria-pressed={active}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium border transition-all min-h-11"
                  style={{
                    borderColor: active ? 'var(--accent)' : 'var(--border2)',
                    background:  active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
                    color:       active ? 'var(--accent)' : 'var(--muted)',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>,
        <div key="theme">
          <p className="text-sm font-medium mb-3" style={{ color: 'var(--fg)' }}>{t('theme')}</p>
          <ThemePicker className="max-w-sm" />
        </div>,
      ]}
      // hubport#113: fleet-wide sign-out, the profile area is its only home.
      signOut={<SignOutSection />}
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
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
      }
    />
  );
}
