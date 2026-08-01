// next.config.js — MUST be .js, never .ts. A next.config.ts builds fine locally
// and breaks the production build. feedback_next_config_ts_prod.
const createNextIntlPlugin = require('next-intl/plugin');
const { withSentryConfig } = require('@sentry/nextjs');
const { version } = require('./package.json');
const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack (the Next 16 build default) emits NO client source maps, and
  // @sentry/nextjs only auto-enables them on the webpack path -- so prod stacks
  // arrived minified and Sentry had nothing to upload. Verified in EngagePort
  // 2026-08-01: 0 maps before, 31 after. Sentry deletes them post-upload.
  productionBrowserSourceMaps: true,
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
  // Was `!process.env.CI`, but CI is not forwarded as a docker build-arg, so it
  // evaluated true inside the container and Sentry printed nothing whether it
  // uploaded or not -- a build log that could not fail. Log unconditionally.
  silent:            false,
  widenClientFileUpload: true,
  // Maps must not survive into the served image (prod maps 404 today; keep it
  // that way). Explicit rather than trusting the plugin default.
  sourcemaps: {
    filesToDeleteAfterUpload: ['.next/static/**/*.map'],
  },
  tunnelRoute:       '/monitoring',
  webpack: {
    treeshake: { removeDebugLogging: true },
  },
});
