// web/app/help/page.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'viewer', email: 'v@microport.com', name: null }, loading: false }),
}));
vi.mock('@/lib/help/searchMiss', () => ({ recordHelpSearchMiss: vi.fn() }));

import HelpIndexPage from './page';

// Rendered with the REAL en messages so a missing `help.*` key fails here,
// not in prod (same convention as ProfileModal.test.tsx).
function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <HelpIndexPage />
    </NextIntlClientProvider>,
  );
}

describe('/help index', () => {
  it('lists every visible section with its live items', () => {
    renderPage();
    expect(screen.getByText('Help Library')).toBeTruthy();
    // Item labels are the articles' own titles, not the registry's en labels.
    expect(screen.getByText('Browsing and filtering the catalog')).toBeTruthy();
    expect(screen.getByText('Signing in')).toBeTruthy();
    expect(screen.queryByText('Browse & filter')).toBeNull();
  });

  it('hides admin-only items from a plain viewer', () => {
    renderPage();
    expect(screen.queryByText('Add a product')).toBeNull();
    expect(screen.queryByText('Adding a product')).toBeNull();
    expect(screen.queryByText('Product administration')).toBeNull();
  });

  it('typing a query swaps the section cards for ranked, role-gated results', () => {
    renderPage();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'catalog' } });
    const hit = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/help/catalog-browse');
    expect(hit).toBeTruthy();
    expect(screen.getByText(/^\d+ results?$/)).toBeTruthy();
    expect(screen.queryByText('Help Library')).not.toBeNull(); // header stays
    // Admin-only docs never surface for a viewer, even through search.
    expect(screen.queryByText('CSV import and export')).toBeNull();
    expect(screen.queryByText('Managing product images')).toBeNull();
  });
});
