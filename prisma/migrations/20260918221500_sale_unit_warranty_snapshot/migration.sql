ALTER TABLE "sale_item_units"
  ADD COLUMN "warrantyDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "warrantyStartsAt" TIMESTAMP(3),
  ADD COLUMN "warrantyExpiresAt" TIMESTAMP(3);

CREATE INDEX "sale_item_units_productUnitId_warrantyExpiresAt_idx"
  ON "sale_item_units"("productUnitId", "warrantyExpiresAt");
