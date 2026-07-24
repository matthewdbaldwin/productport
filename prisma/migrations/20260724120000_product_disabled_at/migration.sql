-- Reversible admin kill-switch for products: `disabledAt` (nullable timestamp).
-- Set = hidden from the viewer catalog + public detail (a 404 for viewers), but
-- NOT deleted; admins still see it (badged "Disabled") and can re-enable. Distinct
-- from deletedAt (trash) and from the DISCONTINUED status (a visible commercial
-- state). Prisma 7 + adapter-pg migrations are NOT transactional
-- (feedback_prisma7_non_transactional_migrations), so the statement is idempotent.
-- One nullable column; no backfill, no enum touched.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "disabledAt" TIMESTAMP(3);
