import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
// The panel container is microport-ui's ProfileModal (v0.60) and is rendered
// for real — only the local ThemePicker is stubbed, to keep the echarts/canvas
// ESM bundle out of jsdom.
vi.mock('@/components/ui/ThemePicker', () => ({ ThemePicker: () => null }));

import { ProfileModal } from './ProfileModal';

function renderModal(locale = 'en-US') {
  return render(
    <NextIntlClientProvider locale={locale} messages={en}>
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

// productport#8 — nothing wrote the NEXT_LOCALE cookie web/i18n.ts reads, so
// every user was stuck on the default locale. The profile modal's language
// picker is the writer.
describe('ProfileModal language picker (productport#8)', () => {
  const reload = vi.fn();
  const realLocation = window.location;

  beforeEach(() => {
    reload.mockClear();
    document.cookie = 'NEXT_LOCALE=; path=/; max-age=0';
    // jsdom does not implement navigation; stub reload so the click is observable.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, reload },
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  });

  it('renders one option per shipped locale, with the current one pressed', () => {
    renderModal('en-US');
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByTestId('profile-modal-locale-en-us')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('profile-modal-locale-zh-cn')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('profile-modal-locale-fr-fr')).toHaveAttribute('aria-pressed', 'false');
  });

  it('choosing a language writes the NEXT_LOCALE cookie and reloads', () => {
    renderModal('en-US');
    fireEvent.click(screen.getByTestId('profile-modal-locale-fr-fr'));
    expect(document.cookie).toContain('NEXT_LOCALE=fr-FR');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('choosing the already-active language is a no-op', () => {
    renderModal('en-US');
    fireEvent.click(screen.getByTestId('profile-modal-locale-en-us'));
    expect(document.cookie).not.toContain('NEXT_LOCALE=');
    expect(reload).not.toHaveBeenCalled();
  });
});
