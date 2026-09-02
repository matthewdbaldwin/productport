// web/lib/auth.ts — the auth-layer sign-out (hubport#113, 2026-09-02).
//
// ProductPort had no sign-out at all: the backend POST /api/auth/logout
// existed (revokes the Session row, clears the HttpOnly cookies, fires the
// upstream refresh-token revoke that ends the user's HubPort session and
// refresh family fleet-wide) but nothing in the frontend called it. This is
// the one function that does. AuthContext.logout awaits it, then clears the
// local user and routes to /login; the profile-modal SignOutSection only
// delegates to that — never to fetch/api itself.
//
// It never throws. A 401 means the session is already gone (cookie expired
// or revoked elsewhere in the fleet) — that is a sign-out that already
// happened, not an error. Any other failure is also swallowed, matching the
// opsport/execport/salesport helpers: the credential is an HttpOnly cookie
// only the server can clear, so there is nothing the browser can do about a
// failed revoke except let the next /auth/me probe re-auth honestly.
import { api } from '@/lib/api';

export async function logout(): Promise<void> {
  try {
    // keepalive: survives a navigation that starts before the response lands.
    await api('/api/auth/logout', { method: 'POST', keepalive: true });
  } catch {
    /* 401 = already signed out; anything else = best-effort, see above */
  }
}
