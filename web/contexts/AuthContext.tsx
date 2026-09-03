'use client';

// Minimal auth context — probes /api/auth/me once and exposes
// { user, loading, logout }.
// The 401 on /auth/me is the ONLY thing that should bounce to /login
// (handled in lib/api.ts). feedback_proxy_401_cascade.
//
// logout (hubport#113, 2026-09-02): AWAITS lib/auth.ts logout() — the server
// clears the HttpOnly cookies and revokes the HubPort session + refresh
// family fleet-wide — and only THEN clears the local user and routes to
// /login. The order matters more here than in opsport/execport (which
// fire-and-forget): ProductPort's /login auto-starts SSO with no human
// brake, so navigating first could hand the user straight back in through
// a still-live hub session. Local sign-out completes even if the server
// call fails (lib/auth.ts never throws; the catch is belt-and-braces).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { logout as authLogout } from '@/lib/auth';
import { setSentryUser, clearSentryUser } from '@/lib/sentryUser';

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
  isSuperuser?: boolean;
  appRoles?: Record<string, unknown>;
  theme?: string | null;
  locale?: string | null;
}

interface AuthState { user: AuthUser | null; loading: boolean; }
interface AuthContextValue extends AuthState { logout: () => Promise<void>; }
const Ctx = createContext<AuthContextValue>({ user: null, loading: true, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    api<AuthUser>('/api/auth/me')
      .then((user) => {
        if (!alive) return;
        // Sentry "Users Impacted" — opaque id only, never a personal field (#119).
        setSentryUser(user?.id);
        setState({ user, loading: false });
      })
      .catch(() => {
        if (!alive) return;
        clearSentryUser();
        setState({ user: null, loading: false });
      });
    return () => { alive = false; };
  }, []);

  const logout = useCallback(async () => {
    try { await authLogout(); } catch { /* never throws by contract; local sign-out completes regardless */ }
    clearSentryUser();
    setState({ user: null, loading: false });
    router.push('/login');
  }, [router]);

  const value = useMemo(() => ({ ...state, logout }), [state, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
