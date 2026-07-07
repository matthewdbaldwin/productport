import './globals.css';
import { getLocale, getMessages } from 'next-intl/server';
import { themeScript } from '@/lib/theme';
import { preloadCleanupScript, chunkRecoveryScript } from '@matthewdbaldwin/microport-ui';
import { AuthProvider } from '@/contexts/AuthContext';
import { LocaleProvider } from '@/components/LocaleProvider';
import { BugReportButton } from '@/components/BugReportButton';

export const metadata = {
  // Absolute-URL base so relative og:image / og:url resolve for social scrapers.
  // Env-overridable; the fallback is the canonical AWS prod host.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://product.microport.com'),
  title: { default: 'ProductPort', template: '%s · ProductPort' },
  description: 'MicroPort product catalog — internal use only.',
  // Icon set lives in web/public (served statically).
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Apply stored theme before paint (no flash). theme.ts is server-safe. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Strip stale prefetch/preload noise + recover from stuck-H2 chunk-load
            failures (Firefox) — shared fleet scripts from microport-ui. */}
        <script dangerouslySetInnerHTML={{ __html: preloadCleanupScript }} />
        <script dangerouslySetInnerHTML={{ __html: chunkRecoveryScript }} />
      </head>
      <body>
        <LocaleProvider locale={locale} messages={messages}>
          <AuthProvider>
            {children}
            <BugReportButton />
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
