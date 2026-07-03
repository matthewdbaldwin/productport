-- ProductPort admin builder Slice 1 — strategic product tier.
-- Additive + idempotent (Prisma 7 migrations are NOT transactional with the
-- adapter-pg engine, so every DDL guards against a partial prior apply).

-- CreateEnum (guarded — CREATE TYPE has no IF NOT EXISTS)
DO $$ BEGIN
  CREATE TYPE "ProductTier" AS ENUM ('TIER1', 'TIER2', 'TIER3');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tier" "ProductTier";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "products_tier_idx" ON "products"("tier");
