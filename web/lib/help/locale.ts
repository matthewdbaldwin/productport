// web/lib/help/locale.ts
// The help library's locale normaliser, split out of content.ts so that
// popovers.ts (which needs only this) has no dependency on the article
// registry — content.ts imports every article module, and the popovers are
// wired into ProductEditModal.tsx, so that import edge would drag the whole
// article corpus into the editor bundle.
import { LOCALES } from '@/lib/locales';

export type HelpLocale = 'en' | 'zh' | 'fr';

/** Maps a full BCP-47-style code (e.g. 'en-US') to this repo's short file
 *  code, via the same LOCALES table web/i18n.ts uses — not a bespoke regex.
 *  Unknown codes fall back to 'en'. */
export function normalizeLocale(locale: string): HelpLocale {
  const found = LOCALES.find(l => l.code === locale);
  return (found?.file as HelpLocale | undefined) ?? 'en';
}
