'use client';

// SSO callback — SalesPort redirects here with ?code=<one-time>. The shared
// SsoCallbackPage POSTs it to /api/auth/sso/exchange, which relays to the hub's
// handoff exchange and sets the HttpOnly productport_token cookie. On success we
// stash the token for the theme writer + apply the user's theme, then go home.
// On a NO_*_ROLE / failed exchange the shared page dead-ends (no re-loop into
// /sso/start). feedback_sso_callback_loop_trap.
//
// The "Help with signing in" link below points at /help/login, the one help
// article the /help layout serves to signed-out visitors. SsoCallbackPage has
// no hint / extra-content slot and its error state is internal (useSsoCallback
// runs inside it, with no onError), so the link is rendered ALWAYS, pinned to
// the bottom of the shared page's full-height <main> rather than after it,
// where it would sit below the fold. On the success path the page navigates
// away before anyone reads it.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { reconcileThemeWithUser } from '@/lib/theme';
import { SsoCallbackPage } from '@matthewdbaldwin/microport-ui';

const SIGN_IN_HELP_HREF = '/help/login';

export default function Page() {
  const router = useRouter();
  const t = useTranslations('auth');
  const tHelp = useTranslations('help');
  return (
    <div className="relative">
      <SsoCallbackPage
        onToken={(token, data) => {
          // Both side-effects are BEST-EFFORT and must never fail the login.
          // The shared SsoCallbackPage calls onToken *inside* the exchange
          // promise and reports any throw via its .catch() as "exchange failed"
          // — so an unguarded localStorage write turned a SUCCESSFUL exchange
          // (HttpOnly cookie already set) into a dead-end error page on any
          // browser that refuses storage, e.g. Safari with "Block all cookies".
          // Guarded independently so a theme failure can't skip the token cache.
          try { localStorage.setItem('productport_token', token); } catch { /* storage blocked */ }
          // Apply the SSO-returned theme before navigating so we don't flash the
          // previous device's theme until AuthContext's /api/auth/me resolves.
          try { if (data) reconcileThemeWithUser(data.user?.theme ?? null); } catch { /* storage blocked */ }
        }}
        // FULL navigation, not router.replace: the root-layout AuthProvider
        // already ran its one-shot /auth/me probe when this page loaded — before
        // the exchange set the cookie — so its `user` is still null. A client-side
        // replace keeps that stale null, the home page bounces straight back to
        // /login, and each bounce burns a loop-brake count (LOOP_MAX=2). A real
        // navigation remounts the provider, which re-probes WITH the fresh cookie.
        onSuccess={(next) => window.location.replace(next || '/')}
        onBack={() => router.push('/')}
        messages={{
          completing:     t('callbackCompleting'),
          backToSignIn:   t('callbackBack'),
          exchangeFailed: t('callbackExchangeFailed'),
          noToken:        t('callbackNoToken'),
        }}
      />
      <p className="absolute inset-x-0 bottom-8 text-center text-sm">
        <Link href={SIGN_IN_HELP_HREF} className="hover:underline" style={{ color: 'var(--muted2)' }}>
          {tHelp('signInHelpLink')}
        </Link>
      </p>
    </div>
  );
}
