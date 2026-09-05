// web/lib/help/searchDocs.ts
// Flattens the 6 live articles + the 2 contextual popovers into the
// HelpSearchDoc[] shape the shared search engine (searchHelp/
// searchHelpFuzzy) consumes.
//
// `locale` is the full 'en-US' | 'zh-CN' | 'fr-FR' code and is handed straight
// to getHelpContent / getPopoverContent, which each normalise it once.
// (Normalising here first and passing the short code down would be wrong:
// normalizeLocale only recognises the full codes in LOCALES, so a bare 'zh'
// would fall back to 'en' — the plan's original double-normalise silently
// rendered every non-English corpus in English.)
import { HELP_CONTENT_SLUGS, getHelpContent } from './content';
import { lookupHelpItem } from './sections';
import { getSectionTitle } from './sectionTitles';
import { getPopoverContent, getPopoverTitle } from './popovers';
import type { HelpBlock, HelpSearchDoc } from '@matthewdbaldwin/microport-ui/help/logic';
import type { HelpContent } from '@matthewdbaldwin/microport-ui/help';

function walk(blocks: HelpBlock[], body: string[], labels: string[]): void {
  for (const b of blocks) {
    if (b.kind === 'paragraph') { body.push(b.text); if (b.labels) labels.push(...b.labels); }
    else if (b.kind === 'list')  { body.push(...b.items); if (b.labels) labels.push(...b.labels); }
    else if (b.kind === 'steps') { body.push(...b.steps); if (b.labels) labels.push(...b.labels); }
    else if (b.kind === 'faq')   { b.items.forEach(qa => body.push(qa.q, qa.a)); if (b.labels) labels.push(...b.labels); }
    else if (b.kind === 'roleBlock') { walk(b.blocks, body, labels); }
  }
}

// Both popovers live in ProductEditModal, so they file under the `admin`
// section (same title the product-create/edit articles carry).
function popoverDoc(slug: string, title: string, content: HelpContent, locale: string): HelpSearchDoc {
  const body = [content.summary, ...content.bullets.map(b => (typeof b === 'string' ? b : b.text))];
  return {
    slug, title, sectionTitle: getSectionTitle('admin', locale),
    body: body.join(' '), kind: 'popover', targetHref: '/',
    roles: ['product_admin', 'superuser'],
  };
}

export function buildSearchDocs(locale: string = 'en-US'): HelpSearchDoc[] {
  const docs: HelpSearchDoc[] = [];
  for (const slug of HELP_CONTENT_SLUGS) {
    const content = getHelpContent(slug, locale);
    if (!content) continue;
    const entry = lookupHelpItem(slug);
    const body: string[] = [content.intro];
    const labels: string[] = [];
    for (const section of content.sections) walk(section.blocks, body, labels);
    docs.push({
      slug, title: content.title, sectionTitle: entry ? getSectionTitle(entry.section.id, locale) : '',
      headings: content.sections.map(s => s.heading), labels,
      body: body.join(' '), roles: entry?.item.roles, kind: 'article',
    });
  }
  docs.push(popoverDoc('product-edit-gallery-popover', getPopoverTitle('gallery', locale), getPopoverContent('gallery', locale), locale));
  docs.push(popoverDoc('product-edit-clearance-popover', getPopoverTitle('clearance', locale), getPopoverContent('clearance', locale), locale));
  return docs;
}
