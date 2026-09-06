// web/e2e/help-captures/catalog-browse.admin.capture.ts
// Help clip for the "catalog-browse" article: narrowing 400+ products down to
// the handful you actually want.
//
// Why this slug: catalog-browse is the one article whose subject is a
// *sequence* rather than a screen. The catalog page loads the whole (small)
// catalog once and does all search / filter / detail in memory
// (web/lib/catalogFilter.js), so the filters compose with AND and the count
// line updates live — "417 in catalog" to "55" to "13" as each facet lands.
// A screenshot of the filter bar cannot convey that the facets stack; watching
// the number fall does.
//
// Role: admin. auth.setup.ts produces .auth/admin.json alone, and admin is a
// superset of the Viewer surface this article describes — the extra Add
// product / Import / Export chrome sits in the toolbar but is not driven here.
//
// Seed data: the committed catalog snapshot, `node prisma/seed.js` against a
// LOCAL database (prisma/seed-data/seed_products.csv, 417 rows). The three
// counts this capture walks through were computed from that snapshot through
// the real filterProducts()/clearanceStatus() code, not eyeballed:
//   all                                        417
//   + first therapeutic area ("Coronary and
//     Structural Heart", by orderedAreas())     55
//   + CE market                                 13
//   search "knee" from a cleared state          25
// The area filter is chosen positionally (`.first()`) rather than by name so
// the capture does not hardcode a facet the data may drop, but note the ORDER
// matters: "Coronary and Structural Heart" + "knee" is 0 products, so the
// search beat comes after Clear filters, never on top of the area filter.
//
// Selectors verified in web/app/page.tsx (NS = 'catalog'; data-testid values
// are lib/i18nIds.ts's kebab(`${ns}.${key}`)):
//   testId(NS,'search')            -> "catalog-search"              (line 499)
//   testId(NS,'count')             -> "catalog-count"               (line 626)
//   testId(NS,`areaPill-…`)        -> "catalog-area-pill-…"         (line 559)
//   testId(NS,`marketPill-CE`)     -> "catalog-market-pill-ce"      (line 602)
//   testId(NS,'clearFilters')      -> "catalog-clear-filters"       (line 622)
//   testId(NS,`productCard-<id>`)  -> "catalog-product-card-<id>"   (line 636)
//   testId(NS,'closeDetail')       -> "catalog-close-detail"        (line 194)
// The detail dialog itself carries NO data-testid — only role="dialog" and
// aria-labelledby="pp-modal-title" (line 192) — so it is matched on that pair
// rather than on role alone, which ProfileModal would also answer to.
//
// ⚠ If the clip trips build.js's 25s gate, that is the first paint of a cold
// `next dev` compile, not the scripted beats (~15s). Trim it with a sidecar
// rather than cutting a beat: pass { trimStart: <seconds> } to saveClip().

import { test, expect, settle, clickAt, poster, saveClip } from './helpers/clip';

const SLUG = 'catalog-browse';
const NAME = 'filter-and-search';

const COUNT   = '[data-testid="catalog-count"]';
const SEARCH  = '[data-testid="catalog-search"]';
const AREA    = '[data-testid^="catalog-area-pill-"]';
const CE      = '[data-testid="catalog-market-pill-ce"]';
const CLEAR   = '[data-testid="catalog-clear-filters"]';
const CARD    = '[data-testid^="catalog-product-card-"]';
const CLOSE   = '[data-testid="catalog-close-detail"]';
const DETAIL  = '[role="dialog"][aria-labelledby="pp-modal-title"]';

test('browse the catalog — stack two facets, clear them, then search', async ({ page }) => {
  await page.goto('/');

  // The page renders null until AuthContext resolves AND the catalog fetch
  // lands, so the count line is the real "ready" signal — not networkidle,
  // which a still-hydrating page can reach with an empty grid.
  await expect(page.locator(COUNT)).toBeVisible({ timeout: 30_000 });
  await settle(page, 700);

  // Facet 1: therapeutic area. Positional, so no seeded area name is baked in.
  await clickAt(page, AREA);
  await settle(page, 600);

  // Facet 2: regulatory market. AND, not OR — the count falls again rather
  // than growing, which is the whole point of the beat.
  await clickAt(page, CE);
  await settle(page, 700);
  await expect(page.locator(CARD).first()).toBeVisible();

  // Poster: the filtered grid with both facets lit and the count line showing
  // the narrowed number. This is the frame a reduced-motion reader sees
  // instead of the video, so it is taken at the most informative moment
  // rather than at the end.
  await poster(page, SLUG, NAME);

  // Clear before searching. "Clear filters" only exists while a filter is
  // active (page.tsx:622 renders it behind `hasFilters`), so its presence
  // here is itself an assertion that the two facets took.
  await clickAt(page, CLEAR);
  await settle(page, 700);

  // Free text spans name / tagline / indication / category / type / subsidiary
  // (catalogFilter.js filterProducts) — "knee" hits 25 of the 417 seeded rows,
  // mostly through the "Knee systems" category.
  await clickAt(page, SEARCH);
  await page.keyboard.type('knee', { delay: 130 });
  await settle(page, 900);
  await expect(page.locator(CARD).first()).toBeVisible();

  // Detail is part of browsing, not a separate article: one click from a
  // result to the product.
  await clickAt(page, CARD);
  await expect(page.locator(DETAIL)).toBeVisible();
  await settle(page, 1200);

  await clickAt(page, CLOSE);
  await settle(page, 500);

  await saveClip(page, SLUG, NAME);
});
