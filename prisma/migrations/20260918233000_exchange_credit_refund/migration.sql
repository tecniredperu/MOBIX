ALTER TABLE "exchange_credits"
  ADD COLUMN "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "refundMethod" "PaymentMethod",
  ADD COLUMN "refundReference" TEXT,
  ADD COLUMN "refundedAt" TIMESTAMP(3),
  ADD COLUMN "refundedById" TEXT;
