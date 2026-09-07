/**
 * e2e/capture.setup.ts
 * Seeds the storageState the help-media capture harness runs against, without
 * a HubPort IdP in the loop. Runs as the "setup" project of
 * playwright.help-capture.config.ts ONLY — the main playwright.config.ts's
 * own "setup" project matches auth.setup.ts specifically and does not pick
 * this file up (see its testMatch, narrowed for exactly this reason).
 *
 * NO LOGIN UI IS DRIVEN, and none could be. e2e/auth.setup.ts drives the
 * hub's branded front-door login form, but that needs a reachable HubPort IdP
 * and a hub seed holding a user matching what the form expects — locally
 * neither exists, so that setup has never actually run here. The capture
 * specs have therefore never run either.
 *
 * Instead each session is minted directly by helpers/mint-session.cjs with
 * the throwaway keypair the local API is configured to trust (ticket 01), and
 * set as the HttpOnly `productport_token` cookie — ProductPort's session is
 * cookie-only (src/lib/cookies.js), there is no localStorage token.
 *
 * Writes to the SAME path auth.setup.ts writes to (./e2e/.auth/admin.json):
 * playwright.help-capture.config.ts's per-role project already reads that
 * path, and the two setups are never run back to back for the same target —
 * the deployed mesh carries the hub key and never sees the capture pair, and
 * the local environment currently has no hub key configured at all, so
 * auth.setup.ts cannot succeed locally regardless of which ran last.
 *
 * Two proofs before anything is written. OpsPort learned why: a storageState
 * snapshotted from a session that does not actually authenticate fails every
 * later spec as a redirect loop that never names setup as the culprit.
 *   1. GET /api/auth/me with the cookie answers 200 for the minted identity.
 *   2. A browser holding the cookie lands on the app at BASE_URL's ORIGIN,
 *      with the root layout's own /api/auth/me probe (web/lib/api.ts)
 *      answering 200 and no bounce to /login. Origin, not host: locally the
 *      app and any broker are both "localhost" and differ only by port, so a
 *      host check proves nothing.
 */

import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { mintSession, COOKIE_NAME } from './helpers/mint-session.cjs';

const AUTH_DIR = path.join(__dirname, '.auth');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

// mint-session.cjs's own defaults already resolve to this identity; spelled
// out here so a reader does not have to cross-reference the helper to know
// who the capture harness signs in as.
export const PRINCIPALS = {
  admin: { email: 'admin@microport.com', name: 'Admin User', role: 'product_admin', sub: 1 },
} as const;
export const ROLES = Object.keys(PRINCIPALS) as Array<keyof typeof PRINCIPALS>;

for (const role of ROLES) {
  const principal = PRINCIPALS[role];
  setup(`mint ${role} session`, async ({ request, browser }) => {
    const { token, expiresAt } = mintSession(principal);
    const base = new URL(BASE_URL);

    // 1. The API accepts the cookie for this identity.
    const me = await request.get('/api/auth/me', { headers: { cookie: `${COOKIE_NAME}=${token}` } });
    expect(me.status(), `GET /api/auth/me answered ${me.status()}: ${await me.text()}`).toBe(200);
    const body = (await me.json()) as { email: string; role: string };
    expect(body.email).toBe(principal.email);
    expect(body.role).toBe(principal.role);

    // 2. A browser holding it lands on the app, not on /login.
    const context = await browser.newContext({ baseURL: BASE_URL });
    await context.addCookies([{
      name: COOKIE_NAME,
      value: token,
      domain: base.hostname,
      path: '/',
      httpOnly: true,
      secure: base.protocol === 'https:',
      sameSite: 'Lax',
      expires: expiresAt,
    }]);
    const page = await context.newPage();
    // web/lib/api.ts's auto-logout brake only fires off a 401 whose path
    // includes '/auth/me', so that probe's status is the decisive signal.
    // Exact path: /api/auth/me/theme (web/lib/theme.ts) is a different call.
    const probe = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/me');
    const shell = await page.goto('/');
    // Name a broken app shell as such. Without this, a 500 from the dev
    // server (a stale .next cache does it) surfaces only as the probe
    // timing out.
    expect(shell?.status(), `GET / answered ${shell?.status()} — the app shell itself failed`).toBeLessThan(400);
    expect((await probe).status()).toBe(200);
    const landed = new URL(page.url());
    expect(landed.origin).toBe(base.origin);
    expect(landed.pathname).not.toMatch(/^\/login/);

    fs.mkdirSync(AUTH_DIR, { recursive: true });
    await context.storageState({ path: path.join(AUTH_DIR, `${role}.json`) });
    await context.close();
  });
}
