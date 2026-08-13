# ProductPort Help Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up ProductPort's Help Library — a searchable article system covering all six of the PRD's logical views (catalog browse, product detail, product create, product edit + two contextual popovers, CSV import, login), built from day one at `@matthewdbaldwin/microport-ui` 0.39.1's shared bar (Fuse.js fuzzy fallback, popover+article search indexing, `HelpSearchMiss` analytics, a live-search dropdown entry point) — with no wave-splitting, matching the PRD's approved scope.

**Architecture:** A ProductPort-local `HELP_SECTIONS` registry (Task 2) — with a `components[]` field per item instead of the route-keyed shape other satellites use, since ProductPort's whole authenticated UI is one SPA route (`/`) — drives the `/help` route tree (Task 6) and the search corpus (Task 4). All six registry items ship `status:'live'` immediately; there are no stubs, because the PRD explicitly rejected wave-splitting. The two Product-edit sub-section popovers (gallery, Clearance matrix) are a separate, smaller content source (Task 4's `popovers.ts`) — not full articles, not registered in `HELP_SECTIONS` — wired directly at their point of use in `ProductEditModal.tsx` (Task 7) via the legacy `HelpButton` component, and indexed into the same search corpus as `kind:'popover'` docs. `HelpSearchMiss` (Task 5) is a new Prisma model + `POST /api/help` write path, mechanically ported from Project 1's shape. Because ProductPort has no existing Profile modal or any dropdown-menu chrome at all (verified — see Task 8), the shared `HelpDropdown` mounts in `CatalogPage`'s persistent top bar instead, next to the existing Hub-exit link. A repo-local `scripts/help-audit.js` (Task 9), adapted from ClinicPort's SPA-aware model, statically cross-checks registry/content/popover consistency.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, next-intl 4 (server-side only — no `useLocale()` hook is used client-side in this codebase), Vitest 2 + `@testing-library/react` (web, jsdom, `**/*.test.{ts,tsx}` per `web/vitest.config.mts`); Express 4 + Prisma (server), Jest 29 + supertest (server tests, `tests/**/*.test.js` per `jest.config.js`, run with `CI=true`); `@matthewdbaldwin/microport-ui` 0.39.1's `help` module (`HelpDropdown`, `HelpCommandPalette`, `createHelpArticleClient`, `HelpButton`, `searchHelp`, `searchHelpFuzzy`, `canSee`, `visibleLiveSectionsFor`).

