-- CountryClearance (HubPort forum #22, D6): per-product, per-ISO-country clearance
-- row for markets RegulatoryClearance's five jurisdictions don't cover. App code
-- (src/lib/countryClearanceWrite.js) rejects any country already covered by
-- RegulatoryClearance, so the two tables never describe the same regulatory fact.
-- Prisma 7 + adapter-pg migrations are NOT transactional
-- (feedback_prisma7_non_transactional_migrations), so every statement is
-- individually idempotent, mirroring 20260701230000_product_images.
CREATE TABLE IF NOT EXISTS "country_clearances" (
    "id"          TEXT NOT NULL,
    "productId"   TEXT NOT NULL,
    "country"     TEXT NOT NULL,
    "status"      "ClearanceStatus" NOT NULL DEFAULT 'NONE',
    "materialRef" TEXT,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "country_clearances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "country_clearances_productId_country_key" ON "country_clearances"("productId", "country");
CREATE INDEX IF NOT EXISTS "country_clearances_country_status_idx" ON "country_clearances"("country", "status");

DO $$ BEGIN
  ALTER TABLE "country_clearances"
    ADD CONSTRAINT "country_clearances_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
