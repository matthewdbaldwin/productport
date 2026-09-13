import { test, expect } from '@playwright/test';

// Regression guard for a CSS custom property that is CONSUMED but never
// DEFINED — the failure mode where `background: var(--overlay)` resolves to
// nothing and an overlay paints fully transparent.
//
// Ported from hubport's e2e/overlay-token.spec.ts (matthewdbaldwin/hubport#144).
// productport used to carry `var(--overlay, rgba(0, 0, 0, 0.5))` as a DEAD
// local fallback in web/app/globals.css — the fallback never actually applied
// (the microport-ui `themes.css` import already supplies `--overlay`), but if
// that import or the token were ever dropped, productport would have silently
// rendered a lighter 0.5 scrim instead of failing loudly the way every other
// satellite would. The fallback is now gone; this guard makes the
// missing-token failure mode visible instead of silent.
//
// Only assertion (a) from hubport's guard is ported. hubport's assertion (b)
// drives a pre-auth "contact-admin" modal that opens straight from /login with
// no session. productport has exactly one `bg-overlay` consumer —
// components/BugReportButton.tsx's report modal — and it is explicitly
// auth-gated ("Never render on the logged-out /login page"), so there is no
// pre-auth modal here to substitute. Landing (a) alone still catches the real
// regression this guard exists for: the token silently resolving to nothing.
//
// This spec forces a clean, cookie-less context via `test.use` rather than
// relying on the `public` Playwright project (whose testMatch only covers
// smoke.spec.ts) — that keeps the check unauthenticated regardless of which
// project picks this file up, without editing playwright.config.ts.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('--overlay resolves to a painted value', () => {
  test('the token is defined on the document root', async ({ page }) => {
    // /login redirects straight to SSO (window.location.href = /api/auth/sso/start)
    // unless it's landed on with an explicit deny code, which trips the loop
    // guard's dead-end instead — same route smoke.spec.ts uses to reach a
    // stable, unauthenticated page without driving the live SSO hop.
    await page.goto('/login?sso_err=no_role');
    await expect(page.getByRole('heading', { name: 'ProductPort' })).toBeVisible();

    const overlay = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--overlay').trim(),
    );

    // An undefined custom property reads back as the empty string.
    expect(overlay, '--overlay is consumed by bg-overlay but never assigned').not.toBe('');
  });
});
