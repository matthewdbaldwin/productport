# ProductPort Therapeutic-Area Taxonomy — 10 → 8 — Design

**Date:** 2026-09-06
**Status:** Approved design, pending implementation plan
**Tracks:** Replaces the canonical-10 therapeutic-area vocabulary
(`microport-contracts` `THERAPEUTIC_AREAS`, in force since 2026-07-01) with a
stakeholder-supplied 8-area taxonomy, and re-files all 417 catalog products.

## Goal

Retire the canonical 10 therapeutic areas and adopt the 8 supplied by the catalog
stakeholder, with every one of the 417 products landing in exactly one new area —
no nulls, no catch-all, no row left on a retired value.

## The new eight

The stakeholder list, as supplied, with **one amendment** (see Decision A below):

| # | Area | Products |
|---|------|---------:|
| 1 | Comprehensive Cardiac Care | 135 |
| 2 | Aortic and Peripheral Vascular Intervention | 33 |
| 3 | Robotics, Life Support, and Clinical AI | 25 |
| 4 | Neuroscience and Neural Interfaces | 26 |
| 5 | Orthopedic Joint, Spine, and Trauma | 105 |
| 6 | Urology, Oncology, and Gastroenterology | 54 |
| 7 | **Endocrinology and Reproductive Health** *(amended)* | 19 |
| 8 | Advanced Biotechnology and Medical Aesthetics | 20 |
| | **Total** | **417** |

### Decision A — area 7 is renamed, not adopted verbatim

The supplied name was "Endocrinology, Reproductive Health, and Regenerative
Medicine". The catalog's regenerative and biologic products (oral bone grafting
material, dermatological gel) belong with the aesthetics/biotech cluster in area
8, which leaves area 7 holding only insulin pumps, hormone pulse-infusion pumps,
IVF consumables and embryo-transfer catheters. Naming it after a category it does
not contain would mislead every downstream reader — the ProductPort catalog
filter, the ReviewPort product picker, and the public website.

Area 7 therefore takes the name **"Endocrinology and Reproductive Health"**,
which is identical to the existing canonical value, making it a no-op for all 19
of its rows.

**Accepted trade-off:** area 8 correspondingly widens to absorb regenerative,
dental and ophthalmic products its name does not announce. This was weighed
against adding a ninth "Surgical Vision and Dental" area and rejected: a
4-product area is hard to defend on a public catalog page. The cost is that area
8 is a soft catch-all. Three rows are flagged for catalog-owner sign-off below.

## Background — where the vocabulary actually lives

The therapeutic-area list is not a ProductPort constant. It is an exported
controlled vocabulary with a server-side enforcement path:

- **Source of truth:** `microport-contracts` — `THERAPEUTIC_AREAS` and
  `THERAPEUTIC_AREA_SET` (`dist/index.js:1177`).
- **ProductPort re-export:** `src/lib/therapeuticAreas.js` (a thin passthrough).
- **Hardcoded mirrors (drift risk):** `web/lib/products.ts:12` (edit-form
  dropdown) and `web/lib/catalogFilter.js:10` (catalog display order). Both carry
  "keep in sync" comments; neither imports the contract.
- **Write-path validators:** `src/lib/productWrite.js:84` (API create/update) and
  `src/lib/productRow.js:46` (CSV import) both reject any value outside the set.
- **User-facing copy:** `web/lib/help/content/csv-import.ts:50` states the value
  must be "one of the ten canonical names".

Non-consumers, verified rather than assumed:

- **ReviewPort** renders `therapeuticArea` as an opaque display string in
  `web/components/products/ProductportPickerModal.tsx` with no validation. No
  change required.
- **EngagePort** has a `therapeuticAreas` field, but it is a free-text
  comma-separated *physician specialty* list on the KOL record — an unrelated
  axis. No change required.

Blast radius is therefore `microport-contracts` + ProductPort only.

## Migration rules

The entire re-filing is nine renames plus one category-keyed split. Verified
against `prisma/seed-data/seed_products.csv` (417 rows): 417 placed, 0 unmapped,
0 targets outside the new eight.

### Rule 1 — rename by old area (400 rows)

| Old area | New area |
|---|---|
| Coronary and Structural Heart | Comprehensive Cardiac Care |
| Heart Failure and Electrophysiology | Comprehensive Cardiac Care |
| Aortic and Peripheral Vasculature | Aortic and Peripheral Vascular Intervention |
| Robotic Surgery, AI, and Telesurgery | Robotics, Life Support, and Clinical AI |
| Neurovascular and Brain-Computer Interfaces | Neuroscience and Neural Interfaces |
| Orthopedic Joint, Spine, and Trauma | *(unchanged)* |
| Urology, Oncology, and Gastroenterology | *(unchanged)* |
| Endocrinology and Reproductive Health | *(unchanged — see Decision A)* |
| Regenerative Medicine and Medical Aesthetics | Advanced Biotechnology and Medical Aesthetics |

Two merges and one wholesale adoption are worth calling out:

