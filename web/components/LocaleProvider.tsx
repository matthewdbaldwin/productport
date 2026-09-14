'use client';

// The locale table lives in the server-safe @/lib/locales (no 'use client') so
// the next-intl server config can import it without the client-reference-proxy
// trap. Re-exported here for back-compat with existing imports.
// feedback_locale_provider_table_driven, project_i18n_coverage_state.
import { NextIntlClientProvider } from 'next-intl';
import { type ReactNode } from 'react';
import { LOCALES, DEFAULT_LOCALE, type LocaleCode } from '@/lib/locales';

export { LOCALES, DEFAULT_LOCALE };
export type { LocaleCode };

// timeZone is passed through, not inherited: a provider rendered from a
// client component gets NO config from i18n.ts (only one rendered directly
// in a Server Component does), so without this every SSR'd formatter ran on
// the container's zone and next-intl logged ENVIRONMENT_FALLBACK at every
// task start. The layout reads it via getTimeZone() so i18n.ts stays the
// single source. LocaleProvider.test.tsx pins it.
export function LocaleProvider({
  locale,
  messages,
  timeZone,
  children,
}: {
  locale: string;
  messages: Record<string, unknown>;
  timeZone?: string;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
      {children}
    </NextIntlClientProvider>
  );
}
