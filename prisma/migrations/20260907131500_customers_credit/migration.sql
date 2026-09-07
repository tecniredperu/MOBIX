-- Crédito y cuentas por cobrar para MOBIX

CREATE TYPE "AccountReceivableStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');

ALTER TABLE "customers"
  ADD COLUMN "creditEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "creditLimit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "creditDays" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "creditNotes" TEXT;

CREATE TABLE "accounts_receivable" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "status" "AccountReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "originalAmount" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_receivable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "receivable_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "cashSessionId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receivable_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounts_receivable_saleId_key" ON "accounts_receivable"("saleId");
CREATE INDEX "accounts_receivable_companyId_customerId_status_dueDate_idx" ON "accounts_receivable"("companyId", "customerId", "status", "dueDate");
CREATE INDEX "accounts_receivable_companyId_status_dueDate_idx" ON "accounts_receivable"("companyId", "status", "dueDate");
CREATE INDEX "receivable_payments_companyId_receivableId_paidAt_idx" ON "receivable_payments"("companyId", "receivableId", "paidAt");
CREATE INDEX "receivable_payments_companyId_cashSessionId_paidAt_idx" ON "receivable_payments"("companyId", "cashSessionId", "paidAt");

ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "accounts_receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customers" ADD CONSTRAINT "customers_creditLimit_nonnegative" CHECK ("creditLimit" >= 0);
ALTER TABLE "customers" ADD CONSTRAINT "customers_creditDays_valid" CHECK ("creditDays" BETWEEN 0 AND 3650);
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_amounts_valid" CHECK ("originalAmount" > 0 AND "paidAmount" >= 0 AND "balance" >= 0);
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_amount_positive" CHECK ("amount" > 0);