- The **cardiac merge** is the largest single change: two areas (76 + 55) become
  one 135-product area, the biggest in the catalog.
- **Neuroscience and Neural Interfaces** is a pure rename — the widened name
  covers the existing 26 neurovascular and BCI products without moving any row.
- **Advanced Biotechnology and Medical Aesthetics** inherits the old
  regenerative/aesthetics bucket *whole* (all 20 rows), including the dental and
  ophthalmic products Decision A places there.

### Rule 2 — split `Emergency and Critical Care` by category (17 rows)

This area has no successor and is the only place where a row's destination
depends on something other than its current area. It splits cleanly on
`category`, which is populated for all 17:

| `category` | New area | Rows |
|---|---|---:|
| `Extracorporeal life support` | Robotics, Life Support, and Clinical AI | 12 |
| `Occluders & closure devices` | Comprehensive Cardiac Care | 4 |
| `Surgical instruments` | Urology, Oncology, and Gastroenterology | 1 |

The 12 extracorporeal products (MOBYBOX, SleekFlow, Vitasprings, Infinity115,
Wellsprings, LifeWell cardioplegia) are the *Life Support* the new area 3 is
named for. The 4 Evermend occluders (ASD/VSD/PDA plus the DS delivery system) are
structural-heart devices that were only ever filed under critical care by
accident of the old taxonomy.

### Rows flagged for catalog-owner sign-off

Three placements are defensible but not derivable from the data. They migrate to
the stated destination and are recorded as provisional:

| Product | Placement | Why it needs a human |
|---|---|---|
| Blessing® PURE Polypropylene Hernia Mesh | 6 · Urology, Oncology, and Gastroenterology | Abdominal-wall repair is general surgery; area 6 is the nearest anatomical fit, not a clinical match. |
| YairDent® implant system ×2 (fixtures, prosthetic components) | 8 · Advanced Biotechnology and Medical Aesthetics | Dental implants are titanium skeletal hardware; area 5 is arguably a better clinical fit than area 8. Placed in 8 under Decision A to keep the dental cluster together with Oral Bone Grafting Materials. |
| YINI® phacoemulsification / vitrectomy system | 8 · Advanced Biotechnology and Medical Aesthetics | Ophthalmic surgical capital equipment. The new taxonomy has no ophthalmology; this is the accepted cost of Decision A rather than a fit. |

## Rollout — additive contract, migrate, then retire

A single-step contract swap would leave a window in which the database holds
values the validator rejects — every write and CSV import against a not-yet-
migrated row would 400. The rollout is therefore three ordered releases:

**Release 1 — additive contract.** Publish `microport-contracts` exporting the
union of both vocabularies — **15 distinct values**, being the old 10 plus the 5
genuinely new names (areas 5, 6 and 7 keep names the old set already had). Both
vocabularies validate. ProductPort bumps to it and ships; no
behaviour changes. The hardcoded mirrors in `web/lib/products.ts` and
`web/lib/catalogFilter.js` are switched to import from the contract in this
release, so the drift risk is closed before the values move.

**Release 2 — data migration.** A Prisma migration applies Rules 1 and 2 as
`UPDATE ... WHERE therapeuticArea = ...` statements, run against dev, verified by
recount, then prod. It must be idempotent: re-running it is a no-op because every
`WHERE` clause matches only retired values. The three unchanged names mean 19 +
105 + 53 = 177 rows are untouched by design, which the post-migration recount
must expect rather than treat as failure. `prisma/seed-data/seed_products.csv` is
regenerated from the migrated data in the same release so `npm run seed` stays
loadable.

**Release 3 — retire the old ten.** `microport-contracts` drops the retired
values, ProductPort bumps, and the help copy at
`web/lib/help/content/csv-import.ts:50` changes "ten canonical names" to "eight".
Any CSV a user saved before the migration now fails import with the existing
`invalid therapeutic_area` error, which names the valid set — acceptable, and the
reason the help copy must change in the same release.

## Testing

- **Migration correctness:** a test asserting the rule table maps all 417 seed
  rows to exactly one of the eight, with zero unmapped and zero out-of-set
  targets — the check already run against the seed CSV, promoted to a test so it
  guards the migration rather than a one-off script.
- **Per-area counts:** assert the eight expected totals (135/33/25/26/105/54/19/20).
  A silent rule error that still sums to 417 is the failure mode this catches.
- **Idempotency:** run the migration twice against a dev snapshot; the second run
  must change zero rows.
- **Validator round-trip:** existing `productWrite` / `productRow` tests re-run
  against the new set — an unknown area still rejects, each of the eight accepts.
- **Mirror removal:** a test that fails if `web/lib/products.ts` or
  `web/lib/catalogFilter.js` reintroduces a literal area list instead of
  importing the contract.

## Out of scope

- Populating `tier` and `classification`, still empty on all 417 rows
  (`project_productport_catalog_data_gaps`).
- Reconciling `businessSegment` against Karlie's 12-code `productHierarchy`. That
  is a separate catalog-owner mapping decision and is untouched here.
- Any ReviewPort or EngagePort change — both verified as non-consumers.
