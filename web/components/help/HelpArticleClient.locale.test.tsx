// web/components/help/HelpArticleClient.locale.test.tsx
// productport#27: help content follows the ACTIVE UI locale (next-intl, set by
// the ProfileModal language switcher via NEXT_LOCALE), not the account's saved
// locale. Falls back to the saved locale, then English.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import zh from '@/messages/zh.json';
import catalogBrowseEn from '@/lib/help/content/catalog-browse';
import catalogBrowseFr from '@/lib/help/content/catalog-browse.fr';
import catalogBrowseZh from '@/lib/help/content/catalog-browse.zh';
import { resolveHelpLocale } from '@/lib/help/useHelpLocale';

const h = vi.hoisted(() => ({ user: null as unknown }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/help/catalog-browse',
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: h.user, loading: false }),
}));

import { HelpArticleClient } from './HelpArticleClient';

class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

const MESSAGES = { 'en-US': en, 'fr-FR': fr, 'zh-CN': zh } as const;

function renderAs(uiLocale: keyof typeof MESSAGES, savedLocale: string | null) {
  h.user = { id: 1, role: 'viewer', email: 'v@microport.com', name: null, locale: savedLocale };
  return render(
    <NextIntlClientProvider locale={uiLocale} messages={MESSAGES[uiLocale]}>
      <HelpArticleClient slug="catalog-browse" />
    </NextIntlClientProvider>,
  );
}

describe('HelpArticleClient follows the active UI locale', () => {
  it('switcher fr-FR over a saved en-US account renders the French article', () => {
    renderAs('fr-FR', 'en-US');
    expect(screen.getAllByText(catalogBrowseFr.title).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(catalogBrowseEn.title)).toHaveLength(0);
  });

  it('switcher en-US over a saved zh-CN account renders the English article', () => {
    renderAs('en-US', 'zh-CN');
    expect(screen.getAllByText(catalogBrowseEn.title).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(catalogBrowseZh.title)).toHaveLength(0);
  });
});

describe('resolveHelpLocale fallback order', () => {
  it('prefers a known next-intl locale', () => {
    expect(resolveHelpLocale('zh-CN', 'fr-FR')).toBe('zh-CN');
  });
  it('falls back to the saved locale when the UI locale is missing or unknown', () => {
    expect(resolveHelpLocale(null, 'fr-FR')).toBe('fr-FR');
    expect(resolveHelpLocale('en', 'zh-CN')).toBe('zh-CN');
  });
  it('falls back to en-US when neither is a known locale', () => {
    expect(resolveHelpLocale(undefined, null)).toBe('en-US');
    expect(resolveHelpLocale('de-DE', 'xx')).toBe('en-US');
  });
});
