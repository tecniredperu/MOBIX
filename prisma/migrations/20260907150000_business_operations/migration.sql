-- MOBIX · Devoluciones, cambios, transferencias y configuración empresarial

CREATE TABLE "return_orders" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "customerId" TEXT,
  "warehouseId" TEXT NOT NULL,
  "returnNumber" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'RETURN',
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "reason" TEXT NOT NULL,
  "refundMethod" TEXT,
  "refundAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "return_orders_type_check" CHECK ("type" IN ('RETURN','EXCHANGE')),
  CONSTRAINT "return_orders_status_check" CHECK ("status" IN ('COMPLETED','CANCELLED')),
  CONSTRAINT "return_orders_refund_method_check" CHECK ("refundMethod" IS NULL OR "refundMethod" IN ('CASH','YAPE','PLIN','CARD','TRANSFER','CREDIT','OTHER')),
  CONSTRAINT "return_orders_company_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "return_orders_sale_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "return_orders_customer_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "return_orders_warehouse_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "return_orders_created_by_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "return_orders_company_number_key" ON "return_orders"("companyId","returnNumber");
CREATE INDEX "return_orders_company_date_idx" ON "return_orders"("companyId","createdAt");
CREATE INDEX "return_orders_sale_idx" ON "return_orders"("saleId");

CREATE TABLE "return_items" (
  "id" TEXT NOT NULL,
  "returnOrderId" TEXT NOT NULL,
  "saleItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "productUnitId" TEXT,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(14,2) NOT NULL,
  "unitCost" DECIMAL(14,2) NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "return_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "return_items_order_fkey" FOREIGN KEY ("returnOrderId") REFERENCES "return_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "return_items_sale_item_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "return_items_product_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "return_items_variant_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "return_items_unit_fkey" FOREIGN KEY ("productUnitId") REFERENCES "product_units"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "return_items_order_idx" ON "return_items"("returnOrderId");
CREATE INDEX "return_items_sale_item_idx" ON "return_items"("saleItemId");

CREATE TABLE "stock_transfers" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "transferNumber" TEXT NOT NULL,
  "fromWarehouseId" TEXT NOT NULL,
  "toWarehouseId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IN_TRANSIT',
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "receivedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_transfers_status_check" CHECK ("status" IN ('DRAFT','IN_TRANSIT','RECEIVED','CANCELLED')),
  CONSTRAINT "stock_transfers_different_warehouses" CHECK ("fromWarehouseId" <> "toWarehouseId"),
  CONSTRAINT "stock_transfers_company_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_transfers_from_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_transfers_to_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_transfers_created_by_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_transfers_received_by_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "stock_transfers_company_number_key" ON "stock_transfers"("companyId","transferNumber");
CREATE INDEX "stock_transfers_company_status_idx" ON "stock_transfers"("companyId","status","createdAt");
CREATE INDEX "stock_transfers_from_idx" ON "stock_transfers"("fromWarehouseId","createdAt");
CREATE INDEX "stock_transfers_to_idx" ON "stock_transfers"("toWarehouseId","createdAt");

CREATE TABLE "stock_transfer_items" (
  "id" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "productUnitId" TEXT,
  "quantity" INTEGER NOT NULL,
  "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_transfer_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "stock_transfer_items_transfer_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stock_transfer_items_product_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_transfer_items_variant_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_transfer_items_unit_fkey" FOREIGN KEY ("productUnitId") REFERENCES "product_units"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "stock_transfer_items_transfer_idx" ON "stock_transfer_items"("transferId");
CREATE INDEX "stock_transfer_items_unit_idx" ON "stock_transfer_items"("productUnitId");

CREATE TABLE "company_settings" (
  "companyId" TEXT NOT NULL,
  "taxRate" DECIMAL(6,3) NOT NULL DEFAULT 18.000,
  "defaultTaxCondition" TEXT NOT NULL DEFAULT 'TAXED',
  "receiptSeries" TEXT NOT NULL DEFAULT 'B001',
  "invoiceSeries" TEXT NOT NULL DEFAULT 'F001',
  "salesNoteSeries" TEXT NOT NULL DEFAULT 'NV01',
  "ticketFooter" TEXT,
  "defaultWarrantyDays" INTEGER NOT NULL DEFAULT 0,
  "requireCashSession" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_settings_pkey" PRIMARY KEY ("companyId"),
  CONSTRAINT "company_settings_tax_check" CHECK ("taxRate" >= 0 AND "taxRate" <= 100),
  CONSTRAINT "company_settings_tax_condition_check" CHECK ("defaultTaxCondition" IN ('TAXED','EXEMPT','UNAFFECTED')),
  CONSTRAINT "company_settings_company_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "company_settings" ("companyId") SELECT "id" FROM "companies" ON CONFLICT ("companyId") DO NOTHING;

INSERT INTO "permissions" ("id","code","name","description") VALUES
  ('perm_dashboard_view','dashboard.view','Ver dashboard','Acceso al panel principal'),
  ('perm_sales_view','sales.view','Ver ventas','Consultar ventas y comprobantes'),
  ('perm_sales_create','sales.create','Registrar ventas','Registrar operaciones desde POS'),
  ('perm_sales_cancel','sales.cancel','Anular ventas','Cancelar o revertir ventas'),
  ('perm_purchases_view','purchases.view','Ver compras','Consultar compras'),
  ('perm_purchases_create','purchases.create','Registrar compras','Ingresar compras y mercadería'),
  ('perm_inventory_view','inventory.view','Ver inventario','Consultar productos, equipos y kardex'),
  ('perm_inventory_transfer','inventory.transfer','Transferir stock','Transferencias entre almacenes'),
  ('perm_returns_manage','returns.manage','Gestionar devoluciones','Registrar devoluciones y cambios'),
  ('perm_cash_manage','cash.manage','Gestionar caja','Apertura, movimientos y cierre'),
  ('perm_customers_manage','customers.manage','Gestionar clientes','Clientes, crédito y cobranzas'),
  ('perm_service_manage','service.manage','Gestionar postventa','Garantías y servicio técnico'),
  ('perm_reports_view','reports.view','Ver reportes','Acceso a reportes y rentabilidad'),
  ('perm_costs_view','costs.view','Ver costos y utilidad','Permite visualizar costos, margen y rentabilidad'),
  ('perm_users_manage','users.manage','Gestionar usuarios','Alta y edición de usuarios'),
  ('perm_roles_manage','roles.manage','Gestionar roles','Roles y permisos'),
  ('perm_settings_manage','settings.manage','Gestionar configuración','Empresa, sucursales, almacenes y parámetros')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."isSystem" = true
ON CONFLICT ("roleId","permissionId") DO NOTHING;
