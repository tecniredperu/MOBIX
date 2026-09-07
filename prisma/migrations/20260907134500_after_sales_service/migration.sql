-- MOBIX · Garantías y servicio técnico
CREATE TABLE "service_orders" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "productUnitId" TEXT,
  "saleId" TEXT,
  "serviceNumber" TEXT NOT NULL,
  "serviceType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "deviceName" TEXT NOT NULL,
  "brand" TEXT,
  "model" TEXT,
  "identifier" TEXT,
  "reportedIssue" TEXT NOT NULL,
  "accessories" TEXT,
  "physicalCondition" TEXT,
  "warrantyCovered" BOOLEAN NOT NULL DEFAULT false,
  "warrantyExpiresAt" TIMESTAMP(3),
  "diagnosis" TEXT,
  "workPerformed" TEXT,
  "technicianId" TEXT,
  "estimatedCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "finalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expectedAt" TIMESTAMP(3),
  "readyAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_orders_type_check" CHECK ("serviceType" IN ('WARRANTY','TECHNICAL_SERVICE')),
  CONSTRAINT "service_orders_status_check" CHECK ("status" IN ('RECEIVED','DIAGNOSIS','WAITING_APPROVAL','IN_REPAIR','READY','DELIVERED','CANCELLED')),
  CONSTRAINT "service_orders_company_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_orders_customer_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_orders_unit_fkey" FOREIGN KEY ("productUnitId") REFERENCES "product_units"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "service_orders_sale_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "service_orders_technician_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "service_orders_created_by_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "service_orders_company_number_key" ON "service_orders"("companyId", "serviceNumber");
CREATE INDEX "service_orders_company_status_idx" ON "service_orders"("companyId", "status", "receivedAt");
CREATE INDEX "service_orders_company_customer_idx" ON "service_orders"("companyId", "customerId", "receivedAt");
CREATE INDEX "service_orders_company_unit_idx" ON "service_orders"("companyId", "productUnitId", "receivedAt");

CREATE TABLE "service_order_events" (
  "id" TEXT NOT NULL,
  "serviceOrderId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_order_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_order_events_status_check" CHECK ("status" IN ('RECEIVED','DIAGNOSIS','WAITING_APPROVAL','IN_REPAIR','READY','DELIVERED','CANCELLED')),
  CONSTRAINT "service_order_events_order_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_order_events_user_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "service_order_events_order_date_idx" ON "service_order_events"("serviceOrderId", "createdAt");
