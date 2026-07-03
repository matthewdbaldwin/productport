-- Product image gallery (many-per-product, one primary). Idempotent DDL —
-- Prisma 7 + adapter-pg migrations are NOT transactional, so every statement is
-- individually safe to re-run (CREATE TABLE/INDEX IF NOT EXISTS; the FK is added
-- inside a guarded DO block so a partial re-apply doesn't error on a dup constraint).
CREATE TABLE IF NOT EXISTS "product_images" (
    "id"        TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key"       TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "product_images_productId_idx" ON "product_images"("productId");

DO $$ BEGIN
  ALTER TABLE "product_images"
    ADD CONSTRAINT "product_images_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
