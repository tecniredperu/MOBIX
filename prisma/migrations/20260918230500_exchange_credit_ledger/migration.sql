ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'EXCHANGE_CREDIT';

CREATE TYPE "ExchangeCreditStatus" AS ENUM ('OPEN', 'PARTIAL', 'USED', 'CANCELLED');

CREATE TABLE "exchange_credits" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "returnOrderId" TEXT NOT NULL,
  "customerId" TEXT,
  "originalAmount" DECIMAL(14,2) NOT NULL,
  "balance" DECIMAL(14,2) NOT NULL,
  "status" "ExchangeCreditStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "exchange_credits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exchange_credit_usages" (
  "id" TEXT NOT NULL,
  "exchangeCreditId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "exchange_credit_usages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exchange_credits_returnOrderId_key"
  ON "exchange_credits"("returnOrderId");

CREATE INDEX "exchange_credits_companyId_status_createdAt_idx"
  ON "exchange_credits"("companyId", "status", "createdAt");

CREATE INDEX "exchange_credits_customerId_status_idx"
  ON "exchange_credits"("customerId", "status");

CREATE UNIQUE INDEX "exchange_credit_usages_exchangeCreditId_saleId_key"
  ON "exchange_credit_usages"("exchangeCreditId", "saleId");

CREATE INDEX "exchange_credit_usages_saleId_idx"
  ON "exchange_credit_usages"("saleId");

ALTER TABLE "exchange_credits"
  ADD CONSTRAINT "exchange_credits_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exchange_credits"
  ADD CONSTRAINT "exchange_credits_returnOrderId_fkey"
  FOREIGN KEY ("returnOrderId") REFERENCES "return_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exchange_credits"
  ADD CONSTRAINT "exchange_credits_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "exchange_credit_usages"
  ADD CONSTRAINT "exchange_credit_usages_exchangeCreditId_fkey"
  FOREIGN KEY ("exchangeCreditId") REFERENCES "exchange_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exchange_credit_usages"
  ADD CONSTRAINT "exchange_credit_usages_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
