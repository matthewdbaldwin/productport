// Sentry user context — the opaque internal user id ONLY (#119).
//
// "Users Impacted" on every Sentry issue reads 0 unless events carry a user,
// and a distinct id is all Sentry needs to count. Nothing else is ever sent:
// no email, no display name, no role. These are internal B2B apps under
// legitimate interests, and an opaque id counts users just as well without
// exporting personal data to a third-party processor in another jurisdiction.
// A human handle, if ever needed, resolves from the id inside HubPort.
//
// This module is deliberately the ONLY caller of Sentry.setUser in the web
// client, and it only accepts an id, so the "no PII" guarantee is structural
// (lib/sentryUser.test.ts inspects the exact object handed to the SDK).
//
// Wiring (ProductPort): contexts/AuthContext.tsx calls setSentryUser when
// /api/auth/me resolves and clearSentryUser when it 401s, and again in the
// logout callback (components/profile/SignOutSection.tsx is a thin button
// that only calls useAuth().logout — it never touches Sentry directly).
// The same shape is meant to be copied verbatim into every satellite.
import * as Sentry from '@sentry/nextjs';

/** Attach the current user to every subsequent Sentry event — id only. */
export function setSentryUser(id: number | string | null | undefined): void {
  if (id === null || id === undefined || id === '') { clearSentryUser(); return; }
  try {
    Sentry.setUser({ id: String(id) });
  } catch {
    // Observability must never be able to break auth: a throwing SDK would
    // otherwise land in AuthContext's .catch and sign the user out.
  }
}

/** Drop the user from the scope — on sign-out and on a signed-out probe. */
export function clearSentryUser(): void {
  try { Sentry.setUser(null); } catch { /* see setSentryUser */ }
}
