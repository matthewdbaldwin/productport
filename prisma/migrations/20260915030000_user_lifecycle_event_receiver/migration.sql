-- hubport#133: adopt microport-auth's shared lifecycle receiver
-- (createLifecycleReceiver, 0.17.0). See its README "Lifecycle receiver:
-- adopter migration". Same statements as finport's 20260914220000.
--
-- Idempotent by design: migrations are NOT transactional under the Prisma 7
-- PrismaPg adapter, so every statement must be safely re-runnable.
-- feedback_prisma7_non_transactional_migrations.

-- Claim-ownership token. TIMESTAMP(3): the module compares it for equality
-- (updateMany WHERE claimedAt = <token>), so it must keep millisecond precision.
ALTER TABLE "user_lifecycle_events" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);

-- X-Lifecycle-Event-Id as an integer (HubPort's LifecycleOutbox.id); null = a
-- row written before adoption.
ALTER TABLE "user_lifecycle_events" ADD COLUMN IF NOT EXISTS "senderSeq" INTEGER;
CREATE INDEX IF NOT EXISTS "user_lifecycle_events_email_senderSeq_idx"
  ON "user_lifecycle_events" ("email", "senderSeq");

-- Per-user ordering watermark for the apply plug: a user write only lands when
-- the incoming senderSeq is not older, in the same statement (kevlar round 2).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lifecycleSeq" INTEGER;

-- Legacy ids. Pre-adoption rows (SalesPort-era, or HubPort body-only deliveries)
-- share HubPort's id space in "senderEventId". A numeric one that collides with
-- a new HubPort delivery would 409 id_conflict and park the event, withholding a
-- revoke. Prefix them out of that space; 'legacy:' can never parse as an id.
-- Re-runnable: already-prefixed rows are excluded, and every row the receiver
-- writes carries senderSeq, so none of those match.
UPDATE "user_lifecycle_events" SET "senderEventId" = 'legacy:' || "senderEventId"
 WHERE "senderSeq" IS NULL AND "senderEventId" IS NOT NULL AND "senderEventId" NOT LIKE 'legacy:%';
