'use client';

// SSO callback — SalesPort redirects here with ?code=<one-time>. The shared
// SsoCallbackPage POSTs it to /api/auth/sso/exchange, which relays to the hub's
// handoff exchange and sets the HttpOnly productport_token cookie. On success we
// stash the token for the theme writer + apply the user's theme, then go home.
// On a NO_*_ROLE / failed exchange the shared page dead-ends (no re-loop into
// /sso/start). feedback_sso_callback_loop_trap.
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { reconcileThemeWithUser } from '@/lib/theme';
import { SsoCallbackPage } from '@matthewdbaldwin/microport-ui';

export default function Page() {
  const router = useRouter();
  const t = useTranslations('auth');
  return (
    <SsoCallbackPage
      onToken={(token, data) => {
        localStorage.setItem('productport_token', token);
        // Apply the SSO-returned theme before navigating so we don't flash the
        // previous device's theme until AuthContext's /api/auth/me resolves.
        if (data) reconcileThemeWithUser(data.user?.theme ?? null);
      }}
      onSuccess={() => router.replace('/')}
      onBack={() => router.push('/')}
      messages={{
        completing:     t('callbackCompleting'),
        backToSignIn:   t('callbackBack'),
        exchangeFailed: t('callbackExchangeFailed'),
        noToken:        t('callbackNoToken'),
      }}
    />
  );
}
