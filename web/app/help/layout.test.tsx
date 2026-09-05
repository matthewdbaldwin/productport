// web/app/help/layout.test.tsx
// The /help auth gate and its single exemption: a signed-out visitor may read
// /help/login (the "Signing in" article exists for people who cannot sign in)
// and nothing else. Renders the REAL HelpArticleClient under the layout so the
// null-user render path is exercised end to end, not just the redirect.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';

type User = { id: number; role: string; email: string; name: null; locale?: string } | null;

// vi.hoisted so the mocks exist before vi.mock's hoisted factories run (the
// pattern HelpLauncher.test.tsx / AuthContext.test.tsx use). pathname and
// user are mutable so each test picks its own route and auth state.
const h = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  pathname: '/help',
  user: null as unknown,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: h.replace, push: h.push }),
  usePathname: () => h.pathname,
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: h.user, loading: false }),
}));

import HelpLayout from './layout';
import { HelpArticleClient } from '@/components/help/HelpArticleClient';

const VIEWER: User = { id: 1, role: 'viewer', email: 'v@microport.com', name: null, locale: 'en-US' };

// HelpArticleView tracks the active TOC heading with an IntersectionObserver,
// which jsdom does not provide.
class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}

beforeEach(() => {
  h.replace.mockClear();
  h.push.mockClear();
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

function renderAt(pathname: string, user: User, slug?: string) {
  h.pathname = pathname;
  h.user = user;
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <HelpLayout>{slug ? <HelpArticleClient slug={slug} /> : <div>index body</div>}</HelpLayout>
    </NextIntlClientProvider>,
  );
}

const linkHrefs = () => screen.queryAllByRole('link').map((a) => a.getAttribute('href'));

describe('/help layout auth gate', () => {
  it('signed out at /help/login renders the article without redirecting', () => {
    renderAt('/help/login', null, 'login');
    expect(h.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Signing in' })).toBeTruthy();
    // Bare shell: no library link, no related cards or pager into other articles.
    expect(screen.queryByText('Help Library')).toBeNull();
    expect(linkHrefs()).not.toContain('/help/catalog-browse');
    expect(linkHrefs().filter((href) => href?.startsWith('/help/'))).toEqual([]);
    expect(screen.getByText('Back to ProductPort')).toBeTruthy();
  });

  it('signed out at /help/catalog-browse redirects to /login and renders nothing', () => {
    const { container } = renderAt('/help/catalog-browse', null, 'catalog-browse');
    expect(h.replace).toHaveBeenCalledWith('/login');
    expect(container.textContent).toBe('');
  });

  it('signed out at the /help index redirects to /login', () => {
    const { container } = renderAt('/help', null);
    expect(h.replace).toHaveBeenCalledWith('/login');
    expect(container.textContent).toBe('');
  });

  it('signed in at /help/login gets the full shell with the library link and related cards', () => {
    renderAt('/help/login', VIEWER, 'login');
    expect(h.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Signing in' })).toBeTruthy();
    expect(screen.getByText('Help Library')).toBeTruthy();
    // login.related = ['catalog-browse'], visible to a viewer — proves the
    // guest case above hid it because of the gate, not a rendering quirk.
    expect(linkHrefs()).toContain('/help/catalog-browse');
  });
});
