// web/lib/help/sectionTitles.test.ts
import { describe, it, expect } from 'vitest';
import { getSectionTitle, localizedSections } from './sectionTitles';
import { HELP_SECTIONS } from './sections';
import en from '@/messages/en.json';
import zh from '@/messages/zh.json';
import fr from '@/messages/fr.json';

const KEYS: Record<string, string> = { catalog: 'sectionCatalog', admin: 'sectionAdmin', account: 'sectionAccount' };

describe('help section titles', () => {
  it('every registry section has a title key in all three message files', () => {
    for (const section of HELP_SECTIONS) {
      const key = KEYS[section.id];
      expect(key, `no message key mapped for section "${section.id}"`).toBeTruthy();
      for (const [name, msgs] of [['en', en], ['zh', zh], ['fr', fr]] as const) {
        expect((msgs.help as Record<string, string>)[key], `${name}.json help.${key}`).toBeTruthy();
      }
    }
  });

  it('the English message matches the registry fallback title', () => {
    for (const section of HELP_SECTIONS) {
      expect(getSectionTitle(section.id, 'en-US')).toBe(section.title);
      expect(getSectionTitle(section.id)).toBe(section.title);
    }
  });

  it('resolves zh/fr from the full locale code and differs from English', () => {
    expect(getSectionTitle('admin', 'zh-CN')).toBe(zh.help.sectionAdmin);
    expect(getSectionTitle('admin', 'fr-FR')).toBe(fr.help.sectionAdmin);
    expect(getSectionTitle('admin', 'zh-CN')).not.toBe(getSectionTitle('admin', 'en-US'));
    // Unknown codes fall back to English rather than throwing.
    expect(getSectionTitle('catalog', 'de-DE')).toBe(en.help.sectionCatalog);
  });

  it('localizedSections swaps only the titles', () => {
    const localized = localizedSections('zh-CN');
    expect(localized.map(s => s.id)).toEqual(HELP_SECTIONS.map(s => s.id));
    localized.forEach((s, i) => {
      expect(s.items).toBe(HELP_SECTIONS[i].items);
      expect(s.title).toBe(getSectionTitle(s.id, 'zh-CN'));
    });
    // The registry itself is left alone.
    expect(HELP_SECTIONS.find(s => s.id === 'admin')!.title).toBe('Product administration');
  });
});
