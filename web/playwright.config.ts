import { defineConfig, devices } from '@playwright/test';

/**
 * ProductPort — Playwright e2e config
 *
 * BASE_URL (when set) targets a live env and suppresses the local webServer.
 * Local runs boot the dev server on 3100 (avoid the 3001 collision trap).
 * feedback_playwright_railway.
 *
 * Authenticated runs need a portal the SSO handshake can reach and a seeded
 * admin — see e2e/auth.setup.ts for the full three-host flow:
 *   TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \
 *     BASE_URL=https://product-dev.microport.com npx playwright test --project=chromium
 *
 * Public-only (no credentials, no portal):
 *   npx playwright test --project=public
 */

/**
 * Local escape hatch for hosts Playwright ships no browser download for.
 *
 * `npx playwright install chromium` HARD-FAILS on Ubuntu 26.04 — "Playwright
 * does not support chromium on ubuntu26.04-x64" — so without an override the
 * suite cannot run on this devbox at all, and the help-media capture pass runs
 * on exactly this devbox. See reference_footgun_dev_ci_skips_playwright_e2e.
 *
 *   PLAYWRIGHT_CHROMIUM=/path/to/chrome   pin an already-downloaded build
 *   PLAYWRIGHT_CHANNEL=chrome             use system-installed Google Chrome
 *
 * Both unset in CI, which runs on a supported image and keeps the pinned build.
 */
const browser = process.env.PLAYWRIGHT_CHROMIUM
  ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM } }
  : process.env.PLAYWRIGHT_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHANNEL }
    : {};

const baseURL = process.env.BASE_URL || 'http://localhost:3100';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL },

  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...browser },
    },
    {
      // Runs signed OUT, so it must not depend on `setup` and must not inherit
      // storageState. smoke.spec.ts deliberately drives /login?sso_err=no_role
      // to reach the loop-guard dead-end; handing it a session would redirect it
      // straight home and the assertions would pass against the wrong page.
      name: 'public',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], ...browser },
    },
    {
      name: 'chromium',
      testIgnore: /smoke\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        ...browser,
        storageState: './e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],

  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'npm run dev', url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
