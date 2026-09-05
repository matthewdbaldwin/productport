// web/lib/help/sectionTitles.ts
// Localized titles for the HELP_SECTIONS registry. sections.ts keeps its
// English `title` as the fallback — scripts/help-audit.js regex-parses that
// file, so it must stay flat single-quoted literals — and the zh/fr titles
// live in the `help` namespace of messages/*.json (sectionCatalog /
// sectionAdmin / sectionAccount). Reads the bundled message files directly
// (the HelpArticleClient getStrings pattern) rather than a hook, so the
// search corpus (searchDocs.ts) and non-hook callers can use it too.
//
// `locale` is the full 'en-US' | 'zh-CN' | 'fr-FR' code, normalised here
// once via the same normalizeLocale getHelpContent uses.
import { HELP_SECTIONS, type HelpSection } from './sections';
import { normalizeLocale, type HelpLocale } from './locale';
import { DEFAULT_LOCALE } from '@/lib/locales';
import en from '@/messages/en.json';
import zh from '@/messages/zh.json';
import fr from '@/messages/fr.json';

const SECTION_KEY: Record<string, string> = {
  catalog: 'sectionCatalog',
  admin:   'sectionAdmin',
  account: 'sectionAccount',
};

const HELP_MESSAGES: Record<HelpLocale, Record<string, string>> = { en: en.help, zh: zh.help, fr: fr.help };

/** The section's title in the requested locale, falling back to English
 *  (the messages/en.json value, then the registry's own `title`) so a section
 *  with no translation still renders. Unknown ids come back as the id. */
export function getSectionTitle(id: string, locale: string = DEFAULT_LOCALE): string {
  const registryTitle = HELP_SECTIONS.find(s => s.id === id)?.title ?? id;
  const key = SECTION_KEY[id];
  if (!key) return registryTitle;
  return HELP_MESSAGES[normalizeLocale(locale)][key] ?? HELP_MESSAGES.en[key] ?? registryTitle;
}

/** HELP_SECTIONS with each `title` swapped for its localized value. Items are
 *  the registry's own objects, untouched. */
export function localizedSections(locale: string = DEFAULT_LOCALE): HelpSection[] {
  return HELP_SECTIONS.map(section => ({ ...section, title: getSectionTitle(section.id, locale) }));
}
