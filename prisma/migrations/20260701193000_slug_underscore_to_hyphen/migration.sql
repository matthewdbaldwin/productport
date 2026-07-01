-- Normalize the 9 legacy underscore slugs to the canonical hyphen form so they
-- pass validateProductWrite's SLUG_RE (which rejects underscores) and stay
-- interchangeable with the master CSV importer's upsert-on-slug key.
--
-- Renamed in-place (not delete+recreate) so ProductAudit / RegulatoryClearance /
-- Trial FKs (keyed on productId, not slug) are untouched. Idempotent: the WHERE
-- clause matches nothing on a second run, and each UPDATE only fires if the old
-- slug still exists. Image filenames keep their underscores (real files on disk).
-- Prisma 7 + adapter-pg: migrations are NOT transactional, so each statement
-- stands alone and is individually safe to re-run.
UPDATE "products" SET slug = 'firehawk-liberty'   WHERE slug = 'firehawk_liberty';
UPDATE "products" SET slug = 'firefighter-pro'    WHERE slug = 'firefighter_pro';
UPDATE "products" SET slug = 'firefighter-ncpro'  WHERE slug = 'firefighter_ncpro';
UPDATE "products" SET slug = 'vitaflow-liberty'   WHERE slug = 'vitaflow_liberty';
UPDATE "products" SET slug = 'vitaflow-flex'      WHERE slug = 'vitaflow_flex';
UPDATE "products" SET slug = 'pulsemagic-cath'    WHERE slug = 'pulsemagic_cath';
UPDATE "products" SET slug = 'pulsemagic-gen'     WHERE slug = 'pulsemagic_gen';
UPDATE "products" SET slug = 'optimablate-gen'    WHERE slug = 'optimablate_gen';
UPDATE "products" SET slug = 'optimablate-pump'   WHERE slug = 'optimablate_pump';
