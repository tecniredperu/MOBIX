-- MOBIX Core - operaciones avanzadas y administración

CREATE TYPE "ReturnType" AS ENUM ('RETURN', 'EXCHANGE');
CREATE TYPE "ReturnStatus" AS ENUM ('COMPLETED', 'CANCELLED');
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "igvRate" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
  ADD COLUMN IF NOT EXISTS "defaultTaxCondition" TEXT NOT NULL DEFAULT 'TAXED',
  ADD COLUMN IF NOT EXISTS "receiptSeries" TEXT NOT NULL DEFAULT 'B001',
  ADD COLUMN IF NOT EXISTS "invoiceSeries" TEXT NOT NULL DEFAULT 'F001',
  ADD COLUMN IF NOT EXISTS "salesNoteSeries" TEXT NOT NULL DEFAULT 'V001',
  ADD COLUMN IF NOT EXISTS "ticketWidth" INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS "receiptFooter" TEXT,
  ADD COLUMN IF NOT EXISTS "printLogo" BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE "sale_returns" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
  "saleId" TEXT NOT NULL REFERENCES "sales"("id") ON DELETE RESTRICT,
  "returnNumber" TEXT NOT NULL,
  "type" "ReturnType" NOT NULL DEFAULT 'RETURN',
  "status" "ReturnStatus" NOT NULL DEFAULT 'COMPLETED',
  "reason" TEXT NOT NULL,
  "refundMethod" "PaymentMethod",
  "refundAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "reference" TEXT,
  "notes" TEXT,
  "createdById" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "sale_returns_company_number_key" ON "sale_returns"("companyId", "returnNumber");
CREATE INDEX "sale_returns_company_sale_created_idx" ON "sale_returns"("companyId", "saleId", "createdAt");

CREATE TABLE "sale_return_items" (
  "id" TEXT PRIMARY KEY,
  "returnId" TEXT NOT NULL REFERENCES "sale_returns"("id") ON DELETE CASCADE,
  "saleItemId" TEXT NOT NULL REFERENCES "sale_items"("id") ON DELETE RESTRICT,
  "productUnitId" TEXT REFERENCES "product_units"("id") ON DELETE RESTRICT,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(14,2) NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "restock" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "sale_return_items_return_idx" ON "sale_return_items"("returnId");
CREATE INDEX "sale_return_items_sale_item_idx" ON "sale_return_items"("saleItemId");

CREATE TABLE "stock_transfers" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
  "transferNumber" TEXT NOT NULL,
  "originWarehouseId" TEXT NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT,
  "destinationWarehouseId" TEXT NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT,
  "status" "TransferStatus" NOT NULL DEFAULT 'IN_TRANSIT',
  "notes" TEXT,
  "createdById" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "receivedById" TEXT REFERENCES "users"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receivedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "stock_transfers_company_number_key" ON "stock_transfers"("companyId", "transferNumber");
CREATE INDEX "stock_transfers_company_status_created_idx" ON "stock_transfers"("companyId", "status", "createdAt");

CREATE TABLE "stock_transfer_items" (
  "id" TEXT PRIMARY KEY,
  "transferId" TEXT NOT NULL REFERENCES "stock_transfers"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "variantId" TEXT NOT NULL REFERENCES "product_variants"("id") ON DELETE RESTRICT,
  "productUnitId" TEXT REFERENCES "product_units"("id") ON DELETE RESTRICT,
  "quantity" DECIMAL(14,3) NOT NULL,
  "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "stock_transfer_items_transfer_idx" ON "stock_transfer_items"("transferId");
CREATE INDEX "stock_transfer_items_variant_idx" ON "stock_transfer_items"("variantId");

INSERT INTO "permissions" ("id", "code", "name", "description") VALUES
  ('perm_dashboard_view', 'dashboard.view', 'Ver dashboard', 'Acceso al panel principal'),
  ('perm_sales_create', 'sales.create', 'Registrar ventas', 'Crear ventas desde el POS'),
  ('perm_sales_view', 'sales.view', 'Ver ventas', 'Consultar ventas y comprobantes'),
  ('perm_sales_returns', 'sales.returns', 'Devoluciones y cambios', 'Registrar devoluciones y cambios'),
  ('perm_inventory_view', 'inventory.view', 'Ver inventario', 'Consultar productos, equipos y Kardex'),
  ('perm_inventory_transfer', 'inventory.transfer', 'Transferir stock', 'Crear y recibir transferencias entre almacenes'),
  ('perm_purchases_manage', 'purchases.manage', 'Gestionar compras', 'Registrar y consultar compras'),
  ('perm_cash_manage', 'cash.manage', 'Gestionar caja', 'Abrir, operar y cerrar caja'),
  ('perm_customers_manage', 'customers.manage', 'Gestionar clientes', 'Clientes, crédito y cobranzas'),
  ('perm_service_manage', 'service.manage', 'Gestionar postventa', 'Garantías y servicio técnico'),
  ('perm_reports_view', 'reports.view', 'Ver reportes', 'Acceso a reportes gerenciales y rentabilidad'),
  ('perm_costs_view', 'costs.view', 'Ver costos y utilidad', 'Permite visualizar costos, márgenes y rentabilidad'),
  ('perm_users_manage', 'users.manage', 'Gestionar usuarios', 'Usuarios, roles y permisos'),
  ('perm_settings_manage', 'settings.manage', 'Configurar empresa', 'Empresa, sucursales, almacenes y parámetros')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description";
