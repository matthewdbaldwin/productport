# ProductPort build-state: SPA-routed or genuinely early-stage?

Research ticket for GitHub issue [matthewdbaldwin/hubport#41](https://github.com/matthewdbaldwin/hubport/issues/41), a child of the wayfinder map issue #40 ("ProductPort + HubPort Help Library PRDs"). Investigated 2026-08-09 against `/home/mantis/dev/productport` at commit `e0a9bd5` (branch `develop`).

## Answer: SPA-under-one-route — the catalog UI is fully built, just client-routed under `/`

ProductPort's `web/app` directory really does have only 3 Next.js routes (`/`, `/login`, `/auth/callback`), but that is **not** evidence of an early-stage build. It's the same pattern ClinicPort had before its 2026-05-05 Help wire-up: a single root page (`web/app/page.tsx`) that does its own internal view-switching — browse/search/filter, a product-detail overlay, a create/edit form, and a CSV import flow — all as client-side state and modals layered on one route, plus a fully-built Express/Prisma API behind it. This is **not** "genuinely early/unbuilt" and **not** "API built, web UI not started" — both the API and the web UI are built and shipping actively.

## Evidence

### 1. `web/app/page.tsx` — `CatalogPage`, a de facto SPA behind one route

`web/app/page.tsx:343` — `export default function CatalogPage()` is the entire content of the `/` route. It manages multiple logical "screens" purely through React state, no routing:

- **Browse/search/filter (default view).** Client-side state for query, therapeutic area, subsidiary, market/region, and category (`web/app/page.tsx:349-353`), filtered in-memory via `filterProducts` (`web/app/page.tsx:14,428-431`, from `web/lib/catalogFilter`). Grid render at `web/app/page.tsx:564-598`. The file's own header comment (`web/app/page.tsx:6-8`) states the design intent explicitly: *"load the whole (small) catalog once, then search / filter / detail entirely in memory."*
- **Product detail view.** `openId` state (`web/app/page.tsx:357-359`) opens a `DetailModal` (`web/app/page.tsx:131-341`, mounted at `608-616`). It is deep-linkable — the open product is reflected in the URL via `?product=<slug>` (`web/app/page.tsx:403-415`) with a canonical-link tag kept in sync, and there's a "Copy link" affordance (`web/app/page.tsx:152-158,220-232`) explicitly for hub.microport.com and others to deep-link straight into a product.
- **Product create/edit view.** `editState` state (`web/app/page.tsx:362`) opens `ProductEditModal` (`web/app/ProductEditModal.tsx`, mounted at `web/app/page.tsx:618-631`), admin-gated (`isAdmin`, `web/app/page.tsx:361`). The component's own header comment calls it *"the product_admin catalog editor (Slice 2)"* (`web/app/ProductEditModal.tsx:1-4`) — full create/edit form, image gallery management, and clearance-matrix editing all live here.
- **CSV import view.** `ImportCsvButton` (`web/app/ImportCsvButton.tsx`, imported `web/app/page.tsx:17`, mounted admin-only at `web/app/page.tsx:468`). Its header comment calls it *"product_admin bulk CSV upload (Slice 3)"* (`web/app/ImportCsvButton.tsx:1-4`) — includes a "Verify (dry run)" preflight mode and a downloadable per-row error report on partial failure.
- **CSV export.** A direct link to `/api/products/export.csv`, admin-only (`web/app/page.tsx:470-472`).

The "Slice 2" / "Slice 3" comments indicate a phased build plan that has already shipped multiple slices — this is mid-to-late build-out, not scaffolding.

### 2. `web/components/` — thin; the real component surface lives in `web/app/`

`web/components/` only holds `BugReportButton.tsx`, `LocaleProvider.tsx`, and `ui/Toast.tsx` — generic chrome, not catalog UI. The catalog-specific components (`ProductEditModal.tsx`, `ImportCsvButton.tsx`) live directly in `web/app/` alongside `page.tsx` rather than under `components/`, which is why a routes-only scan of `web/app` undercounts what's actually built — the catalog, detail, edit, and import UIs are all there, just not as separate route files.

### 3. `CONTEXT.md` — mature domain modeling, not an early-stage stub

`/home/mantis/dev/productport/CONTEXT.md` describes ProductPort as *"The product catalog and regulatory system of record: descriptive product data, regulatory-clearance status, and clinical evidence, organized by subsidiary and therapeutic area"* and defines a precise, already-settled glossary (Clearance vs. RegulatoryClearance vs. CountryClearance vs. Material ref), backed by a real ADR at `docs/adr/0001-country-clearance-excludes-regulatory-clearance-jurisdictions.md`. This is the language of a system that has already made and documented non-trivial domain decisions, not one still figuring out its shape.

### 4. Backend (`src/routes/products.js`) — fully built API, matching the UI feature-for-feature

ProductPort follows the hubport-style API+web split (`package.json:main` = `src/server.js`, `name: "productport-api"`). `src/routes/products.js` (400 lines) exposes 15 endpoints covering everything the UI uses:

```
GET    /                          list (src/routes/products.js:77)
GET    /export.csv                CSV export, admin (94)
GET    /:slug                     detail (120)
POST   /                          create, admin (138)
PATCH  /:slug                     update, admin (154)
PUT    /:slug/clearances          clearance matrix, admin (179)
POST   /import                    CSV bulk upsert, admin (206, via importProducts.js:17)
GET    /:slug/image               primary image (259)
GET    /:slug/image/:imageId      gallery image (271)
POST   /:slug/image               upload, admin (289)
POST   /:slug/image/:imageId/primary  set primary, admin (315)
DELETE /:slug/image/:imageId      delete gallery image, admin (331)
DELETE /:slug                     delete product, admin (356)
POST   /:slug/disable             admin kill-switch (372)
POST   /:slug/enable              admin kill-switch (387)
```

There's also a cross-app read API for OpsPort (`src/routes/opsport.js:31,56` — product list + per-country clearance lookup, key-gated via `requireOpsportKey`), which the most recent commit (`e0a9bd5`) extends. API and UI are in lockstep, not API-ahead-of-UI.

### 5. `git log --oneline -30` — active work is catalog-UI and cross-app integration, not just auth/infra

Recent commit themes span security/auth hardening *and* substantial catalog feature work — not concentrated in one area:

- `e0a9bd5` fix(opsport): exclude DRAFT products from cross-app picker + clearance-resolve
- `40dc312` feat(web): standardize testid/tooltip/theme coverage **across catalog UI**
- `c21d960` fix(web): stop gallery edits from discarding unsaved product fields; cap BugReportModal height
- `da0d120` feat: **CountryClearance model** + inbound OpsPort read API (productport#6)
- `4dfefa9` docs: glossary + ADR for CountryClearance vs RegulatoryClearance split
- `e56af44` (just prior to shown window per earlier log) feat: formula-guard catalog CSV export + import error report
- Several `fix(auth)`/`fix(security)` commits (SSO loop guard, cookie/CSP, log redaction) interleaved with the above

This is a maturing, actively-worked catalog app, not one where recent effort has drifted away from the catalog toward pure plumbing.

### 6. Help Library readiness: greenfield, not blocked

`grep -rl "HelpButton|helpKey|HELP_SECTIONS" web src` returns **zero** hits in application code (only inside `node_modules`). `@matthewdbaldwin/microport-ui` is pinned at `^0.38.1` (`web/package.json:16`) and its published dist already includes a `help/` module and `HelpButton` component — so the shared Help primitive is available as a dependency, it's just never been imported into ProductPort's own code yet. This matches the `help-coverage` agent's own note that ProductPort has neither a wired `HelpButton` nor a `scripts/help-audit.js` — a known, not a newly-discovered, gap.

## Practical implication for the Help Library plan

**Buildable now — do not wait.** The catalog feature set is not "still being built"; it's a shipping, actively-iterated SPA with a stable, fully-built API underneath it. A Help Library slice can be scoped today.

Because it's SPA-under-one-route, a help-audit tool (or a manually-authored `HELP_SECTIONS` registry) needs to key on **logical views**, not Next.js routes — mirroring how ClinicPort's help-audit script became SPA-aware:

1. **Catalog browse/search/filter** (default view of `/`) — the therapeutic-area/subsidiary/market/category filter rail and search box (`web/app/page.tsx:441-558`).
2. **Product detail** (`DetailModal`, opened via card click or the `?product=<slug>` deep link) — `web/app/page.tsx:131-341`.
3. **Product create** (`ProductEditModal`, `mode: 'create'`, admin-only) — `web/app/ProductEditModal.tsx`.
4. **Product edit** (`ProductEditModal`, `mode: 'edit'`, admin-only) — same component, includes gallery management and the clearance-status matrix as sub-sections that likely want their own help keys.
5. **CSV import** (`ImportCsvButton` flow: file picker → verify/dry-run → import → error report, admin-only) — `web/app/ImportCsvButton.tsx`.
6. **CSV export** — a plain link, probably doesn't need its own help key beyond a tooltip.
7. **Login** (`/login`) and **Auth callback** (`/auth/callback`) — real routes, standard SSO help content pattern already used elsewhere in the fleet.

Recommend wiring `HelpButton` (already available via `microport-ui@^0.38.1`) into these 5-7 logical surfaces and building a ProductPort `scripts/help-audit.js` modeled on ClinicPort's SPA-aware version, rather than waiting for more routes to appear — none are coming; this app's shape is one root page with modals, by design.
