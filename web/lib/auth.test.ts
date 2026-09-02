import { describe, it, expect, afterEach, vi } from 'vitest';
import { logout } from './auth';

// hubport#113 — ProductPort's first sign-out function (there was none: the
// backend logout route existed and nothing called it). These pin the wire
// shape through the REAL api() wrapper (so the CSRF header and cookie mode
// are proven, not mocked) and the one contract the profile-modal control
// relies on: logout() never throws, so the local sign-out always completes.

function mockFetch(status: number, body: unknown = {}) {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('logout() — the auth-layer sign-out', () => {
  it("POSTs to ProductPort's own logout route with the CSRF header and cookies", async () => {
    const fetchMock = mockFetch(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await logout();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/logout');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('X-Requested-With')).toBe('productport-web');
  });

  it('treats a 401 from the logout route as already signed out (resolves, does not throw)', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'unauthenticated' }));
    await expect(logout()).resolves.toBeUndefined();
  });

  it('still resolves on a server failure so the local sign-out completes', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { error: 'boom' }));
    await expect(logout()).resolves.toBeUndefined();
  });
});
