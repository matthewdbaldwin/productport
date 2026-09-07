-- Release 2 of the 10 -> 8 therapeutic-area taxonomy migration: re-file the
-- catalog rows that already exist. Release 1 (the additive contract,
-- microport-contracts 0.21.0) is already live, so both vocabularies validate
-- and there is no window where the database holds values the write path
-- rejects. Design + rationale:
-- docs/superpowers/specs/2026-09-06-productport-therapeutic-area-taxonomy-design.md
--
-- GENERATED from src/lib/therapeuticAreaMigration.js, the same rule table the
-- seed-CSV rewriter uses. Do not hand-edit: tests/therapeuticAreaMigration.test.js
-- regenerates this file and fails if the two drift apart.
--
-- Prisma 7 + adapter-pg migrations are NOT transactional
-- (feedback_prisma7_non_transactional_migrations), so every statement stands
-- alone and is individually idempotent: each WHERE matches only retired
-- values, so a second run touches zero rows.
--
-- The three identity mappings are deliberately absent — those names survive
-- the migration unchanged, which is why 177 of the 417 rows are untouched by
-- design and the post-migration recount must expect that rather than read it
-- as a failure.
--
-- Soft-deleted rows are migrated too (no deletedAt filter): restoring one
-- must not resurrect a retired area.

-- Rule 1 - RENAME. Destination depends only on the old area.
UPDATE "products" SET "therapeuticArea" = 'Comprehensive Cardiac Care' WHERE "therapeuticArea" = 'Coronary and Structural Heart';
UPDATE "products" SET "therapeuticArea" = 'Comprehensive Cardiac Care' WHERE "therapeuticArea" = 'Heart Failure and Electrophysiology';
UPDATE "products" SET "therapeuticArea" = 'Aortic and Peripheral Vascular Intervention' WHERE "therapeuticArea" = 'Aortic and Peripheral Vasculature';
UPDATE "products" SET "therapeuticArea" = 'Robotics, Life Support, and Clinical AI' WHERE "therapeuticArea" = 'Robotic Surgery, AI, and Telesurgery';
UPDATE "products" SET "therapeuticArea" = 'Neuroscience and Neural Interfaces' WHERE "therapeuticArea" = 'Neurovascular and Brain-Computer Interfaces';
UPDATE "products" SET "therapeuticArea" = 'Advanced Biotechnology and Medical Aesthetics' WHERE "therapeuticArea" = 'Regenerative Medicine and Medical Aesthetics';

-- Rule 2 - SPLIT. Emergency and Critical Care retires with no successor and splits on
-- category. It is the only area needing row-level logic.
UPDATE "products" SET "therapeuticArea" = 'Robotics, Life Support, and Clinical AI' WHERE "therapeuticArea" = 'Emergency and Critical Care' AND "category" = 'Extracorporeal life support';
UPDATE "products" SET "therapeuticArea" = 'Comprehensive Cardiac Care' WHERE "therapeuticArea" = 'Emergency and Critical Care' AND "category" = 'Occluders & closure devices';
UPDATE "products" SET "therapeuticArea" = 'Urology, Oncology, and Gastroenterology' WHERE "therapeuticArea" = 'Emergency and Critical Care' AND "category" = 'Surgical instruments';

-- Guard. Mirrors mapTherapeuticArea returning null rather than guessing: a row
-- still sitting in the retired area is uncategorised, or carries a category the
-- split table has never seen. Stop the deploy rather than strand it silently.
DO $$
DECLARE
  stranded INTEGER;
BEGIN
  SELECT count(*) INTO stranded FROM "products" WHERE "therapeuticArea" = 'Emergency and Critical Care';
  IF stranded > 0 THEN
    RAISE EXCEPTION 'therapeutic-area migration: % row(s) still hold the retired area Emergency and Critical Care. Their category is missing, or absent from SPLIT_BY_CATEGORY in src/lib/therapeuticAreaMigration.js.', stranded;
  END IF;
END $$;
