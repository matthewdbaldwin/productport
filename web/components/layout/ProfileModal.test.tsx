import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';

// hubport#113 — the profile modal is the canonical home of ProductPort's
// sign-out control (there is no sidebar to put one in). Rendered with the
// REAL en messages so a missing `profile.signOut` key fails here, not in prod.

const auth = vi.hoisted(() => ({ logout: vi.fn() }));
const USER = { id: 1, email: 'a@b.c', name: 'Ada', role: 'product_admin' };
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: USER, loading: false, logout: auth.logout }),
}));
// Same stub set ProductEditModal.test.tsx uses: keep the echarts/canvas ESM
// bundle out of jsdom.
vi.mock('@matthewdbaldwin/microport-ui', () => ({
  useModalEsc: () => {},
  useFocusTrap: () => ({ current: null }),
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/ui/ThemePicker', () => ({ ThemePicker: () => null }));

import { ProfileModal } from './ProfileModal';

function renderModal() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ProfileModal open onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => { auth.logout.mockClear(); });

describe('ProfileModal sign-out (hubport#113)', () => {
  it('renders the sign-out control with the profile namespace signOut message', () => {
    renderModal();
    expect(screen.getByTestId('profile-sign-out')).toHaveTextContent('Sign out');
  });

  it('clicking sign-out delegates to useAuth().logout exactly once', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('profile-sign-out'));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
});
