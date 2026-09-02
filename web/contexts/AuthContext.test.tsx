import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// hubport#113 — AuthContext gains `logout`: awaits the auth-layer sign-out
// (lib/auth.ts), then clears the local user and routes to /login. The order
// is the point: ProductPort's /login auto-starts SSO with no human brake, so
// navigating before the cookie clear + hub revoke complete could hand the
// user straight back in through a still-live hub session.

const h = vi.hoisted(() => ({ logout: vi.fn(), push: vi.fn(), api: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: h.api }));
vi.mock('@/lib/auth', () => ({ logout: h.logout }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push, replace: vi.fn() }) }));

import { AuthProvider, useAuth } from './AuthContext';

function Consumer() {
  const { user, loading, logout } = useAuth();
  if (loading) return <div>loading</div>;
  return (
    <div>
      <div data-testid="who">{user ? user.email : 'anonymous'}</div>
      <button type="button" onClick={() => { void logout(); }}>sign out</button>
    </div>
  );
}

async function renderSignedIn() {
  render(<AuthProvider><Consumer /></AuthProvider>);
  expect(await screen.findByTestId('who')).toHaveTextContent('a@b.c');
}

beforeEach(() => {
  h.logout.mockReset().mockResolvedValue(undefined);
  h.push.mockReset();
  h.api.mockReset().mockResolvedValue({ id: 1, email: 'a@b.c', name: null, role: 'product_admin' });
});

describe('AuthContext.logout (hubport#113)', () => {
  it('calls the auth-layer sign-out once, clears the user, and routes to /login', async () => {
    await renderSignedIn();
    fireEvent.click(screen.getByText('sign out'));
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('anonymous'));
    expect(h.logout).toHaveBeenCalledTimes(1);
    expect(h.push).toHaveBeenCalledWith('/login');
  });

  it('does not route to /login until the server sign-out has completed', async () => {
    let finish!: () => void;
    h.logout.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    await renderSignedIn();
    fireEvent.click(screen.getByText('sign out'));
    await Promise.resolve();
    expect(h.push).not.toHaveBeenCalled();
    finish();
    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/login'));
  });

  it('still clears the user and routes to /login when the auth-layer sign-out rejects', async () => {
    h.logout.mockRejectedValue(new Error('network down'));
    await renderSignedIn();
    fireEvent.click(screen.getByText('sign out'));
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('anonymous'));
    expect(h.push).toHaveBeenCalledWith('/login');
  });
});
