'use client';

import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { testId } from '@/lib/i18nIds';

// hubport#113 (2026-09-02) — ProductPort's sign-out control. The fleet
// decision (hubport#101) puts sign-out in the profile area everywhere; this
// is the thin control that calls useAuth().logout — never fetch/api itself —
// so AuthContext's server-first ordering (await the logout route, then clear
// the user, then /login) stays the single source of truth. Test id follows
// ProductPort's idFor kebab rule: `profile.signOut` → `profile-sign-out`.
export function SignOutSection() {
  const t = useTranslations('profile');
  const { logout } = useAuth();

  return (
    <button
      type="button"
      onClick={logout}
      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 min-h-11 rounded-lg text-sm font-medium border transition-colors"
      style={{ color: 'var(--fg)', borderColor: 'var(--border)' }}
      {...testId('profile', 'signOut')}
    >
      <LogOut size={16} aria-hidden />
      {t('signOut')}
    </button>
  );
}
