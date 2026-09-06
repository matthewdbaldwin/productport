import { test, expect } from '@playwright/test';

// Day-one smoke — login → SSO entry. Uses the testId convention so e2e coverage
// starts non-zero. reference_testid_naming_convention.
test('login page offers SSO and does not loop', async ({ page }) => {
  // Land on /login with an explicit error so the loop-guard dead-ends instead of
  // auto-redirecting to the portal front door (which we don't drive here).
  await page.goto('/login?sso_err=no_role');
  // Match the HEADING, not bare text: the no_role dead-end body also contains
  // the word "ProductPort" ("You don't have access to ProductPort…"), so a
  // getByText() here is a strict-mode violation the moment that copy exists.
  await expect(page.getByRole('heading', { name: 'ProductPort' })).toBeVisible();
  await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();
});
