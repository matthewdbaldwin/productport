// web/components/layout/AppCommandPalette.test.tsx
// Shallow test for the app-wide ⌘K palette (productport#27). The shared
// CommandPalette and helpCommandGroup are stubbed so this pins only what
// ProductPort owns: the auth gate (no user → renders nothing) and how a help
// result routes (popover → its targetHref or nowhere; article → /help/<slug>).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';

const h = vi.hoisted(() => ({
  user: null as unknown,
  push: vi.fn(),
  onSelect: null as null | ((r: unknown) => void),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push, replace: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: h.user, loading: false }) }));
vi.mock('@matthewdbaldwin/microport-ui', () => ({
  CommandPalette: ({ label }: { label: string }) => <div data-testid="palette-stub">{label}</div>,
}));
vi.mock('@matthewdbaldwin/microport-ui/help', () => ({
  helpCommandGroup: (opts: { onSelect: (r: unknown) => void }) => {
    h.onSelect = opts.onSelect;
    return { id: 'help', heading: 'Help', items: [] };
  },
}));

import { AppCommandPalette } from './AppCommandPalette';

const USER = { id: 1, role: 'viewer', email: 'v@microport.com', name: null, locale: 'en-US' };

function renderPalette() {
  return render(
    <NextIntlClientProvider locale="en-US" messages={en}>
      <AppCommandPalette />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  h.push.mockClear();
  h.onSelect = null;
});

describe('AppCommandPalette', () => {
  it('renders nothing without a signed-in user', () => {
    h.user = null;
    const { container } = renderPalette();
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('palette-stub')).toBeNull();
    expect(h.onSelect).toBeNull();
  });

  it('renders the palette for a signed-in user', () => {
    h.user = USER;
    renderPalette();
    expect(screen.getByTestId('palette-stub')).toHaveTextContent(en.palette.label);
  });

  it('a popover result with a targetHref navigates there', () => {
    h.user = USER;
    renderPalette();
    h.onSelect!({ kind: 'popover', slug: 'gallery', targetHref: '/' });
    expect(h.push).toHaveBeenCalledWith('/');
    expect(h.push).toHaveBeenCalledTimes(1);
  });

  it('a popover result without a targetHref goes nowhere (never /help/<slug>)', () => {
    h.user = USER;
    renderPalette();
    h.onSelect!({ kind: 'popover', slug: 'gallery' });
    expect(h.push).not.toHaveBeenCalled();
  });

  it('an article result navigates to /help/<slug>', () => {
    h.user = USER;
    renderPalette();
    h.onSelect!({ kind: 'article', slug: 'catalog-browse' });
    expect(h.push).toHaveBeenCalledWith('/help/catalog-browse');
  });
});
