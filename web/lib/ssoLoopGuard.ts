// SSO auto-redirect brake.
//
// The three auto-redirecting satellites (productport, EngagePort, execport)
// send an unauthenticated visitor straight to /api/auth/sso/start with no
// human in the loop, so they need a machine brake or a failing session loops
// forever. The other five apps render a login FORM — the user is the brake —
// which is why only these three carry this module.
//
// Extracted from app/login/page.tsx 2026-07-31 so the brake is UNIT-TESTABLE.
// It previously lived inline as one try/catch that returned `false` ("no loop")
// on ANY storage exception. That is fail-OPEN, and it disabled the brake in
// precisely the browser most likely to throw: Safari with "Block all cookies"
// (and private-mode variants) throws on sessionStorage ACCESS, not just write.
// A browser refusing storage is also refusing the session cookie, so the login
// could never succeed AND the brake could never trip. See ssoLoopGuard.test.ts.

export const LOOP_WINDOW_MS = 12_000;
export const LOOP_MAX = 2; // a 3rd redirect inside the window is a loop

/**
 * Record a redirect attempt and report whether we are in a runaway loop.
 * Returns TRUE (brake on → dead-end to the manual button) when storage is
 * unavailable, because an uncountable loop must be assumed to be a loop.
 *
 * @param key  per-app sessionStorage key, e.g. 'productport_sso_attempts'
 * @param now  injectable clock for tests
 */
export function tripsLoop(key: string, now: number = Date.now()): boolean {
  let store: Storage;
  try {
    store = window.sessionStorage;
    store.getItem(key); // Safari throws HERE when storage is blocked.
  } catch {
    return true; // cannot count → fail CLOSED
  }

  // A corrupt/hand-edited value is NOT a storage failure: treat it as an empty
  // history so the write below self-heals, rather than dead-ending the user
  // permanently on a bad JSON blob.
  let hist: number[] = [];
  try {
    const parsed: unknown = JSON.parse(store.getItem(key) || '[]');
    if (Array.isArray(parsed)) hist = parsed.filter((t): t is number => typeof t === 'number');
  } catch { /* corrupt → empty */ }

  const recent = hist.filter((t) => now - t < LOOP_WINDOW_MS);
  recent.push(now);

  try {
    store.setItem(key, JSON.stringify(recent));
  } catch {
    return true; // quota/blocked on write → also uncountable → fail CLOSED
  }

  return recent.length > LOOP_MAX;
}

/** Reset the counter — the manual "Try again" path re-enters SSO once. */
export function clearLoop(key: string): void {
  try { window.sessionStorage.removeItem(key); } catch { /* ignore */ }
}
