import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// hubport#113 — ProductPort's sign-out control lives in the profile modal
// (fleet decision #101). Mirrors SalesPort's two SignOutSection tests, plus
// the no-network proof: the control delegates to useAuth().logout and never
// calls fetch/api itself, so AuthContext's server-first ordering stays the
// single source of truth. Test id follows ProductPort's idFor kebab rule
// (`profile.signOut` → `profile-sign-out`), not SalesPort's literal.

const h = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ logout: h.logout }) }));

import { SignOutSection } from './SignOutSection';

beforeEach(() => { h.logout.mockClear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('SignOutSection', () => {
  test('renders a sign-out button using the profile namespace signOut key', () => {
    render(<SignOutSection />);
    expect(screen.getByTestId('profile-sign-out')).toHaveTextContent('signOut');
  });

  test('clicking it calls useAuth().logout exactly once and makes no network call of its own', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    render(<SignOutSection />);
    fireEvent.click(screen.getByTestId('profile-sign-out'));
    expect(h.logout).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
