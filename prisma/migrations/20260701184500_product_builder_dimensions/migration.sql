-- ProductPort admin builder Slice 1.5 — brochure-derived dimensions.
-- Additive + idempotent (Prisma 7 migrations are NOT transactional w/ adapter-pg).

-- CreateEnum (guarded)
DO $$ BEGIN
  CREATE TYPE "ProductClassification" AS ENUM ('CORE', 'HIPO', 'FLAGSHIP');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterTable — new product columns
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "classification" "ProductClassification";
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "businessSegment" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "applicableDepartments" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "modelNumbers" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "developmentStatus" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "products_classification_idx" ON "products"("classification");
CREATE INDEX IF NOT EXISTS "products_businessSegment_idx" ON "products"("businessSegment");
