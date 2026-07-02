-- Inbound SSO-lifecycle event audit + idempotency store (fleet parity). Idempotent
-- DDL — Prisma 7 + adapter-pg migrations are NOT transactional, so every statement
-- is individually safe to re-run (CREATE TABLE/INDEX IF NOT EXISTS; the unique
-- index on senderEventId is created IF NOT EXISTS so a partial re-apply is clean).
CREATE TABLE IF NOT EXISTS "user_lifecycle_events" (
    "id"            TEXT NOT NULL,
    "senderEventId" TEXT,
    "email"         TEXT NOT NULL,
    "kind"          TEXT NOT NULL,
    "prevRole"      TEXT,
    "newRole"       TEXT,
    "actorEmail"    TEXT,
    "actorRole"     TEXT,
    "payload"       JSONB NOT NULL,
    "receivedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt"   TIMESTAMP(3),
    "error"         TEXT,
    CONSTRAINT "user_lifecycle_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_lifecycle_events_senderEventId_key" ON "user_lifecycle_events"("senderEventId");
CREATE INDEX IF NOT EXISTS "user_lifecycle_events_email_idx" ON "user_lifecycle_events"("email");
CREATE INDEX IF NOT EXISTS "user_lifecycle_events_receivedAt_idx" ON "user_lifecycle_events"("receivedAt");
