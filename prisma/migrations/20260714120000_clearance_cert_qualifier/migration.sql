-- Certificate-number + validity-qualifier for regulatory clearances (WS2).
-- Prisma 7 + adapter-pg migrations are NOT transactional
-- (feedback_prisma7_non_transactional_migrations), so each statement is
-- individually idempotent. Two nullable columns; no backfill, no enum touched
-- (the caveat vocabulary is an app-validated string in src/lib/clearanceQualifier.js,
-- not a Postgres enum — this avoids an enum rebuild).
ALTER TABLE "regulatory_clearances" ADD COLUMN IF NOT EXISTS "certificateNumbers" TEXT;
ALTER TABLE "regulatory_clearances" ADD COLUMN IF NOT EXISTS "qualifier" TEXT;
