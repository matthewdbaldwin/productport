// next.config.js — MUST be .js, never .ts. A next.config.ts builds fine locally
// and breaks the production build. feedback_next_config_ts_prod.
const createNextIntlPlugin = require('next-intl/plugin');
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

module.exports = withNextIntl(nextConfig);
