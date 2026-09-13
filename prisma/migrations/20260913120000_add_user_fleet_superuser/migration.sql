-- User.fleetSuperuser (productport#11, hubport#88): the fleet-wide superuser
-- bypass flag, synced from HubPort lifecycle events. Defaults false, so every
-- existing row keeps its current access. A constant default makes this a
-- metadata-only change on Postgres 11+ (no table rewrite).
-- Prisma 7 + adapter-pg migrations are NOT transactional
-- (feedback_prisma7_non_transactional_migrations), so it is idempotent.
-- Table is default-cased "User" in this repo (see the schema header).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fleetSuperuser" BOOLEAN NOT NULL DEFAULT false;
