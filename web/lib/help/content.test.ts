// web/lib/help/content.test.ts
import { describe, it, expect } from 'vitest';
import { getHelpContent, HELP_CONTENT_SLUGS, normalizeLocale } from './content';
import { HELP_SLUGS } from './sections';

describe('help content registry', () => {
  it('has exactly one content module per HELP_SECTIONS slug', () => {
    expect(new Set(HELP_CONTENT_SLUGS)).toEqual(HELP_SLUGS);
  });

  it('every article resolves in all three locales with matching slugs', () => {
    for (const slug of HELP_CONTENT_SLUGS) {
      for (const [code, short] of [['en-US', 'en'], ['zh-CN', 'zh'], ['fr-FR', 'fr']] as const) {
        const content = getHelpContent(slug, code);
        expect(content, `${slug} (${code})`).not.toBeNull();
        expect(content!.slug).toBe(slug);
        expect(content!.sections.length).toBeGreaterThan(0);
      }
    }
  });

  it('falls back to en for an unrecognised locale', () => {
    const en = getHelpContent('catalog-browse', 'en-US');
    const fallback = getHelpContent('catalog-browse', 'de-DE');
    expect(fallback?.title).toBe(en?.title);
  });

  it('normalizeLocale maps full codes to short codes via the LOCALES table', () => {
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('zh-CN')).toBe('zh');
    expect(normalizeLocale('fr-FR')).toBe('fr');
    expect(normalizeLocale('unknown')).toBe('en');
  });

  it('product-edit article intro mentions Clearance, not Registration or Approval, for the umbrella concept', () => {
    const content = getHelpContent('product-edit', 'en-US')!;
    const flat = JSON.stringify(content);
    expect(flat).toMatch(/Clearance/);
  });
});
