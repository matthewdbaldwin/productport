// web/components/help/HelpArticleClient.media.test.tsx
// Pins the exact regression HelpArticleClient.tsx's own comment names: since
// getStrings returns Partial<HelpViewStrings>, a dropped mediaPlay/mediaPause
// key typechecks fine and silently falls back to the shared lib's English
// defaults — "OpsPort shipped clips with exactly that gap." This renders the
// real catalog-browse article (the one live media block ProductPort ships)
// signed in as each locale and asserts the actual button text on screen, not
// just that the strings object carries the right values.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';

type User = { id: number; role: string; email: string; name: null; locale: string };

const h = vi.hoisted(() => ({ user: null as unknown }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/help/catalog-browse',
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: h.user, loading: false }),
}));

import { HelpArticleClient } from './HelpArticleClient';

// HelpArticleView's TOC tracking needs an IntersectionObserver; MediaFigure's
// clip-visibility autoplay needs one too. jsdom provides neither.
class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

const VIEWER = (locale: string): User => ({ id: 1, role: 'viewer', email: 'v@microport.com', name: null, locale });

function renderCatalogBrowse(locale: string) {
  h.user = VIEWER(locale);
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <HelpArticleClient slug="catalog-browse" />
    </NextIntlClientProvider>,
  );
}

describe('HelpArticleClient — media block Play/Pause labels', () => {
  it('en-US: the clip control reads "Play", not a fallback', () => {
    renderCatalogBrowse('en-US');
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('zh-CN: the clip control reads 播放, not the English default', () => {
    renderCatalogBrowse('zh-CN');
    expect(screen.getByRole('button', { name: '播放' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
  });

  it('fr-FR: the clip control reads Lire, not the English default', () => {
    renderCatalogBrowse('fr-FR');
    expect(screen.getByRole('button', { name: 'Lire' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
  });
});
