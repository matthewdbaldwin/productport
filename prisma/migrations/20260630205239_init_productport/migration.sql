-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('viewer', 'product', 'product_admin', 'superuser');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'DISCONTINUED', 'DRAFT');

-- CreateEnum
CREATE TYPE "ClearanceStatus" AS ENUM ('APPROVED', 'IN_PROGRESS', 'SUBMITTED', 'NOT_APPROVED', 'NONE');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'viewer',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "locale" TEXT DEFAULT 'en-US',
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subsidiary" TEXT NOT NULL,
    "therapeuticArea" TEXT NOT NULL,
    "category" TEXT,
    "type" TEXT,
    "tagline" TEXT,
    "overview" TEXT,
    "features" TEXT,
    "indication" TEXT,
    "patientPopulation" TEXT,
    "specs" TEXT,
    "regNotes" TEXT,
    "image" TEXT,
    "mdmCode" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_clearances" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "status" "ClearanceStatus" NOT NULL DEFAULT 'NONE',
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regulatory_clearances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trials" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "trial" TEXT NOT NULL,
    "identifier" TEXT,
    "n" TEXT,
    "design" TEXT,
    "result" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "trials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_audits" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "userId" INTEGER,
    "userEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_outbox" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correlationId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_mdmCode_key" ON "products"("mdmCode");

-- CreateIndex
CREATE INDEX "products_therapeuticArea_idx" ON "products"("therapeuticArea");

-- CreateIndex
CREATE INDEX "products_subsidiary_idx" ON "products"("subsidiary");

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "regulatory_clearances_region_status_idx" ON "regulatory_clearances"("region", "status");

-- CreateIndex
CREATE UNIQUE INDEX "regulatory_clearances_productId_region_key" ON "regulatory_clearances"("productId", "region");

-- CreateIndex
CREATE INDEX "trials_productId_idx" ON "trials"("productId");

-- CreateIndex
CREATE INDEX "product_audits_productId_idx" ON "product_audits"("productId");

-- CreateIndex
CREATE INDEX "product_audits_createdAt_idx" ON "product_audits"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_jti_key" ON "sessions"("jti");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "webhook_outbox_deliveredAt_idx" ON "webhook_outbox"("deliveredAt");

-- AddForeignKey
ALTER TABLE "regulatory_clearances" ADD CONSTRAINT "regulatory_clearances_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trials" ADD CONSTRAINT "trials_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_audits" ADD CONSTRAINT "product_audits_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_audits" ADD CONSTRAINT "product_audits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

