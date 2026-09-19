ALTER TABLE "return_orders"
  ADD COLUMN "refundCashSessionId" TEXT;

ALTER TABLE "exchange_credits"
  ADD COLUMN "refundCashSessionId" TEXT;

CREATE INDEX "return_orders_refund_cash_session_idx"
  ON "return_orders"("refundCashSessionId");

CREATE INDEX "exchange_credits_refundCashSessionId_idx"
  ON "exchange_credits"("refundCashSessionId");

ALTER TABLE "return_orders"
  ADD CONSTRAINT "return_orders_refundCashSessionId_fkey"
  FOREIGN KEY ("refundCashSessionId") REFERENCES "cash_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "exchange_credits"
  ADD CONSTRAINT "exchange_credits_refundCashSessionId_fkey"
  FOREIGN KEY ("refundCashSessionId") REFERENCES "cash_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Vincula devoluciones en efectivo históricas a la caja donde se registró el egreso.
UPDATE "return_orders" ro
SET "refundCashSessionId" = cm."cashSessionId"
FROM "cash_movements" cm
WHERE cm."reference" = ro."id"
  AND ro."refundMethod" = 'CASH'
  AND ro."refundCashSessionId" IS NULL
  AND cm."type" = 'EXPENSE';

-- Vincula devoluciones de saldo de vales en efectivo a su caja histórica.
UPDATE "exchange_credits" ec
SET "refundCashSessionId" = cm."cashSessionId"
FROM "cash_movements" cm
WHERE cm."reference" = ec."id"
  AND ec."refundMethod" = 'CASH'
  AND ec."refundCashSessionId" IS NULL
  AND cm."type" = 'EXPENSE';
