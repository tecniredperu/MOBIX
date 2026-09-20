-- Reparación idempotente del subsistema de Compras para instalaciones históricas.
-- Esta migración no altera instalaciones sanas; solo crea/reconecta estructuras faltantes.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseStatus') THEN
    CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "documentType" TEXT,
  "documentNumber" TEXT,
  "businessName" TEXT NOT NULL,
  "contactName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "purchases" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "documentType" TEXT,
  "documentSeries" TEXT,
  "documentNumber" TEXT,
  "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currency" TEXT NOT NULL DEFAULT 'PEN',
  "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "purchase_items" (
  "id" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" DECIMAL(14,2) NOT NULL,
  "subtotal" DECIMAL(14,2) NOT NULL,
  "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- Campos opcionales/financieros que pueden faltar en bases históricas parciales.
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "documentType" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "documentNumber" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "documentType" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "documentSeries" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "documentNumber" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'PEN';
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "tax" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "total" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "tax" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "total" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Estas dos columnas son necesarias para _count.productUnits y trazabilidad IMEI/serie.
ALTER TABLE "product_units" ADD COLUMN IF NOT EXISTS "purchaseId" TEXT;
ALTER TABLE "product_units" ADD COLUMN IF NOT EXISTS "purchaseItemId" TEXT;

CREATE INDEX IF NOT EXISTS "suppliers_companyId_status_idx" ON "suppliers"("companyId", "status");
CREATE INDEX IF NOT EXISTS "purchases_companyId_supplierId_issueDate_idx" ON "purchases"("companyId", "supplierId", "issueDate");
CREATE INDEX IF NOT EXISTS "purchases_companyId_warehouseId_status_idx" ON "purchases"("companyId", "warehouseId", "status");
CREATE INDEX IF NOT EXISTS "purchase_items_purchaseId_productId_variantId_idx" ON "purchase_items"("purchaseId", "productId", "variantId");
CREATE INDEX IF NOT EXISTS "product_units_purchaseId_idx" ON "product_units"("purchaseId");
CREATE INDEX IF NOT EXISTS "product_units_purchaseItemId_idx" ON "product_units"("purchaseItemId");

-- Índices únicos solo cuando los datos históricos no contienen duplicados.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'suppliers_companyId_documentNumber_key'
  ) AND NOT EXISTS (
    SELECT 1
    FROM "suppliers"
    WHERE "documentNumber" IS NOT NULL
    GROUP BY "companyId", "documentNumber"
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX "suppliers_companyId_documentNumber_key"
      ON "suppliers"("companyId", "documentNumber");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'purchases_companyId_number_key'
  ) AND NOT EXISTS (
    SELECT 1
    FROM "purchases"
    GROUP BY "companyId", "number"
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX "purchases_companyId_number_key"
      ON "purchases"("companyId", "number");
  END IF;
END $$;

-- FKs NOT VALID permiten endurecer nuevas escrituras incluso si existen datos históricos huérfanos.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_companyId_fkey') THEN
    ALTER TABLE "suppliers"
      ADD CONSTRAINT "suppliers_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_companyId_fkey') THEN
    ALTER TABLE "purchases"
      ADD CONSTRAINT "purchases_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_supplierId_fkey') THEN
    ALTER TABLE "purchases"
      ADD CONSTRAINT "purchases_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_warehouseId_fkey') THEN
    ALTER TABLE "purchases"
      ADD CONSTRAINT "purchases_warehouseId_fkey"
      FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_createdById_fkey') THEN
    ALTER TABLE "purchases"
      ADD CONSTRAINT "purchases_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_items_purchaseId_fkey') THEN
    ALTER TABLE "purchase_items"
      ADD CONSTRAINT "purchase_items_purchaseId_fkey"
      FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_items_productId_fkey') THEN
    ALTER TABLE "purchase_items"
      ADD CONSTRAINT "purchase_items_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "products"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_items_variantId_fkey') THEN
    ALTER TABLE "purchase_items"
      ADD CONSTRAINT "purchase_items_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "product_variants"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_units_purchaseId_fkey') THEN
    ALTER TABLE "product_units"
      ADD CONSTRAINT "product_units_purchaseId_fkey"
      FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_units_purchaseItemId_fkey') THEN
    ALTER TABLE "product_units"
      ADD CONSTRAINT "product_units_purchaseItemId_fkey"
      FOREIGN KEY ("purchaseItemId") REFERENCES "purchase_items"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;
