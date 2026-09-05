// web/lib/help/searchDocs.test.ts
import { describe, it, expect } from 'vitest';
import { buildSearchDocs } from './searchDocs';
import { GALLERY_POPOVER, CLEARANCE_POPOVER, getPopoverTitle } from './popovers';
import { HELP_CONTENT_SLUGS, getHelpContent } from './content';

describe('buildSearchDocs', () => {
  it('includes one article-kind doc per content slug, plus 2 popover-kind docs', () => {
    const docs = buildSearchDocs('en-US');
    const articleDocs = docs.filter(d => d.kind === 'article');
    const popoverDocs  = docs.filter(d => d.kind === 'popover');
    expect(articleDocs.map(d => d.slug).sort()).toEqual([...HELP_CONTENT_SLUGS].sort());
    expect(popoverDocs).toHaveLength(2);
    // No third store exists — nothing may land without a kind tag.
    expect(docs.filter(d => d.kind !== 'article' && d.kind !== 'popover')).toHaveLength(0);
  });

  it('every popover doc carries a targetHref and no article-only fields leak in wrong', () => {
    const docs = buildSearchDocs('en-US');
    for (const d of docs.filter(d => d.kind === 'popover')) {
      expect(d.targetHref).toBe('/');
      expect(d.roles).toEqual(['product_admin', 'superuser']);
    }
  });

  it('the gallery and clearance popover docs carry their real summary text in body', () => {
    const docs = buildSearchDocs('en-US');
    const gallery = docs.find(d => d.slug === 'product-edit-gallery-popover')!;
    const clearance = docs.find(d => d.slug === 'product-edit-clearance-popover')!;
    expect(gallery.body).toContain(GALLERY_POPOVER.summary);
    expect(clearance.body).toContain(CLEARANCE_POPOVER.summary);
  });

  it('article docs walk roleBlocks and surface their body text', () => {
    // Admin articles (product-create/edit, csv-import) are gated at the
    // registry, not with roleBlocks; the two viewer-visible articles each
    // carry a roleBlock under their "For product administrators" section.
    const docs = buildSearchDocs('en-US');
    const catalogBrowse = docs.find(d => d.slug === 'catalog-browse')!;
    const productDetail = docs.find(d => d.slug === 'product-detail')!;
    expect(catalogBrowse.body).toContain('Verify (dry run) checks a CSV file against the catalog');
    expect(productDetail.body).toContain('Enable puts a disabled product back in the catalog');
    // Labels declared inside a roleBlock are collected too.
    expect(catalogBrowse.labels).toContain('Verify (dry run)');
  });

  it('the product-edit body keeps Clearance as the umbrella term', () => {
    const docs = buildSearchDocs('en-US');
    const productEdit = docs.find(d => d.slug === 'product-edit')!;
    expect(productEdit.body).toContain('Clearance');
  });

  it('resolves the localized corpus for zh/fr from the full locale code', () => {
    const zh = buildSearchDocs('zh-CN');
    const fr = buildSearchDocs('fr-FR');
    expect(zh.find(d => d.slug === 'catalog-browse')!.title).toBe(getHelpContent('catalog-browse', 'zh-CN')!.title);
    expect(fr.find(d => d.slug === 'catalog-browse')!.title).toBe(getHelpContent('catalog-browse', 'fr-FR')!.title);
    expect(zh.find(d => d.slug === 'product-edit-gallery-popover')!.title).toBe(getPopoverTitle('gallery', 'zh-CN'));
    // The localized title must differ from English, or the locale was silently dropped.
    expect(zh.find(d => d.slug === 'catalog-browse')!.title).not.toBe(getHelpContent('catalog-browse', 'en-US')!.title);
  });
});
