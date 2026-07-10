// next.config.js — MUST be .js, never .ts. A next.config.ts builds fine locally
// and breaks the production build. feedback_next_config_ts_prod.
const createNextIntlPlugin = require('next-intl/plugin');
const { withSentryConfig } = require('@sentry/nextjs');
const { version } = require('./package.json');
const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Expose the app version to the client at build time — shown under "ProductPort"
  // in the top bar and captured by BugReportButton (reads NEXT_PUBLIC_APP_VERSION).
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  async rewrites() {
    // Proxy /api → the ProductPort API so the web app stays same-origin.
    return [{ source: '/api/:path*', destination: `${process.env.API_ORIGIN || 'http://localhost:4006'}/api/:path*` }];
  },
};

// Wrap with Sentry for source-map upload (SENTRY_AUTH_TOKEN at build time) and
// the /monitoring tunnel that routes Sentry traffic through the Next.js server
// to bypass ad-blockers. Mirrors the fleet (opsport/salesport) wiring.
module.exports = withSentryConfig(withNextIntl(nextConfig), {
  org:               process.env.SENTRY_ORG     || 'microport-c0',
  project:           process.env.SENTRY_PROJECT || 'productport-web',
  authToken:         process.env.SENTRY_AUTH_TOKEN,
  silent:            !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute:       '/monitoring',
  webpack: {
    treeshake: { removeDebugLogging: true },
  },
});
