-- HelpSearchMiss (Help Library, Task 5): one row per zero-literal-result help
-- search, so content revisions target OBSERVED gaps instead of guesses. role
-- and userId are server-derived from the session (src/routes/help.js), never
-- trusted from the client body. userId is ON DELETE SET NULL — a search-miss
-- row is analytics, not owned content that should vanish with its user. FK
-- targets "User" (this repo's default-cased table, see the schema header).
-- Prisma 7 + adapter-pg migrations are NOT transactional
-- (feedback_prisma7_non_transactional_migrations), so every statement is
-- individually idempotent, mirroring 20260807150000_country_clearance.
CREATE TABLE IF NOT EXISTS "help_search_misses" (
    "id"              SERIAL NOT NULL,
    "query"           TEXT NOT NULL,
    "locale"          TEXT NOT NULL,
    "role"            TEXT NOT NULL,
    "wasFuzzyRescued" BOOLEAN NOT NULL DEFAULT false,
    "userId"          INTEGER,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "help_search_misses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "help_search_misses_createdAt_idx" ON "help_search_misses"("createdAt");
CREATE INDEX IF NOT EXISTS "help_search_misses_query_idx" ON "help_search_misses"("query");

DO $$ BEGIN
  ALTER TABLE "help_search_misses"
    ADD CONSTRAINT "help_search_misses_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
