// web/components/help/HelpLauncher.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// vi.hoisted so the mocks exist before vi.mock's hoisted factories run (the
// pattern searchMiss.test.ts / AuthContext.test.tsx use).
const h = vi.hoisted(() => ({ push: vi.fn(), recordHelpSearchMiss: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push, replace: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'product_admin', email: 'a@microport.com', name: null, locale: 'en-US' }, loading: false }),
}));
vi.mock('@/lib/help/searchMiss', () => ({ recordHelpSearchMiss: h.recordHelpSearchMiss }));

import { HelpLauncher } from './HelpLauncher';

beforeEach(() => { h.push.mockClear(); h.recordHelpSearchMiss.mockClear(); });

describe('HelpLauncher', () => {
  it('renders the Help toggle', () => {
    render(<HelpLauncher />);
    expect(screen.getByTestId('help-dropdown-toggle')).toBeTruthy();
  });

  it('navigates to /help/<slug> when an article result is chosen', () => {
    render(<HelpLauncher />);
    fireEvent.click(screen.getByTestId('help-dropdown-toggle'));
    fireEvent.change(screen.getByTestId('help-dropdown-input'), { target: { value: 'catalog' } });
    const result = screen.getAllByRole('button').find(b => b.textContent?.includes('Browsing and filtering'));
    fireEvent.click(result!);
    expect(h.push).toHaveBeenCalledWith('/help/catalog-browse');
  });

  it('navigates to targetHref when a popover result is chosen', () => {
    render(<HelpLauncher />);
    fireEvent.click(screen.getByTestId('help-dropdown-toggle'));
    fireEvent.change(screen.getByTestId('help-dropdown-input'), { target: { value: 'gallery' } });
    const result = screen.getAllByRole('button').find(b => b.textContent?.includes('Managing product images'));
    fireEvent.click(result!);
    expect(h.push).toHaveBeenCalledWith('/');
  });

  it('links the full library at /help', () => {
    render(<HelpLauncher />);
    fireEvent.click(screen.getByTestId('help-dropdown-toggle'));
    expect(screen.getByTestId('help-dropdown-view-library').getAttribute('href')).toBe('/help');
  });
});
