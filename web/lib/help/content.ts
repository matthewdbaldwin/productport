// web/lib/help/content.ts
// Content registry — slug -> typed article module, locale-aware.
//
// normalizeLocale lives in ./locale (split out so popovers.ts can use it
// without dragging this registry — and every article module — into the
// ProductEditModal bundle); it is re-exported here so callers that only know
// the registry (searchDocs.ts, the /help pages, content.test.ts) keep a
// single import.
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';
import { normalizeLocale, type HelpLocale } from './locale';

import catalogBrowseEn from './content/catalog-browse';
import catalogBrowseZh from './content/catalog-browse.zh';
import catalogBrowseFr from './content/catalog-browse.fr';
import productDetailEn from './content/product-detail';
import productDetailZh from './content/product-detail.zh';
import productDetailFr from './content/product-detail.fr';
import productCreateEn from './content/product-create';
import productCreateZh from './content/product-create.zh';
import productCreateFr from './content/product-create.fr';
import productEditEn from './content/product-edit';
import productEditZh from './content/product-edit.zh';
import productEditFr from './content/product-edit.fr';
import csvImportEn from './content/csv-import';
import csvImportZh from './content/csv-import.zh';
import csvImportFr from './content/csv-import.fr';
import loginEn from './content/login';
import loginZh from './content/login.zh';
import loginFr from './content/login.fr';

export { normalizeLocale } from './locale';
export type { HelpLocale } from './locale';

const EN: Record<string, HelpArticleContent> = {
  'catalog-browse': catalogBrowseEn, 'product-detail': productDetailEn,
  'product-create': productCreateEn, 'product-edit': productEditEn,
  'csv-import': csvImportEn, 'login': loginEn,
};
const ZH: Record<string, HelpArticleContent> = {
  'catalog-browse': catalogBrowseZh, 'product-detail': productDetailZh,
  'product-create': productCreateZh, 'product-edit': productEditZh,
  'csv-import': csvImportZh, 'login': loginZh,
};
const FR: Record<string, HelpArticleContent> = {
  'catalog-browse': catalogBrowseFr, 'product-detail': productDetailFr,
  'product-create': productCreateFr, 'product-edit': productEditFr,
  'csv-import': csvImportFr, 'login': loginFr,
};

const BY_LOCALE: Record<HelpLocale, Record<string, HelpArticleContent>> = { en: EN, zh: ZH, fr: FR };

/** The article in the requested locale (a full 'en-US' | 'zh-CN' | 'fr-FR'
 *  code — the same vocabulary useAuth().user.locale and next-intl speak),
 *  falling back to English so a partly-translated library always renders.
 *  null when the slug has no article at all. */
export function getHelpContent(slug: string, locale: string = 'en-US'): HelpArticleContent | null {
  const l = normalizeLocale(locale);
  return BY_LOCALE[l]?.[slug] ?? EN[slug] ?? null;
}
export const HELP_CONTENT_SLUGS: string[] = Object.keys(EN);
