/**
 * e2e/auth.setup.ts
 * Signs in as admin once and saves the browser storage state, so the rest of
 * the suite (and the help-media capture pass) starts already authenticated
 * instead of driving the login UI in every spec.
 *
 * FLOW (three hosts, not two). ProductPort is SSO-only:
 *   1. /login auto-redirects to /api/auth/sso/start,
 *   2. which 302s to `${PORTAL_WEB}/login?sso=productport&returnTo=<web>/auth/callback`,
 *   3. the portal authenticates and mints a 60s one-time handoff code,
 *   4. /auth/callback POSTs that code to /api/auth/sso/exchange, which relays to
 *      the IdP and sets the HttpOnly `productport_token` cookie,
 *   5. then a FULL navigation home.
 *
 * ⚠ The broker is the HUB front door, not SalesPort — `PORTAL_WEB` resolves
 * `PORTAL_WEB_URL` FIRST and only falls back to the CRM host (src/routes/auth.js).
 * Several comments in the login page and auth.js still say "SalesPort login";
 * they predate the branded-front-door cutover. Drive the hub's form testids
 * (`login-identifier` / `login-password` / `login-submit`), which is why this
 * file matches opsport's harness rather than reviewport's older local-form one.
 *
 * Modelled on clinicport's harness (the one whose hop chain was curl-verified
 * against the live mesh) rather than opsport's, which predates the chooser.
 *
 * Against the deployed dev mesh:
 *   TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \
 *     BASE_URL=https://product-dev.microport.com npx playwright test --project=chromium
 */

import { test as setup, expect, errors } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';

const authFile = path.join(__dirname, '.auth', 'admin.json');
const APP_ORIGIN = process.env.BASE_URL || 'http://localhost:3100';
const EMAIL      = process.env.TEST_USER_EMAIL    || 'cross-admin@test.local';
const PASSWORD   = process.env.TEST_USER_PASSWORD || 'Test1234!';

// The session cookie the SSO exchange sets. Asserted below by name: a storage
// state saved WITHOUT it looks fine on disk and turns every later test into a
// login loop, which is a miserable thing to debug from the far end.
const SESSION_COOKIE = 'productport_token';

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');

  // /login → /api/auth/sso/start → the portal's form. Generous timeout: this is
  // two redirects across hosts, and on a cold dev server the first compile of
  // the login route dominates.
  // The broker fronts a passkey-first chooser (data-testid "panel-choose", open
  // by default) that renders ON TOP of the identifier/password form and
  // INTERCEPTS clicks on login-submit — the fields underneath still fill fine,
  // so this fails at the submit, not at the typing, which makes it look like a
  // credentials problem. Live finding from clinicport's harness (2026-08-31,
  // verified against the dev mesh); opsport's original predates it and does not
  // dismiss the chooser. Optional by design: if some environment doesn't show
  // it, we fall through to the identifier wait below unchanged.
  const usePassword = page.getByTestId('login-use-password');

  // ⚠ ONLY a timeout may be swallowed here. The blanket `.catch(() => false)`
  // this replaced also ate a strict-mode violation (two nodes matching the
  // testid) and a closed page, and then SKIPPED the dismissal — leaving the
  // chooser to intercept the submit and resurface as a credentials failure,
  // which is the exact bug this block exists to prevent. Verified against
  // Playwright 1.61.1 (2026-09-06): an absent element throws
  // errors.TimeoutError; a strict violation throws a plain Error. They separate.
  let chooserShown = true;
  try {
    await usePassword.waitFor({ state: 'visible', timeout: 10_000 });
  } catch (err) {
    if (!(err instanceof errors.TimeoutError)) throw err;
    chooserShown = false;
  }
  // The click stays OUTSIDE the try: click() times out when something covers
  // the button, and that timeout is a real failure, not an absent chooser.
  if (chooserShown) await usePassword.click();

  await expect(page.getByTestId('login-identifier')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('login-identifier').fill(EMAIL);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();

  // Wait until we are back on the APP's own origin AND off both the login and
  // callback routes. Matching on the app origin rather than on "the host isn't
  // the hub" because locally every host is localhost and only the port differs,
  // so a host-substring check silently passes while still on the broker.
  // Leaving the callback matters as much as leaving the login form: the code
  // exchange happens THERE, so a state snapshotted mid-handshake has no session
  // cookie yet.
  const appOrigin = new URL(APP_ORIGIN).origin;
  await page.waitForURL(
    (url) => url.origin === appOrigin && !/^\/(login|auth\/callback)\b/.test(url.pathname),
    { timeout: 25_000 },
  );
  await page.waitForLoadState('networkidle');

  // Fail loudly HERE if the handshake did not actually stick. Without this the
  // setup goes green, writes a logged-out state, and the failure resurfaces as
  // unrelated redirect loops in whatever spec happens to run first.
  // Capture WITHOUT `path` so nothing reaches disk yet. Writing first and
  // asserting second left a signed-OUT admin.json behind after every failed run,
  // and the next run loaded it without complaint. Assert, THEN write — and write
  // the very object that was asserted, because a second storageState({ path })
  // call re-captures and could differ from what actually passed.
  const state = await page.context().storageState();
  const names = state.cookies.map((c) => c.name);
  expect(
    names,
    `no ${SESSION_COOKIE} cookie after SSO — landed on ${page.url()} holding a ` +
      `signed-OUT state; cookies present: ${names.join(', ') || '(none)'}`,
  ).toContain(SESSION_COOKIE);

  // Playwright used to create this directory as a side effect of `path`; it no
  // longer runs, so make it ourselves.
  await fs.mkdir(path.dirname(authFile), { recursive: true });
  await fs.writeFile(authFile, JSON.stringify(state, null, 2));
});