**Design source:** PRD `project_prd_productport_help_library_2026-08-09` (approved 2026-08-09). Scope = all six logical views, one wave — the PRD explicitly rejected wave-splitting (hubport#44 resolution) because ProductPort's help-surface is small and fully enumerated.

## Global Constraints

- **Dependency target:** `@matthewdbaldwin/microport-ui` `^0.38.1` → `^0.39.1` in `web/package.json:16` (0.39.1, not 0.39.0 — it's a republish of 0.39.0 with an npm10-compatible lockfile; same code, this is the version actually published).
- **Lockfile regeneration MUST use npm 10.9.2 exactly** (`npx -y npm@10.9.2`), matching CI's Node 22 / npm 10 — never the devbox's local npm 11, which silently collapses nested peer-dep pins that CI's `npm ci` then rejects with `EUSAGE`. A green `npm run build` under npm 11 does **not** prove CI will pass; only a clean `npm ci` under npm 10.9.2 does.
- **Node 22** — matches `.github/workflows/ci.yml:19,43` and `security-audit.yml:44`.
- **No new role ladder.** ProductPort's `Role` enum (`viewer, product, product_admin, superuser`) is not extended. `product` is a reserved, not-yet-enforced value (`prisma/schema.prisma:24-27`) — do not gate anything on it.
- **Role gating, locked by the PRD:** catalog browse + product detail = every authenticated user (`viewer` and above, no `roles[]` restriction). Product create, product edit (+ its two popovers), and CSV import = `product_admin` + `superuser` only, matching the routes' own `requireProductAdmin` guard (`src/middleware/auth.js:139`). Login/auth-callback has no in-app help surface (pre-auth) — out of scope for a `HELP_SECTIONS` registration, but still gets a short article reachable once signed in, per the PRD's item 6.
- **All six logical views ship `status: 'live'` from day one.** No wave-splitting, no stubs — this deviates from HubPort's Shell plan (10 stubs + 1 live) precisely because the PRD rejected staging for this app.
- **Server tests are Jest + supertest, `tests/**/*.test.js`, run with `CI=true npm run test:ci`** (`jest.config.js:1-6` — this repo's rate limiter only skips when `CI=true`). **Web tests are Vitest + `@testing-library/react`, `**/*.test.{ts,tsx}`, jsdom** (`web/vitest.config.mts`). Do not mix the two runners' file patterns.
- **Locale format: full BCP-47-style codes client-side (`en-US`/`zh-CN`/`fr-FR`), short codes on disk (`en`/`zh`/`fr`).** `web/lib/locales.ts`'s `LOCALES` table is the single source of truth for that mapping — reuse it, don't reinvent a normalizer. There is no `useLocale()` hook anywhere in this codebase (confirmed by exhaustive grep); locale is read server-side via the `NEXT_LOCALE` cookie (`web/i18n.ts`) and separately exposed client-side via `useAuth().user?.locale` (`AuthUser.locale?: string | null`, `web/contexts/AuthContext.tsx:9-18`) — this plan's `useLocale` port (Task 6) reads from `useAuth()`, not a dedicated i18n hook.
- **Every new user-facing string lands in `en`, `zh`, AND `fr`** (`web/messages/{en,zh,fr}.json`, all three currently hold the same 3 top-level keys: `auth`, `home`, `bug`). Because ProductPort is greenfield — zero prior help content of any kind — **every string this plan introduces, chrome copy AND article prose alike, drafts its zh/fr translation via the local 3090 tier (`ask-local --translate`), never Claude/Opus tokens.** This is a stricter application of the same standing platform delegation policy HubPort's plan used only for new chrome copy — ProductPort has no pre-existing translated content to structurally convert instead.
- **`HelpSearchMiss.userId` uses `onDelete: SetNull`** — a search-miss row is analytics, not owned content that should vanish with its user. There is no local `BugReport` Prisma model in this repo to mirror (bug reports forward synchronously to SalesPort's central queue, `src/routes/bugReports.js`) — `HelpSearchMiss` is written from the PRD's exact spec shape directly, not copied from an existing local analog.
- **`onOpenLegacy` is omitted from the `HelpDropdown` mount** (Task 8) — ProductPort has no legacy help dialog of any kind to open.
- **`scripts/help-audit.js`'s route-coverage check is SPA-aware and component-keyed, not route-keyed** (Task 9) — ProductPort's whole authenticated surface is one page (`web/app/page.tsx`), so `HELP_SECTIONS` items carry a `components[]` field (file paths) instead of `routes[]`, and the audit script's "every entry is unique, no double-coverage" rule is relaxed for this one field, since `product-create` and `product-edit` legitimately share one file (`ProductEditModal.tsx`).
- **Prisma migrations**: run via `npx prisma migrate dev --name <name>`, standard Prisma migrate flow (confirmed no driver-adapter/`prisma.config.mjs` split in this repo — check `prisma/schema.prisma`'s top for a `url =` line before assuming otherwise; if absent, migrations still run the same way).
- **Solo-dev: commit straight to `develop`, no PRs. No `Co-Authored-By:` trailer. Never `git add -A`** — stage the named files in each commit.

---

### Task 1: Dependency bump — microport-ui 0.39.1

**Files:**
- Modify: `web/package.json:16`
- Modify: `web/package-lock.json` (regenerated)
- Test: `web/lib/help/moduleResolution.smoke.test.ts`

**Interfaces:**
- Consumes: nothing (pure dependency bump).
- Produces: resolvable subpaths every later task imports from — `@matthewdbaldwin/microport-ui/help` (`HelpDropdown`, `HelpCommandPalette`, `HelpButton`, `createHelpArticleClient`), `@matthewdbaldwin/microport-ui/help/logic` (`canSee`, `visibleLiveSectionsFor`, `searchHelp`, plus `HelpArticleContent`/`HelpArticleSection`/`HelpBlock`/`HelpSearchDoc`/`HelpSearchResult`/`HelpItemLike`/`HelpSectionLike`/`HelpGateUserLike` types), `@matthewdbaldwin/microport-ui/help/fuzzy` (`searchHelpFuzzy`).

- [ ] **Step 1: Write the failing smoke test**

```ts
// web/lib/help/moduleResolution.smoke.test.ts
// Confirms microport-ui 0.39.1's Help Library subpaths resolve after the
// dependency bump — a pure import-resolution smoke test. If this fails after
// the bump, package-lock.json wasn't actually regenerated against 0.39.1.
import { describe, it, expect } from 'vitest';
import { HelpDropdown, HelpCommandPalette, HelpButton, createHelpArticleClient } from '@matthewdbaldwin/microport-ui/help';
import { canSee, visibleLiveSectionsFor, searchHelp } from '@matthewdbaldwin/microport-ui/help/logic';
import { searchHelpFuzzy } from '@matthewdbaldwin/microport-ui/help/fuzzy';

describe('microport-ui 0.39.1 help subpath resolution', () => {
  it('resolves every symbol this plan depends on', () => {
    expect(typeof HelpDropdown).toBe('function');
    expect(typeof HelpCommandPalette).toBe('function');
    expect(typeof HelpButton).toBe('function');
    expect(typeof createHelpArticleClient).toBe('function');
    expect(typeof canSee).toBe('function');
    expect(typeof visibleLiveSectionsFor).toBe('function');
    expect(typeof searchHelp).toBe('function');
    expect(typeof searchHelpFuzzy).toBe('function');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/mantis/dev/productport/web && npx vitest run lib/help/moduleResolution.smoke.test.ts`
Expected: FAIL — `Error: Failed to resolve import "@matthewdbaldwin/microport-ui/help/fuzzy"` (0.38.1 doesn't publish that subpath, and `HelpDropdown`/`HelpCommandPalette` aren't exported from `./help` yet).

- [ ] **Step 3: Bump the version pin**

```diff
-    "@matthewdbaldwin/microport-ui": "^0.38.1",
+    "@matthewdbaldwin/microport-ui": "^0.39.1",
```

Apply to `web/package.json:16`.

- [ ] **Step 4: Regenerate the lockfile with npm 10.9.2**

```bash
cd /home/mantis/dev/productport/web
git status
NODE_AUTH_TOKEN="$(gh auth token)" npx -y npm@10.9.2 install --no-audit --no-fund
```

Expected: `package-lock.json` updates with `@matthewdbaldwin/microport-ui` at `0.39.1`.

- [ ] **Step 5: Verify with a clean `npm ci` under the same npm version**

```bash
rm -rf node_modules
NODE_AUTH_TOKEN="$(gh auth token)" npx -y npm@10.9.2 ci
npm ls @swc/helpers
```

Expected: `npm ci` completes with no `EUSAGE`; `npm ls @swc/helpers` shows no "invalid" annotations.

- [ ] **Step 6: Run the smoke test again to verify it passes**

Run: `cd /home/mantis/dev/productport/web && npx vitest run lib/help/moduleResolution.smoke.test.ts`
Expected: PASS — 1 test, 8 assertions.

- [ ] **Step 7: Commit**

```bash
cd /home/mantis/dev/productport
git add web/package.json web/package-lock.json web/lib/help/moduleResolution.smoke.test.ts
git commit -m "Bump @matthewdbaldwin/microport-ui to 0.39.1 for the Help Library

Regenerated web/package-lock.json with npm 10.9.2 (matching CI's Node 22 /
npm 10) to avoid the local-npm-11 nested-pin collapse. Verified with a
clean npm ci under npm 10.9.2."
```

---

### Task 2: `HELP_SECTIONS` registry

**Files:**
- Create: `web/lib/help/sections.ts`
- Test: `web/lib/help/sections.test.ts`

**Interfaces:**
- Consumes: `canSee`, `visibleLiveSectionsFor` from `@matthewdbaldwin/microport-ui/help/logic` (Task 1).
- Produces: `HELP_SECTIONS: HelpSection[]`, `HELP_SLUGS: Set<string>`, `lookupHelpItem(slug): { section, item } | undefined`, `HelpItem`/`HelpSection`/`HelpGateUser` types (with `HelpItem.components: string[]` — the SPA-adapted field `help-audit.js` Check 1 keys off, replacing a route-based field), `canSeeHelpItem(user, item): boolean`, `visibleSectionsFor(user): HelpSection[]`. Consumed by Task 4 (`searchDocs.ts`), Task 6 (`HelpArticleClient.tsx` + `/help` routes), Task 8 (`HelpLauncher.tsx`), and Task 9 (`help-audit.js`).

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/help/sections.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HELP_SECTIONS, HELP_SLUGS, lookupHelpItem, canSeeHelpItem } from './sections';

const WEB = path.resolve(__dirname, '../..');

describe('HELP_SECTIONS registry', () => {
  it('registers exactly the 6 logical views from the PRD, all live (no wave-splitting)', () => {
    expect(HELP_SLUGS.size).toBe(6);
    const liveSlugs = HELP_SECTIONS.flatMap(s => s.items).filter(i => i.status === 'live').map(i => i.slug);
    expect(liveSlugs).toHaveLength(6);
  });

  it('every declared component file exists on disk', () => {
    const missing: string[] = [];
    for (const section of HELP_SECTIONS) {
      for (const item of section.items) {
        for (const comp of item.components) {
          if (!fs.existsSync(path.join(WEB, comp))) missing.push(`${item.slug}: ${comp}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('gates product-edit against a plain viewer', () => {
    const entry = lookupHelpItem('product-edit')!;
    expect(canSeeHelpItem({ role: 'viewer' }, entry.item)).toBe(false);
    expect(canSeeHelpItem({ role: 'product_admin' }, entry.item)).toBe(true);
    expect(canSeeHelpItem({ role: 'superuser', isSuperuser: true }, entry.item)).toBe(true);
  });

  it('leaves catalog-browse and product-detail open to any signed-in viewer', () => {
    for (const slug of ['catalog-browse', 'product-detail']) {
      const entry = lookupHelpItem(slug)!;
      expect(canSeeHelpItem({ role: 'viewer' }, entry.item)).toBe(true);
      expect(entry.item.roles).toBeUndefined();
    }
  });

  it('hides csv-import from a viewer', () => {
    const entry = lookupHelpItem('csv-import')!;
    expect(canSeeHelpItem({ role: 'viewer' }, entry.item)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/mantis/dev/productport/web && npx vitest run lib/help/sections.test.ts`
Expected: FAIL — `Error: Failed to resolve import "./sections"`.

- [ ] **Step 3: Write the implementation**

```ts
// web/lib/help/sections.ts
// Help-library section registry — single source of truth for /help's nav,
// role-gated visibility, the search corpus (Task 4), and help-audit.js's
// coverage check (Task 9, Check 1).
//
// All six items ship status:'live' from day one — the PRD explicitly
// rejected wave-splitting (hubport#44), so there is no 'stub' status in use
// here, unlike HubPort's Shell plan.
//
// `components` (ProductPort-specific — replaces the route-keyed `routes[]`
// field other satellites use): ProductPort's whole authenticated UI is one
// SPA route (web/app/page.tsx), so coverage is keyed by which component
// file each logical view's trigger should live in, not by a distinct
// Next.js route. `product-create` and `product-edit` legitimately share
// ProductEditModal.tsx — help-audit.js's uniqueness check is relaxed for
// this field for that reason (see Task 9).
import { canSee, visibleLiveSectionsFor } from '@matthewdbaldwin/microport-ui/help/logic';

export interface HelpItem {
  slug:       string;
  label:      string;
  status:     'live' | 'stub';
  /** Restrict visibility to these roles. Omit for "every signed-in user". */
  roles?:     string[];
  /** Every component file this help topic covers. */
  components: string[];
}

export interface HelpSection {
  id:    string;
  title: string;
  items: HelpItem[];
}

const ADMIN = ['product_admin', 'superuser'];

export const HELP_SECTIONS: HelpSection[] = [
  {
    id:    'catalog',
    title: 'Catalog',
    items: [
      { slug: 'catalog-browse', label: 'Browse & filter', status: 'live', components: ['app/page.tsx'] },
      { slug: 'product-detail', label: 'Product detail',  status: 'live', components: ['app/page.tsx'] },
    ],
  },
  {
    id:    'admin',
    title: 'Product administration',
    items: [
      { slug: 'product-create', label: 'Add a product',       status: 'live', roles: ADMIN, components: ['app/ProductEditModal.tsx'] },
      { slug: 'product-edit',   label: 'Edit a product',       status: 'live', roles: ADMIN, components: ['app/ProductEditModal.tsx'] },
      { slug: 'csv-import',     label: 'CSV import & export',  status: 'live', roles: ADMIN, components: ['app/ImportCsvButton.tsx', 'app/page.tsx'] },
    ],
  },
  {
    id:    'account',
    title: 'Account',
    items: [
      { slug: 'login', label: 'Signing in', status: 'live', components: ['app/login/page.tsx', 'app/auth/callback/page.tsx'] },
    ],
  },
];

export const HELP_SLUGS = new Set(
  HELP_SECTIONS.flatMap(s => s.items.map(i => i.slug)),
);

export function lookupHelpItem(slug: string): { section: HelpSection; item: HelpItem } | undefined {
  for (const section of HELP_SECTIONS) {
    const item = section.items.find(i => i.slug === slug);
    if (item) return { section, item };
  }
  return undefined;
}

export interface HelpGateUser {
  role:         string;
  isSuperuser?: boolean;
}

export function canSeeHelpItem(user: HelpGateUser | null | undefined, item: HelpItem): boolean {
  return canSee(user, item);
}

export function visibleSectionsFor(user: HelpGateUser | null | undefined): HelpSection[] {
  return visibleLiveSectionsFor(HELP_SECTIONS, user) as HelpSection[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/mantis/dev/productport/web && npx vitest run lib/help/sections.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/mantis/dev/productport
git add web/lib/help/sections.ts web/lib/help/sections.test.ts
git commit -m "Add HELP_SECTIONS registry for the Help Library

Registers all 6 logical views live from day one (no wave-splitting, per
the approved PRD). Uses a components[] field keyed to file paths instead
of routes[] — ProductPort's whole authenticated UI is one SPA route."
```

---

### Task 3: Article content — the 5 full articles + the login article

**Files:**
- Create: `web/lib/help/content.ts`
- Create: `web/lib/help/content/catalog-browse.ts` (+ `.zh.ts`, `.fr.ts`)
- Create: `web/lib/help/content/product-detail.ts` (+ `.zh.ts`, `.fr.ts`)
- Create: `web/lib/help/content/product-create.ts` (+ `.zh.ts`, `.fr.ts`)
- Create: `web/lib/help/content/product-edit.ts` (+ `.zh.ts`, `.fr.ts`)
- Create: `web/lib/help/content/csv-import.ts` (+ `.zh.ts`, `.fr.ts`)
- Create: `web/lib/help/content/login.ts` (+ `.zh.ts`, `.fr.ts`)
- Test: `web/lib/help/content.test.ts`

**Interfaces:**
- Consumes: `HelpArticleContent` type from `@matthewdbaldwin/microport-ui/help/logic` (Task 1).
- Produces: `getHelpContent(slug: string, locale?: string): HelpArticleContent | null`, `HELP_CONTENT_SLUGS: string[]`, `normalizeLocale(locale: string): 'en'|'zh'|'fr'` — consumed by Task 4 (`searchDocs.ts`) and Task 6 (`HelpArticleClient.tsx`, `/help/[slug]/page.tsx`).

**Content-depth note:** every article below includes a `common questions` FAQ section (the PRD's content shape names "what it's for, how to work it, role blocks, common questions, related"), grounded in facts already stated elsewhere in the same article — no invented functionality. The PRD's "5-7 sections each" figure is inherited from SalesPort v2's much larger 35-article build; ProductPort's own PRD frames this app's help-surface as deliberately "small and fully enumerated" (the reasoning it uses to reject wave-splitting) and explicitly requires content be "grounded in the live components/routes... not aspirational UI." `catalog-browse` and `csv-import` reach 5 sections; the other four land at 3-4 because a "role blocks" section is honestly omitted where it wouldn't say anything real — `product-create`/`product-edit`/`csv-import` are already gated admin-only at the `HELP_SECTIONS` item level (Task 2), so a "for product administrators" sub-block would just repeat the whole article back to itself, and `login` has no role distinction to draw (every signed-in user hits the same SSO redirect). Padding these to hit a fixed count would violate the "not aspirational UI" instruction more directly than falling short of "5-7" does.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/mantis/dev/productport/web && npx vitest run lib/help/content.test.ts`
Expected: FAIL — `Error: Failed to resolve import "./content"`.

- [ ] **Step 3: Write the English content modules**

```ts
// web/lib/help/content/catalog-browse.ts
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const catalogBrowse: HelpArticleContent = {
  slug:  'catalog-browse',
  title: 'Browsing and filtering the catalog',
  intro: 'The catalog page loads every product once, then search and filtering happen instantly in your browser.',
  lastUpdated: '2026-08-10',
  sections: [
    {
      id: 'search', heading: 'Search',
      blocks: [
        { kind: 'paragraph', text: 'The search box at the top of the page matches against product names, indications, and product types as you type — there is no separate search button.', labels: ['Search products, indications, types…'] },
      ],
    },
    {
      id: 'filters', heading: 'Filters',
      blocks: [
        { kind: 'list', items: [
          'Filter by therapeutic area, subsidiary, market, or category using the filter rail.',
          'Filters combine — picking a therapeutic area and a market narrows to products matching both.',
          'Clear all active filters and the search box in one click.',
        ] },
      ],
    },
    {
      id: 'cards', heading: 'Reading a product card',
      blocks: [
        { kind: 'paragraph', text: 'Each card shows the product’s primary gallery image, name, and status at a glance. Click any card to open its full detail view.' },
      ],
    },
    {
      id: 'admin-actions', heading: 'For product administrators',
      blocks: [
        { kind: 'roleBlock', roles: ['product_admin', 'superuser'], blocks: [
          { kind: 'list', items: [
            'Add product opens a blank product-create form.',
            'Import CSV and Export CSV live in the top bar next to search.',
          ], labels: ['+ Add product', 'Export CSV'] },
        ] },
      ],
    },
    {
      id: 'faq', heading: 'Common questions',
      blocks: [
        { kind: 'faq', items: [
          { q: 'Search isn’t finding a product I know exists — why?', a: 'Search only matches product name, indication, and product type. An active therapeutic-area, subsidiary, or market filter can still hide a product from the results even when its name matches your search — try Clear filters first.' },
          { q: 'What’s the difference between Export CSV here and the one on CSV import?', a: 'They download the same file. Export CSV in the catalog top bar is the fast path; see CSV import for the full column format it produces.' },
        ] },
      ],
    },
  ],
  related: ['product-detail', 'csv-import'],
};

export default catalogBrowse;
```

```ts
// web/lib/help/content/product-detail.ts
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const productDetail: HelpArticleContent = {
  slug:  'product-detail',
  title: 'Product detail view',
  intro: 'Clicking a catalog card opens the full detail view for that product — every field the catalog tracks, in one place.',
  lastUpdated: '2026-08-10',
  sections: [
    {
      id: 'opening', heading: 'Opening a product',
      blocks: [
        { kind: 'list', items: [
          'Click any catalog card to open its detail view.',
          'Every product’s detail view has its own shareable URL — the browser address bar updates with the product’s slug, so you can bookmark or send a direct link.',
        ] },
      ],
    },
    {
      id: 'fields', heading: 'What you’ll see',
      blocks: [
        { kind: 'list', items: [
          'Overview, features, indication, and patient population.',
          'Regulatory clearances by region, with their current status.',
          'Trials associated with the product, where recorded.',
        ] },
      ],
    },
    {
      id: 'admin-actions', heading: 'For product administrators',
      blocks: [
        { kind: 'roleBlock', roles: ['product_admin', 'superuser'], blocks: [
          { kind: 'paragraph', text: 'An Edit action opens the same product in the product-edit form. You can also disable a product from here without deleting its history.' },
        ] },
      ],
    },
    {
      id: 'faq', heading: 'Common questions',
      blocks: [
        { kind: 'faq', items: [
          { q: 'Can I link someone directly to a specific product?', a: 'Yes — every product detail view has its own shareable URL, so you can bookmark it or send it directly.' },
          { q: 'Can I disable a product without deleting it?', a: 'Yes, if you’re a product administrator. Disabling preserves the product’s history; deleting is a separate, more permanent action.' },
        ] },
      ],
    },
  ],
  related: ['catalog-browse', 'product-edit'],
};

export default productDetail;
```

```ts
// web/lib/help/content/product-create.ts
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const productCreate: HelpArticleContent = {
  slug:  'product-create',
  title: 'Adding a new product',
  intro: '+ Add product opens a blank product form. Required fields are checked before you can save.',
  lastUpdated: '2026-08-10',
  sections: [
    {
      id: 'required', heading: 'Required fields',
      blocks: [
        { kind: 'list', items: [
          'Slug, name, subsidiary, and therapeutic area are required — the form won’t save without them.',
          'A product’s slug becomes part of its detail-view URL, so pick something short and stable.',
        ] },
      ],
    },
    {
      id: 'tier-classification', heading: 'Tier, classification, and status',
      blocks: [
        { kind: 'paragraph', text: 'Tier, classification, and status are selected from fixed lists — pick the closest match; these drive catalog filtering for other users.' },
      ],
    },
    {
      id: 'after-create', heading: 'After you save',
      blocks: [
        { kind: 'paragraph', text: 'A newly created product opens straight into edit mode, where you can add gallery images and regulatory clearances — both are edit-only, unavailable while creating.', labels: ['Product images', 'Regulatory clearances'] },
      ],
    },
    {
      id: 'faq', heading: 'Common questions',
      blocks: [
        { kind: 'faq', items: [
          { q: 'Can I add gallery images or clearances while creating a product?', a: 'Not on the create form. Save the product first, then reopen it in edit mode — both sections are edit-only.' },
          { q: 'What if I’m not sure which tier or classification fits yet?', a: 'Pick the closest match. Both fields drive catalog filtering, not validation, so you can revise them later from edit mode.' },
        ] },
      ],
    },
  ],
  related: ['product-edit', 'catalog-browse'],
};

export default productCreate;
```

```ts
// web/lib/help/content/product-edit.ts
// Domain terminology discipline (PRD): Clearance is the umbrella term for
// "authorized to sell in a jurisdiction" — never "Registration" or
// "Approval" for the concept as a whole. Registration is the narrower
// certificate/reference-number evidence attached to a clearance.
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const productEdit: HelpArticleContent = {
  slug:  'product-edit',
  title: 'Editing a product',
  intro: 'The same form used to create a product, opened against its existing data. Two sections — the image gallery and the regulatory Clearance matrix — only appear while editing.',
  lastUpdated: '2026-08-10',
  sections: [
    {
      id: 'fields', heading: 'Editing the basic fields',
      blocks: [
        { kind: 'paragraph', text: 'Any field can be changed and saved independently. Changing status to Discontinued does not delete the product or its history.' },
      ],
    },
    {
      id: 'gallery', heading: 'Product images',
      blocks: [
        { kind: 'list', items: [
          'Add image accepts JPEG, PNG, or WebP up to 6 MB.',
          'Set primary chooses which image shows on the product’s catalog card — there is always exactly one primary image once any image exists.',
          'Deleting an image asks you to confirm before it’s removed.',
        ], labels: ['+ Add image', 'Set primary', 'Delete'] },
      ],
    },
    {
      id: 'clearances', heading: 'Regulatory Clearance matrix',
      blocks: [
        { kind: 'paragraph', text: 'One row per region — CE, FDA, NMPA, PMDA, and TGA. Each row’s status, certificate number(s), qualifier, and notes are independent of the other regions.' },
        { kind: 'list', items: [
          'Status tracks where that region’s Clearance stands: none, in progress, submitted, approved, or not approved.',
          'Certificate number(s) is the Registration evidence for an approved Clearance — separate certificate numbers are pipe-separated (e.g. CE-100|CE-200).',
          'Clearance changes save together with the rest of the form, via Save changes — there is no separate save for the matrix.',
        ], labels: ['Save changes'] },
      ],
    },
    {
      id: 'faq', heading: 'Common questions',
      blocks: [
        { kind: 'faq', items: [
          { q: 'Does changing status to Discontinued delete the product?', a: 'No. Discontinuing a product only changes its status — it does not delete the product or its history.' },
          { q: 'Can a region have more than one certificate number?', a: 'Yes — separate multiple certificate numbers for the same region with a pipe, e.g. CE-100|CE-200.' },
        ] },
      ],
    },
  ],
  related: ['product-create', 'product-detail'],
};

export default productEdit;
```

```ts
// web/lib/help/content/csv-import.ts
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const csvImport: HelpArticleContent = {
  slug:  'csv-import',
  title: 'CSV import and export',
  intro: 'Import CSV updates the catalog in bulk from a spreadsheet; Export CSV downloads the current catalog (up to 5,000 rows) as a starting point.',
  lastUpdated: '2026-08-10',
  sections: [
    {
      id: 'export', heading: 'Exporting',
      blocks: [
        { kind: 'paragraph', text: 'Export CSV downloads every product’s current data in the same column format the importer expects — the fastest way to get a template with real data already filled in.', labels: ['Export CSV'] },
      ],
    },
    {
      id: 'header-check', heading: 'Header check',
      blocks: [
        { kind: 'paragraph', text: 'Before reading a single row, the importer checks your file’s header row against the required column set. A missing column stops the import immediately with no rows changed — rather than silently skipping the column for every row.' },
      ],
    },
    {
      id: 'dry-run', heading: 'Verify before you commit', 
      blocks: [
        { kind: 'steps', steps: [
          'Choose your CSV file.',
          'Run a dry-run pass first — it validates every row without writing anything.',
          'Review the per-row results, fix any flagged rows in your spreadsheet, and re-run the dry run if needed.',
          'Once the dry run is clean, run the real import.',
        ] },
      ],
    },
    {
      id: 'error-report', heading: 'If some rows fail',
      blocks: [
        { kind: 'paragraph', text: 'A partial failure never blocks the rows that succeeded — each row is validated independently. Rows that failed are listed with the reason, so you can fix just those and re-import them.' },
      ],
    },
    {
      id: 'faq', heading: 'Common questions',
      blocks: [
        { kind: 'faq', items: [
          { q: 'Do I have to run a dry run before every import?', a: 'It’s not enforced, but strongly recommended — a dry run validates every row without writing anything, so you catch problems before they touch the catalog.' },
          { q: 'If some rows fail, do I have to redo the whole file?', a: 'No — a partial failure never rolls back the rows that succeeded. Fix just the flagged rows and re-import them.' },
        ] },
      ],
    },
  ],
  related: ['catalog-browse'],
};

export default csvImport;
```

```ts
// web/lib/help/content/login.ts
// Fleet-standard SSO help pattern (PRD item 6: "no bespoke content"). No
// live satellite reference with an existing login help module was found to
// copy verbatim during this plan's research — authored fresh, kept
// deliberately short, matching every other satellite's minimal SSO-login
// help depth (a pure redirect flow needs little explaining).
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const login: HelpArticleContent = {
  slug:  'login',
  title: 'Signing in',
  intro: 'ProductPort signs you in through the MicroPort Hub — there’s no separate ProductPort password.',
  lastUpdated: '2026-08-10',
  sections: [
    {
      id: 'how-it-works', heading: 'How it works',
      blocks: [
        { kind: 'list', items: [
          'Signing in redirects you to the Hub to authenticate, then back to ProductPort automatically.',
          'If you’re already signed into the Hub, this happens without any extra step.',
        ] },
      ],
    },
    {
      id: 'trouble', heading: 'If sign-in doesn’t complete',
      blocks: [
        { kind: 'paragraph', text: 'Return to the Hub directly and confirm your ProductPort access is still granted — access is managed centrally there, not inside ProductPort.' },
      ],
    },
    {
      id: 'faq', heading: 'Common questions',
      blocks: [
        { kind: 'faq', items: [
          { q: 'Do I have a separate ProductPort password?', a: 'No. ProductPort has no local password — you always sign in through the Hub.' },
          { q: 'Who do I contact if my access is missing or wrong?', a: 'Access is granted centrally through the Hub — confirm your ProductPort access there rather than inside ProductPort.' },
        ] },
      ],
    },
  ],
  related: [],
};

export default login;
```

- [ ] **Step 4: Write the zh and fr translations via the local 3090 tier**

For each of the six modules above, run (repeat per-slug, once with `--translate zh` once with `--translate fr`):

```bash
ask-local --translate zh "Translate this JSON object's string VALUES only from English to Chinese. Keep every key name exactly as-is (slug, title, intro, lastUpdated, id, heading, kind, text, items, labels, related, roles). Do not translate 'kind' values (paragraph/list/roleBlock/steps/faq) or 'id'/'slug' values — those are code identifiers. Return ONLY the resulting JSON object, no commentary, no markdown fence: <paste the full catalog-browse.ts object as JSON here>"
```

Repeat with `--translate fr` for French. Do this for all six content objects (`catalog-browse`, `product-detail`, `product-create`, `product-edit`, `csv-import`, `login`). For each result, write a sibling `<slug>.zh.ts` / `<slug>.fr.ts` module — same shape as the English module, `slug`/`id`/`kind` values copied verbatim from the English original (only translate `title`/`intro`/`heading`/`text`/`items`/`labels` string content), default-exporting the translated `HelpArticleContent` object. Spot-check that `product-edit`'s Chinese and French translations still keep "Clearance"/"Registration" as distinguishable concepts (the PRD's domain-terminology discipline applies across locales, not just English) — if `ask-local` collapses them into one translated term, manually correct that one field.

- [ ] **Step 5: Write the content registry**

```ts
// web/lib/help/content.ts
// Content registry — slug -> typed article module, locale-aware.
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';
import { LOCALES } from '@/lib/locales';

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

type Locale = 'en' | 'zh' | 'fr';

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

const BY_LOCALE: Record<Locale, Record<string, HelpArticleContent>> = { en: EN, zh: ZH, fr: FR };

/** Maps a full BCP-47-style code (e.g. 'en-US') to this repo's short file
 *  code, via the same LOCALES table web/i18n.ts uses — not a bespoke regex. */
export function normalizeLocale(locale: string): Locale {
  const found = LOCALES.find(l => l.code === locale);
  return (found?.file as Locale | undefined) ?? 'en';
}

export function getHelpContent(slug: string, locale: string = 'en-US'): HelpArticleContent | null {
  const l = normalizeLocale(locale);
  return BY_LOCALE[l]?.[slug] ?? EN[slug] ?? null;
}
export const HELP_CONTENT_SLUGS: string[] = Object.keys(EN);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /home/mantis/dev/productport/web && npx vitest run lib/help/content.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 7: Commit**

```bash
cd /home/mantis/dev/productport
git add web/lib/help/content.ts web/lib/help/content/
git commit -m "Add the 6 Help Library articles (en/zh/fr), all live from day one

All six PRD logical views get a full article — no wave-splitting. zh/fr
drafted via the local 3090 tier (ask-local --translate), not Claude
tokens, per the standing platform delegation policy. product-edit holds
to the PRD's domain-terminology discipline: Clearance is the umbrella
term, Registration is the narrower certificate evidence."
```

---

### Task 4: `searchDocs.ts` + the two contextual popovers

**Files:**
- Create: `web/lib/help/popovers.ts`
- Create: `web/lib/help/popovers.zh.ts`
- Create: `web/lib/help/popovers.fr.ts`
- Create: `web/lib/help/searchDocs.ts`
- Test: `web/lib/help/searchDocs.test.ts`

**Interfaces:**
- Consumes: `lookupHelpItem` from `./sections` (Task 2); `getHelpContent`, `HELP_CONTENT_SLUGS`, `normalizeLocale` from `./content` (Task 3); `HelpBlock`, `HelpSearchDoc` types and `HelpContent` type from microport-ui (Task 1).
- Produces: `GALLERY_POPOVER: HelpContent`, `CLEARANCE_POPOVER: HelpContent` (the English defaults), `getPopoverContent(key: 'gallery'|'clearance', locale?: string): HelpContent`, `getPopoverTitle(key: 'gallery'|'clearance', locale?: string): string` — consumed by Task 7 (`ProductEditModal.tsx`'s `<HelpButton>` wiring, locale-aware). `buildSearchDocs(locale?: string): HelpSearchDoc[]` — consumed by Task 6 (`/help` routes) and Task 8 (`HelpLauncher.tsx`).

**i18n note (resolved during plan self-review):** the Global Constraints require every new string, chrome copy and article prose alike, to draft zh/fr via `ask-local` — no carve-out for the two popovers. `GALLERY_POPOVER`/`CLEARANCE_POPOVER` stay the English constants (this task's own test and Task 7's existing references name them directly), but they're no longer what search or the live UI render in zh/fr — `getPopoverContent`/`getPopoverTitle` select the right-language variant, mirroring `content.ts`'s `getHelpContent` pattern from Task 3.

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/help/searchDocs.test.ts
import { describe, it, expect } from 'vitest';
import { buildSearchDocs } from './searchDocs';
import { GALLERY_POPOVER, CLEARANCE_POPOVER } from './popovers';
import { HELP_CONTENT_SLUGS } from './content';

describe('buildSearchDocs', () => {
  it('includes one article-kind doc per content slug, plus 2 popover-kind docs', () => {
    const docs = buildSearchDocs('en-US');
    const articleDocs = docs.filter(d => d.kind === 'article');
    const popoverDocs  = docs.filter(d => d.kind === 'popover');
    expect(articleDocs.map(d => d.slug).sort()).toEqual([...HELP_CONTENT_SLUGS].sort());
    expect(popoverDocs).toHaveLength(2);
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

  it('article docs walk roleBlocks (product-edit has one) and surface their body text', () => {
    const docs = buildSearchDocs('en-US');
    const productEdit = docs.find(d => d.slug === 'product-edit')!;
    expect(productEdit.body).toContain('Clearance matrix');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/mantis/dev/productport/web && npx vitest run lib/help/searchDocs.test.ts`
Expected: FAIL — `Error: Failed to resolve import "./searchDocs"`.

- [ ] **Step 3: Write the popover content (English defaults + locale-aware getters)**

```ts
// web/lib/help/popovers.ts
// The two Product-edit sub-section popovers (PRD item 4). These are NOT
// HELP_SECTIONS items and have no /help/<slug> article page — they render
// in-context via the legacy HelpButton component (Task 7) and are indexed
// into search separately as kind:'popover' docs (below), matching the
// PRD's "same click-through behavior as the other satellites' popover
// docs" requirement. targetHref is '/' for both: neither sub-section has
// its own addressable URL (ProductEditModal only opens against a specific
// product, chosen interactively, not via a deep link) — a search result
// click lands on the catalog root, from which the user opens Edit on any
// product to reach the section the popover describes.
//
// getPopoverContent/getPopoverTitle are locale-aware, mirroring content.ts's
// getHelpContent pattern — Global Constraints require zh/fr for every new
// string, popovers included, no carve-out.
import type { HelpContent } from '@matthewdbaldwin/microport-ui/help';
import { normalizeLocale } from './content';
import { POPOVERS as POPOVERS_ZH, POPOVER_TITLES as TITLES_ZH } from './popovers.zh';
import { POPOVERS as POPOVERS_FR, POPOVER_TITLES as TITLES_FR } from './popovers.fr';

export const GALLERY_POPOVER: HelpContent = {
  summary: 'Manage this product’s gallery — add, set primary, or delete images.',
  bullets: [
    'Add image accepts JPEG, PNG, or WebP up to 6 MB.',
    'Set primary controls which image shows on the catalog card.',
    'Delete asks you to confirm before removing an image.',
  ],
};

export const CLEARANCE_POPOVER: HelpContent = {
  summary: 'One row per region. Status, certificate number(s), qualifier, and notes are independent per row.',
  bullets: [
    'Certificate number(s) is the Registration evidence for an approved Clearance — separate multiple numbers with a pipe (CE-100|CE-200).',
    'Clearance changes save together with the rest of the form, via Save changes.',
  ],
};

export const POPOVER_TITLES = {
  gallery:   'Managing product images',
  clearance: 'Editing the Clearance matrix',
} as const;

export type PopoverKey = 'gallery' | 'clearance';

const EN: Record<PopoverKey, HelpContent> = { gallery: GALLERY_POPOVER, clearance: CLEARANCE_POPOVER };
const CONTENT_BY_LOCALE: Record<'en' | 'zh' | 'fr', Record<PopoverKey, HelpContent>> = { en: EN, zh: POPOVERS_ZH, fr: POPOVERS_FR };
const TITLES_BY_LOCALE:  Record<'en' | 'zh' | 'fr', Record<PopoverKey, string>> = { en: POPOVER_TITLES, zh: TITLES_ZH, fr: TITLES_FR };

export function getPopoverContent(key: PopoverKey, locale: string = 'en-US'): HelpContent {
  return CONTENT_BY_LOCALE[normalizeLocale(locale)]?.[key] ?? EN[key];
}

export function getPopoverTitle(key: PopoverKey, locale: string = 'en-US'): string {
  return TITLES_BY_LOCALE[normalizeLocale(locale)]?.[key] ?? POPOVER_TITLES[key];
}
```

- [ ] **Step 4: Write the zh and fr translations via the local 3090 tier**

Same pattern as Task 3 Step 4, applied to the two popovers' summary/bullets and their two titles:

```bash
ask-local --translate zh "Translate this JSON object's string VALUES only from English to Chinese. Keep every key name exactly as-is (gallery, clearance, summary, bullets). Return ONLY the resulting JSON object, no commentary, no markdown fence: {\"POPOVERS\": {\"gallery\": {\"summary\": \"Manage this product's gallery — add, set primary, or delete images.\", \"bullets\": [\"Add image accepts JPEG, PNG, or WebP up to 6 MB.\", \"Set primary controls which image shows on the catalog card.\", \"Delete asks you to confirm before removing an image.\"]}, \"clearance\": {\"summary\": \"One row per region. Status, certificate number(s), qualifier, and notes are independent per row.\", \"bullets\": [\"Certificate number(s) is the Registration evidence for an approved Clearance — separate multiple numbers with a pipe (CE-100|CE-200).\", \"Clearance changes save together with the rest of the form, via Save changes.\"]}}, \"POPOVER_TITLES\": {\"gallery\": \"Managing product images\", \"clearance\": \"Editing the Clearance matrix\"}}"
```

Repeat with `--translate fr` for French. Spot-check that the Clearance translation keeps "Clearance"/"Registration" distinguishable — the same domain-terminology discipline Task 3's `product-edit` article applies — manually correct that one field if `ask-local` collapses them. Write each result as a sibling module (no import from `./popovers` — a self-contained `Record` literal, so there's no circular import with the file that imports these):

```ts
// web/lib/help/popovers.zh.ts
import type { HelpContent } from '@matthewdbaldwin/microport-ui/help';

export const POPOVERS: Record<'gallery' | 'clearance', HelpContent> = {
  gallery:   { summary: '<translated>', bullets: ['<translated>', '<translated>', '<translated>'] },
  clearance: { summary: '<translated>', bullets: ['<translated>', '<translated>'] },
};

export const POPOVER_TITLES: Record<'gallery' | 'clearance', string> = {
  gallery:   '<translated>',
  clearance: '<translated>',
};
```

Write `web/lib/help/popovers.fr.ts` in the same shape with the French values.

- [ ] **Step 5: Write `searchDocs.ts`**

```ts
// web/lib/help/searchDocs.ts
// Flattens the 6 live articles + the 2 contextual popovers into the
// HelpSearchDoc[] shape the shared search engine (searchHelp/
// searchHelpFuzzy) consumes.
import { HELP_CONTENT_SLUGS, getHelpContent, normalizeLocale } from './content';
import { lookupHelpItem } from './sections';
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

function popoverDoc(slug: string, title: string, content: HelpContent): HelpSearchDoc {
  const body = [content.summary, ...content.bullets.map(b => (typeof b === 'string' ? b : b.text))];
  return {
    slug, title, sectionTitle: 'Product administration',
    body: body.join(' '), kind: 'popover', targetHref: '/',
    roles: ['product_admin', 'superuser'],
  };
}

export function buildSearchDocs(locale: string = 'en-US'): HelpSearchDoc[] {
  const l = normalizeLocale(locale);
  const docs: HelpSearchDoc[] = [];
  for (const slug of HELP_CONTENT_SLUGS) {
    const content = getHelpContent(slug, l);
    if (!content) continue;
    const entry = lookupHelpItem(slug);
    const body: string[] = [content.intro];
    const labels: string[] = [];
    for (const section of content.sections) walk(section.blocks, body, labels);
    docs.push({
      slug, title: content.title, sectionTitle: entry?.section.title ?? '',
      headings: content.sections.map(s => s.heading), labels,
      body: body.join(' '), roles: entry?.item.roles, kind: 'article',
    });
  }
  docs.push(popoverDoc('product-edit-gallery-popover', getPopoverTitle('gallery', locale), getPopoverContent('gallery', locale)));
  docs.push(popoverDoc('product-edit-clearance-popover', getPopoverTitle('clearance', locale), getPopoverContent('clearance', locale)));
  return docs;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /home/mantis/dev/productport/web && npx vitest run lib/help/searchDocs.test.ts`
Expected: PASS — 4 tests. (Step 1's test only exercises `buildSearchDocs('en-US')`, which resolves to the `GALLERY_POPOVER`/`CLEARANCE_POPOVER` English constants via `getPopoverContent`'s `en` branch — the assertions against those two constants still hold unchanged.)

- [ ] **Step 7: Commit**

```bash
cd /home/mantis/dev/productport
git add web/lib/help/popovers.ts web/lib/help/popovers.zh.ts web/lib/help/popovers.fr.ts web/lib/help/searchDocs.ts web/lib/help/searchDocs.test.ts
git commit -m "Add buildSearchDocs + the 2 contextual popovers, localized en/zh/fr

Popovers are indexed as kind:'popover' docs (targetHref: '/', since
neither gallery nor Clearance-matrix editing has its own addressable URL)
alongside the 6 kind:'article' docs — same search corpus, same ranking.
getPopoverContent/getPopoverTitle select the right-language variant
(zh/fr drafted via the local 3090 tier), matching the Global Constraint
that every new string gets all three locales, popovers included."
```

---

### Task 5: `HelpSearchMiss` model + migration + Express write path

**Files:**
- Modify: `prisma/schema.prisma` (new `HelpSearchMiss` model)
- Create: `prisma/migrations/<generated-timestamp>_add_help_search_miss/migration.sql` (generated)
- Create: `src/routes/help.js`
- Modify: `src/app.js` (register the route)
- Test: `tests/help.test.js`
- Create: `web/lib/help/searchMiss.ts`
- Test: `web/lib/help/searchMiss.test.ts`

**Interfaces:**
- Consumes: `req.user` (`{ id, email, name, role, theme, locale, appRoles, isSuperuser }`, set by `requireAuth` — `src/middleware/auth.js:105-111`); `api` from `@/lib/api`.
- Produces: `POST /api/help` (`{ query, locale, wasFuzzyRescued }` → 201 `{ id, createdAt }`, role/userId server-derived); `recordHelpSearchMiss({ query, wasFuzzyRescued, locale? }): void` — consumed by Task 8 (`HelpLauncher.tsx`'s `onSettledQuery`).

- [ ] **Step 1: Add the Prisma model**

In `prisma/schema.prisma`, append after the final model in the file (`WebhookOutbox`, ending around line 276):

```prisma
// Help-search-miss analytics (Help Library, Task 5). Every zero-literal-
// result search fires one row, so future content revisions target
// OBSERVED gaps instead of guesses. Mechanical port of Project 1's
// HelpSearchMiss shape (project_prd_help_library_search_comprehensiveness_
// 2026-08-08). userId uses onDelete: SetNull — a search-miss row is
// analytics, not owned content that should vanish with its user (this
// repo has no local BugReport model to mirror; bug reports forward
// synchronously to SalesPort instead).
model HelpSearchMiss {
  id              Int      @id @default(autoincrement())
  query           String
  locale          String
  role            String
  wasFuzzyRescued Boolean  @default(false)
  userId          Int?
  user            User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  createdAt       DateTime @default(now())

  @@index([createdAt])
  @@index([query])
  @@map("help_search_misses")
}
```

In `model User` (`prisma/schema.prisma:32-46`), add the back-relation:

```diff
   sessions    Session[]
   audits      ProductAudit[]
+  helpSearchMisses HelpSearchMiss[]

   @@map("User")
```

- [ ] **Step 2: Generate the migration**

```bash
cd /home/mantis/dev/productport
npx prisma migrate dev --name add_help_search_miss
```

Expected: creates `prisma/migrations/<timestamp>_add_help_search_miss/migration.sql` with `CREATE TABLE "help_search_misses" (...)`, FK `ON DELETE SET NULL`, applies it, regenerates the Prisma client (`prisma.helpSearchMiss` now exists).

- [ ] **Step 3: Write the failing server test**

```js
// tests/help.test.js
'use strict';

jest.mock('../src/lib/db', () => ({
  helpSearchMiss: { create: jest.fn() },
}));

const express = require('express');
const request = require('supertest');
const db = require('../src/lib/db');

function makeApp(user) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.user = user; next(); });
  a.use('/api/help', require('../src/routes/help'));
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  db.helpSearchMiss.create.mockImplementation(async ({ data }) => ({ id: 1, createdAt: new Date(), ...data }));
});

describe('POST /api/help', () => {
  test('records a search miss with server-derived role + userId, ignoring any client-sent role/userId', async () => {
    const app = makeApp({ id: 9, role: 'viewer', email: 'v@microport.com' });
    const res = await request(app)
      .post('/api/help')
      .send({ query: 'clearance export', wasFuzzyRescued: false, locale: 'en-US', role: 'superuser', userId: 999 });
    expect(res.status).toBe(201);
    expect(db.helpSearchMiss.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ query: 'clearance export', role: 'viewer', userId: 9, wasFuzzyRescued: false }),
    }));
  });

  test('defaults wasFuzzyRescued to false when the client omits it', async () => {
    const app = makeApp({ id: 3, role: 'product_admin' });
    await request(app).post('/api/help').send({ query: 'gallery' });
    expect(db.helpSearchMiss.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ wasFuzzyRescued: false }),
    }));
  });

  test('422s an empty or whitespace-only query without touching the database', async () => {
    const app = makeApp({ id: 3, role: 'product_admin' });
    const res = await request(app).post('/api/help').send({ query: '   ' });
    expect(res.status).toBe(422);
    expect(db.helpSearchMiss.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd /home/mantis/dev/productport && CI=true npx jest tests/help.test.js`
Expected: FAIL — `Cannot find module '../src/routes/help'`.

- [ ] **Step 5: Write the route**

```js
// src/routes/help.js — HelpSearchMiss write path. Mirrors the fleet's
// server-derived-identity pattern: role/userId come from req.user, never
// trusted from the client body.
'use strict';
const express = require('express');
const logger  = require('../lib/logger');
const db      = require('../lib/db');

const router = express.Router();
const str = (v) => (typeof v === 'string' ? v.trim() : '');

router.post('/', async (req, res, next) => {
  const query = str(req.body?.query).slice(0, 500);
  if (!query) return res.status(422).json({ error: 'query is required.' });
  const locale = str(req.body?.locale).slice(0, 8) || 'en-US';
  const wasFuzzyRescued = req.body?.wasFuzzyRescued === true;

  try {
    const created = await db.helpSearchMiss.create({
      data: { query, locale, role: req.user.role, wasFuzzyRescued, userId: req.user.id },
      select: { id: true, createdAt: true },
    });
    logger.info({ helpSearchMissId: created.id, query, locale, wasFuzzyRescued }, '[help] search miss recorded');
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

- [ ] **Step 6: Register the route**

In `src/app.js`, insert directly after the `opsport` mount (research-confirmed location, `src/app.js:105`) and before the error-handler comment:

```diff
 app.use('/api/opsport', require('./routes/opsport'));

+// Help Library search-miss analytics. Any authed user's zero-literal-
+// result query gets logged so future content revisions target observed
+// gaps. role/userId are server-derived from req.user inside the router.
+app.use('/api/help', requireAuth, require('./routes/help'));
+
 // Error handler LAST — 5xx → generic body (no leak), 4xx surface their message,
```

(Confirm `requireAuth` is already imported at the top of `src/app.js` — it is, since `/api/products` already uses it at line 95; reuse the same import.)

- [ ] **Step 7: Run test to verify it passes**

Run: `cd /home/mantis/dev/productport && CI=true npx jest tests/help.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 8: Commit the server side**

```bash
cd /home/mantis/dev/productport
git add prisma/schema.prisma prisma/migrations src/routes/help.js src/app.js tests/help.test.js
git commit -m "Add HelpSearchMiss model + POST /api/help write path

Mechanical port of Project 1's HelpSearchMiss shape. userId uses
onDelete: SetNull. role and userId are always server-derived from
req.user, never trusted from the client body."
```

- [ ] **Step 9: Write the failing client-helper test**

```ts
// web/lib/help/searchMiss.test.ts
import { describe, it, expect, vi } from 'vitest';

const apiMock = vi.fn().mockResolvedValue({ id: 1 });
vi.mock('@/lib/api', () => ({ api: (...a: unknown[]) => apiMock(...a) }));

import { recordHelpSearchMiss } from './searchMiss';

describe('recordHelpSearchMiss', () => {
  it('POSTs to /api/help with the query, fuzzy flag, and locale', () => {
    recordHelpSearchMiss({ query: 'export', wasFuzzyRescued: true, locale: 'en-US' });
    expect(apiMock).toHaveBeenCalledWith('/api/help', {
      method: 'POST',
      body: JSON.stringify({ query: 'export', wasFuzzyRescued: true, locale: 'en-US' }),
    });
  });

  it('never throws when the write fails — fire-and-forget', async () => {
    apiMock.mockRejectedValueOnce(new Error('network down'));
    expect(() => recordHelpSearchMiss({ query: 'x', wasFuzzyRescued: false })).not.toThrow();
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `cd /home/mantis/dev/productport/web && npx vitest run lib/help/searchMiss.test.ts`
Expected: FAIL — `Error: Failed to resolve import "./searchMiss"`.

- [ ] **Step 11: Write the client helper**

```ts
// web/lib/help/searchMiss.ts — fire-and-forget HelpSearchMiss writes,
// called from HelpLauncher's onSettledQuery (Task 8).
import { api } from '@/lib/api';

export function recordHelpSearchMiss({
  query, wasFuzzyRescued, locale,
}: { query: string; wasFuzzyRescued: boolean; locale?: string }): void {
  api('/api/help', {
    method: 'POST',
    body: JSON.stringify({ query, wasFuzzyRescued, locale }),
  }).catch(() => { /* analytics only — a failed write must not disrupt search */ });
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd /home/mantis/dev/productport/web && npx vitest run lib/help/searchMiss.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 13: Commit the client side**

```bash
cd /home/mantis/dev/productport
git add web/lib/help/searchMiss.ts web/lib/help/searchMiss.test.ts
git commit -m "Add recordHelpSearchMiss client helper for POST /api/help"
```

---

### Task 6: `HelpArticleClient` wiring + `/help` routes

**Files:**
- Create: `web/components/help/HelpArticleClient.tsx`
- Create: `web/app/help/layout.tsx`
- Create: `web/app/help/page.tsx`
- Create: `web/app/help/[slug]/page.tsx`
- Test: `web/app/help/page.test.tsx`
- Modify: `web/messages/en.json`, `web/messages/zh.json`, `web/messages/fr.json` (new `help` namespace)

**Interfaces:**
- Consumes: `HELP_SECTIONS`, `visibleSectionsFor`, `lookupHelpItem` from `@/lib/help/sections` (Task 2); `getHelpContent`, `normalizeLocale` from `@/lib/help/content` (Task 3); `buildSearchDocs` from `@/lib/help/searchDocs` (Task 4); `createHelpArticleClient`, `HelpCommandPalette` from `@matthewdbaldwin/microport-ui/help`; `searchHelp` from `@matthewdbaldwin/microport-ui/help/logic`; `useAuth` from `@/contexts/AuthContext`.
- Produces: `HelpArticleClient: (props: { slug: string }) => ReactElement | null` — the pattern Task 8's dropdown links land on (`/help/<slug>`).

- [ ] **Step 1: Add the `help` i18n namespace**

Add to `web/messages/en.json` (4th top-level key, alongside `auth`/`home`/`bug`):

```json
"help": {
  "libraryTitle": "Help Library",
  "backToApp": "Back to ProductPort",
  "searchPlaceholder": "Search help…",
  "noArticles": "No help articles are available yet.",
  "helpLabel": "Help",
  "resultCount": "{count, plural, one {# result} other {# results}}",
  "noResultsFor": "No results for \"{query}\".",
  "viewFullLibrary": "View full Help Library →",
  "didYouMean": "Did you mean…"
}
```

Draft zh/fr via `ask-local`:

```bash
ask-local --translate zh "Translate this JSON object's string VALUES only from English to Chinese. Keep every key name exactly as-is. Keep every ICU placeholder ({count}, {query}, and the {count, plural, one {...} other {...}} construct) byte-for-byte unchanged inside the translated string. Return ONLY the resulting JSON object, no commentary: {\"libraryTitle\": \"Help Library\", \"backToApp\": \"Back to ProductPort\", \"searchPlaceholder\": \"Search help…\", \"noArticles\": \"No help articles are available yet.\", \"helpLabel\": \"Help\", \"resultCount\": \"{count, plural, one {# result} other {# results}}\", \"noResultsFor\": \"No results for \\\"{query}\\\".\", \"viewFullLibrary\": \"View full Help Library →\", \"didYouMean\": \"Did you mean…\"}"
```

Repeat with `--translate fr`. Paste each result into `web/messages/zh.json` and `web/messages/fr.json` at the same top-level position. Spot-check every ICU placeholder survived unchanged before committing.

- [ ] **Step 2: Write the `HelpArticleClient` adapter**

```tsx
// web/components/help/HelpArticleClient.tsx
'use client';

// Adapter for the shared HelpArticleView. useLocale reads from
// useAuth().user?.locale (this codebase has no next-intl useLocale() hook
// client-side — locale is read server-side via cookie elsewhere; see
// Global Constraints). getStrings returns {} — no per-app HelpViewStrings
// dictionary exists yet, so the renderer falls back to its built-in
// English defaults.
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_LOCALE } from '@/lib/locales';
import { HELP_SECTIONS } from '@/lib/help/sections';
import { getHelpContent } from '@/lib/help/content';
import { createHelpArticleClient } from '@matthewdbaldwin/microport-ui/help';

export const HelpArticleClient = createHelpArticleClient({
  useUser: () => useAuth().user,
  useLocale: () => useAuth().user?.locale ?? DEFAULT_LOCALE,
  getContent: (slug, locale) => getHelpContent(slug, locale),
  getStrings: () => ({}),
  sections: HELP_SECTIONS,
  linkComponent: Link,
});
```

- [ ] **Step 3: Write the `/help` layout**

```tsx
// web/app/help/layout.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useMemo } from 'react';
import { HelpCommandPalette } from '@matthewdbaldwin/microport-ui/help';
import { buildSearchDocs } from '@/lib/help/searchDocs';
import { DEFAULT_LOCALE } from '@/lib/locales';

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const docs = useMemo(() => buildSearchDocs(user?.locale ?? DEFAULT_LOCALE), [user?.locale]);

  return (
    <div style={{ minHeight: '100vh' }}>
      {children}
      <HelpCommandPalette docs={docs} user={user} onNavigate={(slug) => router.push(`/help/${slug}`)} />
    </div>
  );
}
```

- [ ] **Step 4: Write the `/help` index page**

```tsx
// web/app/help/page.tsx
'use client';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { visibleSectionsFor } from '@/lib/help/sections';

export default function HelpIndexPage() {
  const { user } = useAuth();
  const sections = visibleSectionsFor(user);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <Link href="/">← Back to ProductPort</Link>
      <h1>Help Library</h1>
      {sections.length === 0 && <p>No help articles are available yet.</p>}
      {sections.map((section) => (
        <div key={section.id}>
          <h2>{section.title}</h2>
          <ul>
            {section.items.map((item) => (
              <li key={item.slug}><Link href={`/help/${item.slug}`}>{item.label}</Link></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Write the `/help/[slug]` article page**

```tsx
// web/app/help/[slug]/page.tsx
'use client';
import { use } from 'react';
import { notFound } from 'next/navigation';
import { HelpArticleClient } from '@/components/help/HelpArticleClient';

export default function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const el = HelpArticleClient({ slug });
  if (!el) notFound();
  return el;
}
```

- [ ] **Step 6: Write the failing index-page test**

```tsx
// web/app/help/page.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'viewer', email: 'v@microport.com', name: null } }),
}));

import HelpIndexPage from './page';

describe('/help index', () => {
  it('lists every visible section with its live items', () => {
    render(<HelpIndexPage />);
    expect(screen.getByText('Help Library')).toBeTruthy();
    expect(screen.getByText('Browsing and filtering the catalog') || screen.getByText('Browse & filter')).toBeTruthy();
  });

  it('hides admin-only items from a plain viewer', () => {
    render(<HelpIndexPage />);
    expect(screen.queryByText('Add a product')).toBeNull();
  });
});
```

- [ ] **Step 7: Run test to verify it fails, then passes**

Run: `cd /home/mantis/dev/productport/web && npx vitest run app/help/page.test.tsx`
Expected: first FAIL (`Cannot find module './page'` if run before Step 4 — reorder if you're following steps strictly TDD-first, or run after Step 5 to see it PASS directly). Either way, confirm PASS once Steps 2-5 exist: 2 tests.

- [ ] **Step 8: Commit**

```bash
cd /home/mantis/dev/productport
git add web/messages/en.json web/messages/zh.json web/messages/fr.json \
  web/components/help/HelpArticleClient.tsx \
  web/app/help/layout.tsx web/app/help/page.tsx web/app/help/page.test.tsx web/app/help/[slug]/page.tsx
git commit -m "Wire the /help route tree — index, article pages, command palette"
```

---

### Task 7: Wire the two contextual popovers into `ProductEditModal.tsx`

**Files:**
- Modify: `web/app/ProductEditModal.tsx`
- Test: `web/app/ProductEditModal.help.test.tsx`

**Interfaces:**
- Consumes: `HelpButton` from `@matthewdbaldwin/microport-ui/help` (Task 1); `getPopoverContent` from `@/lib/help/popovers` (Task 4, locale-aware — not the raw `GALLERY_POPOVER`/`CLEARANCE_POPOVER` constants, so the live popover matches the user's locale the same way search results already do); `useAuth` from `@/contexts/AuthContext`; `DEFAULT_LOCALE` from `@/lib/locales`.
- Produces: nothing new consumed elsewhere — these are UI leaves matching the search docs Task 4 already built.

- [ ] **Step 1: Write the failing test**

```tsx
// web/app/ProductEditModal.help.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductEditModal } from './ProductEditModal';

vi.mock('@/lib/products', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/products')>();
  return { ...actual, galleryImageSrc: () => '/x.jpg' };
});

describe('ProductEditModal help popovers (edit mode only)', () => {
  it('shows a HelpButton next to Product images and Regulatory clearances in edit mode', () => {
    render(
      <ProductEditModal
        mode="edit"
        initial={{ slug: 'p1', name: 'P1', subsidiary: 'S', therapeuticArea: 'A', images: [], clearances: [] }}
        onClose={() => {}}
        onSaved={() => {}}
        onGalleryChanged={() => {}}
      />,
    );
    expect(screen.getByText('Product images')).toBeTruthy();
    expect(screen.getByText('Regulatory clearances')).toBeTruthy();
    // Two HelpButton triggers render as icon buttons with an accessible name.
    expect(screen.getAllByRole('button', { name: /about this/i }).length).toBeGreaterThanOrEqual(2);
  });

  it('does not render either popover trigger in create mode (the sections themselves are edit-only)', () => {
    render(
      <ProductEditModal mode="create" onClose={() => {}} onSaved={() => {}} onGalleryChanged={() => {}} />,
    );
    expect(screen.queryByText('Product images')).toBeNull();
    expect(screen.queryByText('Regulatory clearances')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/mantis/dev/productport/web && npx vitest run app/ProductEditModal.help.test.tsx`
Expected: FAIL — no `HelpButton`/"about this" trigger exists yet (0 matches, expected ≥2).

- [ ] **Step 3: Wire the two `HelpButton`s, locale-aware**

```diff
 import {
   createProduct, updateProduct, deleteProduct, uploadProductImage, deleteProductImage, setPrimaryImage,
   galleryImageSrc, THERAPEUTIC_AREAS, updateClearances, CLEARANCE_QUALIFIERS,
   type ProductInput, type ProductTier, type ProductClassification, type ProductStatus, type GalleryImage,
   type ClearanceRow, type ClearanceStatus,
 } from '@/lib/products';
+import { HelpButton } from '@matthewdbaldwin/microport-ui/help';
+import { getPopoverContent } from '@/lib/help/popovers';
+import { useAuth } from '@/contexts/AuthContext';
+import { DEFAULT_LOCALE } from '@/lib/locales';
```

`ProductEditModal.tsx` doesn't currently call `useAuth()` anywhere — this is its first use in the file. `AuthContext`'s `Ctx` default (`{ user: null, loading: true }`) means calling `useAuth()` without a wrapping `AuthProvider` is safe and just returns `user: null` — the existing `ProductEditModal.help.test.tsx` (Step 1) renders `<ProductEditModal>` with no `AuthProvider`, so `user?.locale ?? DEFAULT_LOCALE` falls back to English there, which is what the test already asserts against:

```diff
 }) {
   const i = initial ?? {};
+  const { user } = useAuth();
+  const galleryPopover = getPopoverContent('gallery', user?.locale ?? DEFAULT_LOCALE);
+  const clearancePopover = getPopoverContent('clearance', user?.locale ?? DEFAULT_LOCALE);
   const [f, setF] = useState<Record<string, string>>({
```

```diff
         {mode === 'edit' && (
           <div className={s.efield} style={{ marginBottom: 12 }}>
-            <span>Product images <em style={{ color: 'var(--grey)', fontWeight: 400 }}>— gallery; the primary shows on the catalog card. JPEG/PNG/WebP, max 6 MB each.</em></span>
+            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
+              Product images <em style={{ color: 'var(--grey)', fontWeight: 400 }}>— gallery; the primary shows on the catalog card. JPEG/PNG/WebP, max 6 MB each.</em>
+              <HelpButton content={galleryPopover} inline />
+            </span>
```

```diff
         {mode === 'edit' && (
           <div className={s.efield} style={{ marginBottom: 12 }}>
-            <span>Regulatory clearances <em style={{ color: 'var(--grey)', fontWeight: 400 }}>— status, certificate number(s) (pipe-separated), and any caveat, per region.</em></span>
+            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
+              Regulatory clearances <em style={{ color: 'var(--grey)', fontWeight: 400 }}>— status, certificate number(s) (pipe-separated), and any caveat, per region.</em>
+              <HelpButton content={clearancePopover} inline />
+            </span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/mantis/dev/productport/web && npx vitest run app/ProductEditModal.help.test.tsx`
Expected: PASS — 2 tests.

- [ ] **Step 5: Run the full ProductEditModal suite to verify nothing else broke**

Run: `cd /home/mantis/dev/productport/web && npx vitest run app/ProductEditModal.test.tsx`
Expected: PASS — unrelated existing assertions untouched (only the gallery/Clearance section headers gained a sibling button).

- [ ] **Step 6: Commit**

```bash
cd /home/mantis/dev/productport
git add web/app/ProductEditModal.tsx web/app/ProductEditModal.help.test.tsx
git commit -m "Wire the gallery + Clearance-matrix help popovers into ProductEditModal

Both use the legacy HelpButton component (not a full article) — matches
Task 4's kind:'popover' search-doc indexing for the same two sections.
Content is locale-aware via getPopoverContent(key, user?.locale), same
as everywhere else in this plan."
```

---

### Task 8: Mount `HelpDropdown` in `CatalogPage`'s top bar + the Export CSV tooltip

**Files:**
- Create: `web/components/help/HelpLauncher.tsx`
- Modify: `web/app/page.tsx`
- Test: `web/components/help/HelpLauncher.test.tsx`

**Interfaces:**
- Consumes: `HelpDropdown` from `@matthewdbaldwin/microport-ui/help` (Task 1); `buildSearchDocs` from `@/lib/help/searchDocs` (Task 4); `recordHelpSearchMiss` from `@/lib/help/searchMiss` (Task 5); `useAuth` from `@/contexts/AuthContext`; `useRouter` from `next/navigation`.
- Produces: nothing new consumed elsewhere — this plan's UI entry point.

**Design decision (verified this plan, not assumed from the PRD):** ProductPort has no Profile modal, dropdown user menu, or any comparable chrome — confirmed by an exhaustive component search; the closest existing pattern is `BugReportButton`, a floating portal-rendered FAB. `HelpDropdown` itself is an inline toggle+panel, not a floating button, so it needs a host — mounting it in `CatalogPage`'s persistent top bar (present across all 6 in-scope logical views, since they're all client-routed under `/`) is more discoverable than a second floating FAB competing with `BugReportButton`'s corner, and requires no new portal/global-mount machinery.

- [ ] **Step 1: Write the failing test**

```tsx
// web/components/help/HelpLauncher.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'product_admin', email: 'a@microport.com', name: null, locale: 'en-US' } }),
}));
vi.mock('@/lib/help/searchMiss', () => ({ recordHelpSearchMiss: vi.fn() }));

import { HelpLauncher } from './HelpLauncher';

describe('HelpLauncher', () => {
  it('renders the Help toggle', () => {
    render(<HelpLauncher />);
    expect(screen.getByTestId('help-dropdown-toggle')).toBeTruthy();
  });

  it('navigates to /help/<slug> when an article result is chosen', () => {
    render(<HelpLauncher />);
    fireEvent.click(screen.getByTestId('help-dropdown-toggle'));
    fireEvent.change(screen.getByTestId('help-dropdown-input'), { target: { value: 'catalog' } });
    const result = screen.getAllByRole('button').find(b => b.textContent?.includes('Browsing and filtering'));
    fireEvent.click(result!);
    expect(pushMock).toHaveBeenCalledWith('/help/catalog-browse');
  });

  it('navigates to targetHref when a popover result is chosen', () => {
    render(<HelpLauncher />);
    fireEvent.click(screen.getByTestId('help-dropdown-toggle'));
    fireEvent.change(screen.getByTestId('help-dropdown-input'), { target: { value: 'gallery' } });
    const result = screen.getAllByRole('button').find(b => b.textContent?.includes('Managing product images'));
    fireEvent.click(result!);
    expect(pushMock).toHaveBeenCalledWith('/');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/mantis/dev/productport/web && npx vitest run components/help/HelpLauncher.test.tsx`
Expected: FAIL — `Error: Failed to resolve import "./HelpLauncher"`.

- [ ] **Step 3: Write `HelpLauncher.tsx`**

```tsx
// web/components/help/HelpLauncher.tsx
'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { HelpDropdown } from '@matthewdbaldwin/microport-ui/help';
import type { HelpSearchResult } from '@matthewdbaldwin/microport-ui/help/logic';
import { useAuth } from '@/contexts/AuthContext';
import { buildSearchDocs } from '@/lib/help/searchDocs';
import { recordHelpSearchMiss } from '@/lib/help/searchMiss';
import { DEFAULT_LOCALE } from '@/lib/locales';

export function HelpLauncher() {
  const { user } = useAuth();
  const router = useRouter();
  const docs = useMemo(() => buildSearchDocs(user?.locale ?? DEFAULT_LOCALE), [user?.locale]);

  const onSelect = (result: HelpSearchResult) => {
    if (result.kind === 'popover' && result.targetHref) router.push(result.targetHref);
    else router.push(`/help/${result.slug}`);
  };

  const fuzzySearch = async (
    query: string, fuzzyDocs: Parameters<typeof buildSearchDocs> extends never ? never : ReturnType<typeof buildSearchDocs>,
    fuzzyUser: typeof user,
  ) => {
    const { searchHelpFuzzy } = await import('@matthewdbaldwin/microport-ui/help/fuzzy');
    return searchHelpFuzzy(query, fuzzyDocs, fuzzyUser);
  };

  if (!user) return null;

  return (
    <HelpDropdown
      docs={docs}
      user={user}
      onSelect={onSelect}
      fuzzySearch={fuzzySearch}
      onSettledQuery={({ query, literalCount, fuzzyCount }) => {
        if (literalCount === 0 && (fuzzyCount ?? 0) === 0) {
          recordHelpSearchMiss({ query, wasFuzzyRescued: false, locale: user.locale ?? undefined });
        } else if (literalCount === 0 && (fuzzyCount ?? 0) > 0) {
          recordHelpSearchMiss({ query, wasFuzzyRescued: true, locale: user.locale ?? undefined });
        }
      }}
    />
  );
}
```

- [ ] **Step 4: Mount it in the top bar, and add the Export CSV tooltip**

`Tooltip` is already imported in `web/app/page.tsx:10` (from `@matthewdbaldwin/microport-ui`, used elsewhere in this file for the gallery close button and image labels — see lines 171-194) — no new import needed for the tooltip itself. Per the PRD's Scope item 5, CSV export gets no standalone article; the only help surface it gets is a tooltip on the export link itself.

In `web/app/page.tsx`:

```diff
 import { galleryImageSrc, disableProduct, enableProduct, type ProductInput, type GalleryImage } from '@/lib/products';
 import { useToast } from '@/components/ui/Toast';
+import { HelpLauncher } from '@/components/help/HelpLauncher';
 import s from './catalog.module.css';
```

```diff
           {isAdmin && (
-            <a className={s.btn} href="/api/products/export.csv" {...testId(NS, 'exportCsv')} style={{ textDecoration: 'none' }}>
-              Export CSV
-            </a>
+            <Tooltip content="Downloads the current catalog as a CSV, in the same column format Import CSV expects.">
+              <a className={s.btn} href="/api/products/export.csv" {...testId(NS, 'exportCsv')} style={{ textDecoration: 'none' }}>
+                Export CSV
+              </a>
+            </Tooltip>
           )}
+          <HelpLauncher />
           <a className={s.hublink} href="https://hub.microport.com">← Hub</a>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/mantis/dev/productport/web && npx vitest run components/help/HelpLauncher.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 6: Run the full catalog page suite to verify nothing else broke**

Run: `cd /home/mantis/dev/productport/web && npx vitest run app/page.test.tsx`
Expected: PASS (adjust the file name if the existing catalog page test lives elsewhere — locate it first with `find web/app -iname "page.test.*"`).

- [ ] **Step 7: Commit**

```bash
cd /home/mantis/dev/productport
git add web/components/help/HelpLauncher.tsx web/components/help/HelpLauncher.test.tsx web/app/page.tsx
git commit -m "Mount HelpDropdown in the catalog top bar (HelpLauncher)

No Profile modal exists in this app to host it — mounted in CatalogPage's
persistent top bar instead, present across all 6 in-scope logical views.
Also adds the Export CSV tooltip the PRD calls for in place of a
standalone export article (Scope item 5)."
```

---

### Task 9: `scripts/help-audit.js`

**Files:**
- Create: `scripts/help-audit.js`
- Modify: `package.json` (root — add `help:audit` script alias)
- Test: `tests/helpAudit.test.js`

**Interfaces:**
- Consumes: `web/lib/help/sections.ts` (parsed via regex — plain Node, no TS loader), `web/lib/help/content/*.ts` (existence checks), `web/lib/help/popovers.ts` (existence + usage-site checks), `web/app/**` and `web/components/**` (label + HelpButton-usage corpus), `web/messages/*.json` (locale parity).
- Produces: a CLI (`node scripts/help-audit.js [--json]`, exit 1 on any blocker).

- [ ] **Step 1: Write the failing regression test**

```js
// tests/helpAudit.test.js
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

test('help-audit.js reports zero blockers against the current repo state', () => {
  const out = execFileSync('node', [path.join(__dirname, '..', 'scripts', 'help-audit.js'), '--json'], { encoding: 'utf8' });
  const report = JSON.parse(out);
  expect(report.totals.blocker).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/mantis/dev/productport && CI=true npx jest tests/helpAudit.test.js`
Expected: FAIL — `scripts/help-audit.js` doesn't exist yet.

- [ ] **Step 3: Write the script**

```js
#!/usr/bin/env node
// scripts/help-audit.js — read-only static analyzer for ProductPort's Help
// Library. SPA-adapted from ClinicPort's model (per the PRD's explicit
// recommendation): ProductPort's whole authenticated UI is one route
// (web/app/page.tsx), so Check 1 is keyed by HELP_SECTIONS' components[]
// field rather than distinct page.tsx files.
//
//   1. Component coverage: every HELP_SECTIONS item's components[] entries
//      exist on disk. Unlike a route-keyed check, MULTIPLE items may
//      legitimately point at the same file (product-create and
//      product-edit both point at ProductEditModal.tsx) — this is NOT
//      flagged as double-coverage, unlike a route-keyed registry where
//      that would mean an ambiguous nav target.
//   2. Every registered slug has a real content module at
//      web/lib/help/content/<slug>.ts with slug/title/intro/lastUpdated/
//      sections/related present, in all 3 locales (en/zh/fr).
//   3. Locale parity for the 2 popovers (web/lib/help/popovers.ts + its
//      zh/fr siblings, which Task 4 creates — a missing sibling is a
//      WARNING not a blocker, same convention as Check 2's zh/fr articles:
//      the real enforcement is Task 4's own vitest suite, this is a
//      redundant regression detector).
//   4. Every content module's labels: [...] fields appear verbatim
//      somewhere in web/components/**, web/app/**, or web/messages/*.json
//      (stale-label detection).
//   5. Every popover constant (GALLERY_POPOVER, CLEARANCE_POPOVER) is
//      referenced by a <HelpButton content={...}> call somewhere in
//      web/app/**.
//
// Usage:
//   node scripts/help-audit.js          # human-readable summary
//   node scripts/help-audit.js --json   # machine-readable
// Also aliased as `npm run help:audit` (root package.json).

const fs   = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const WEB  = path.join(REPO, 'web');
const LOCALES = ['en', 'zh', 'fr'];

const findings = { blocker: [], warning: [], nit: [] };
const add = (sev, kind, msg, ref) => findings[sev].push({ kind, msg, ref });

function readAllSources() {
  const parts = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(tsx|ts)$/.test(e.name) && !e.name.endsWith('.test.tsx') && !e.name.endsWith('.test.ts')) {
        try { parts.push(fs.readFileSync(full, 'utf8')); } catch { /* ignore */ }
      }
    }
  }
  walk(path.join(WEB, 'components'));
  walk(path.join(WEB, 'app'));
  const msgDir = path.join(WEB, 'messages');
  if (fs.existsSync(msgDir)) {
    for (const e of fs.readdirSync(msgDir)) {
      if (e.endsWith('.json')) { try { parts.push(fs.readFileSync(path.join(msgDir, e), 'utf8')); } catch { /* ignore */ } }
    }
  }
  return parts.join('\n');
}

function loadHelpSections() {
  const file = path.join(WEB, 'lib', 'help', 'sections.ts');
  if (!fs.existsSync(file)) {
    add('blocker', 'missing-sections-registry', 'web/lib/help/sections.ts not found.', file);
    return [];
  }
  const src = fs.readFileSync(file, 'utf8');
  const items = [];
  const itemRe = /\{[^{}]*?slug:\s*'([\w-]+)'[^{}]*\}/g;
  let m;
  while ((m = itemRe.exec(src)) !== null) {
    const block = m[0];
    const statusMatch = block.match(/status:\s*'(live|stub)'/);
    if (!statusMatch) continue;
    const rolesMatch = block.match(/roles:\s*(ADMIN|\[([^\]]*)\])/);
    let roles = null;
    if (rolesMatch) roles = rolesMatch[1] === 'ADMIN' ? ['product_admin', 'superuser'] : (rolesMatch[2].match(/'([\w-]+)'/g) || []).map(s => s.replace(/'/g, ''));
    const componentsMatch = block.match(/components:\s*\[([^\]]*)\]/);
    const components = componentsMatch ? (componentsMatch[1].match(/'([^']*)'/g) || []).map(s => s.replace(/'/g, '')) : [];
    items.push({ slug: m[1], status: statusMatch[1], roles, components });
  }
  return items;
}

const helpItems = loadHelpSections();
const cachedSrc = readAllSources();

// ── Check 1 — component coverage (relaxed uniqueness) ─────────────────────
for (const item of helpItems) {
  if (item.components.length === 0) {
    add('blocker', 'no-components-declared', `HELP_SECTIONS item "${item.slug}" declares no components[].`, item.slug);
    continue;
  }
  for (const comp of item.components) {
    const full = path.join(WEB, comp);
    if (!fs.existsSync(full)) add('blocker', 'component-missing', `"${item.slug}" points at ${comp}, which doesn't exist.`, comp);
  }
}

// ── Check 2 — content module + locale coverage ─────────────────────────────
for (const item of helpItems) {
  if (item.status !== 'live') continue;
  for (const locale of LOCALES) {
    const suffix = locale === 'en' ? '' : `.${locale}`;
    const file = path.join(WEB, 'lib', 'help', 'content', `${item.slug}${suffix}.ts`);
    if (!fs.existsSync(file)) {
      add(locale === 'en' ? 'blocker' : 'warning', 'content-locale-missing', `"${item.slug}" has no ${locale} content module.`, file);
      continue;
    }
    const src = fs.readFileSync(file, 'utf8');
    for (const field of ['slug', 'title', 'intro', 'lastUpdated', 'sections', 'related']) {
      if (!new RegExp(`\\b${field}:`).test(src)) add('blocker', 'content-field-missing', `"${item.slug}" (${locale}) content is missing the "${field}" field.`, file);
    }
  }
}

// ── Check 3 — popover locale parity ─────────────────────────────────────────
// Same severity convention as Check 2: the real enforcement is Task 4's own
// vitest suite (buildSearchDocs resolves locale-aware content); this is a
// redundant regression detector, so a missing zh/fr module is a warning, not
// a blocker — same as a missing zh/fr article module above.
const popoverFile = path.join(WEB, 'lib', 'help', 'popovers.ts');
if (!fs.existsSync(popoverFile)) {
  add('blocker', 'popovers-missing', 'web/lib/help/popovers.ts not found.', popoverFile);
} else {
  for (const locale of ['zh', 'fr']) {
    const file = path.join(WEB, 'lib', 'help', `popovers.${locale}.ts`);
    if (!fs.existsSync(file)) {
      add('warning', 'popover-locale-missing', `popovers.ts has no ${locale} translation module.`, file);
    }
  }
}

// ── Check 4 — stale-label detection ─────────────────────────────────────────
const contentDir = path.join(WEB, 'lib', 'help', 'content');
if (fs.existsSync(contentDir)) {
  for (const f of fs.readdirSync(contentDir)) {
    if (!f.endsWith('.ts')) continue;
    const src = fs.readFileSync(path.join(contentDir, f), 'utf8');
    const labelsMatch = src.match(/labels:\s*\[([^\]]*)\]/g) || [];
    for (const block of labelsMatch) {
      const labels = (block.match(/'([^']*)'/g) || []).map(s => s.replace(/'/g, ''));
      for (const label of labels) {
        if (label.length < 3) continue;
        if (!cachedSrc.includes(label)) add('warning', 'stale-ui-label-in-article', `"${label}" (in ${f}) not found verbatim in web/components, web/app, or messages.`, f);
      }
    }
  }
}

// ── Check 5 — popover wiring ─────────────────────────────────────────────────
for (const [constName, label] of [['GALLERY_POPOVER', 'gallery popover'], ['CLEARANCE_POPOVER', 'Clearance popover']]) {
  if (!new RegExp(`content=\\{${constName}\\}`).test(cachedSrc)) {
    add('blocker', 'popover-not-wired', `${constName} (the ${label}) is not referenced by any <HelpButton content={...}> call.`, constName);
  }
}

// ── output ───────────────────────────────────────────────────────────────────
const totals = { blocker: findings.blocker.length, warning: findings.warning.length, nit: findings.nit.length };
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ totals, findings }, null, 2));
} else {
  for (const sev of ['blocker', 'warning', 'nit']) {
    for (const f of findings[sev]) console.log(`[${sev.toUpperCase()}] ${f.kind}: ${f.msg} (${f.ref})`);
  }
  console.log(`\nTotals: ${totals.blocker} blocker(s), ${totals.warning} warning(s), ${totals.nit} nit(s).`);
}
process.exit(totals.blocker > 0 ? 1 : 0);
```

- [ ] **Step 4: Add the `help:audit` script alias**

In root `package.json`'s `scripts` block:

```diff
   "lint": "eslint src"
+  ,"help:audit": "node scripts/help-audit.js"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/mantis/dev/productport && CI=true npx jest tests/helpAudit.test.js`
Expected: PASS — 0 blockers (fix any it finds by re-checking the affected task's files before moving on; a red run here means either the registry/content/popover wiring drifted from an earlier task, or this script's own parsing needs adjusting to the actual file shapes — verify against the real files before assuming the script's regex is wrong).

- [ ] **Step 6: Commit**

```bash
cd /home/mantis/dev/productport
git add scripts/help-audit.js package.json tests/helpAudit.test.js
git commit -m "Add scripts/help-audit.js — SPA-adapted static Help Library checker

Component-keyed coverage check (not route-keyed) with relaxed uniqueness
for product-create/product-edit sharing ProductEditModal.tsx. Adds
help:audit alias, matching the fleet convention."
```

---

## Post-plan note for the executor

After all 9 tasks land, run the full suite once end-to-end (`CI=true npm run test:ci` at the repo root, `npx vitest run` in `web/`) before handing off to `superpowers:finishing-a-development-branch` — this plan's tasks each verify their own slice, but no task re-runs the *whole* suite together. Then run `node scripts/help-audit.js` one more time as a final gate, matching the fleet's `/ship` Hunt-stage convention (not wired into `ci.yml` by this plan — that's a separate, later decision, matching how the other satellites' `help-audit.js` scripts aren't CI-gated either).
