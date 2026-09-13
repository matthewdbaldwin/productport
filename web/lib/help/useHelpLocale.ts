'use client';

// web/lib/help/useHelpLocale.ts
// The ONE locale every help surface resolves content against (article, /help
// index, HelpLauncher, ⌘K palette, the detail-view and editor popovers), so they
// agree with each other AND with the UI chrome (productport#27).
//
// Order:
//   1. next-intl's active locale — what web/i18n.ts resolved from the
//      NEXT_LOCALE cookie the ProfileModal language switcher writes. This is
//      the language the rest of the page is rendered in.
//   2. the account's saved locale (useAuth().user.locale), used only when there
//      is no next-intl provider or it reports a code outside LOCALES.
//   3. DEFAULT_LOCALE.
//
// useLocale() throws outside a NextIntlClientProvider (bare component renders
// in tests). The hook is still called unconditionally on every render, so hook
// order is stable; the catch only turns "no provider" into step 2.
import { useLocale } from 'next-intl';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_LOCALE, LOCALES } from '@/lib/locales';

export function resolveHelpLocale(intlLocale: string | null | undefined, userLocale: string | null | undefined): string {
  const known = (code: string | null | undefined): code is string => !!code && LOCALES.some((l) => l.code === code);
  if (known(intlLocale)) return intlLocale;
  if (known(userLocale)) return userLocale;
  return DEFAULT_LOCALE;
}

function useIntlLocaleOrNull(): string | null {
  try {
    return useLocale();
  } catch {
    return null;
  }
}

export function useHelpLocale(): string {
  const intlLocale = useIntlLocaleOrNull();
  const { user } = useAuth();
  return resolveHelpLocale(intlLocale, user?.locale);
}
