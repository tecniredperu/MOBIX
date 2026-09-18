ALTER TABLE "sale_item_units"
  ADD COLUMN "warrantyDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "warrantyStartsAt" TIMESTAMP(3),
  ADD COLUMN "warrantyExpiresAt" TIMESTAMP(3);

-- Congela también la garantía de ventas históricas usando la configuración
-- vigente al momento de esta migración como mejor referencia disponible.
UPDATE "sale_item_units" siu
SET
  "warrantyDays" = GREATEST(p."warrantyDays", COALESCE(cs."defaultWarrantyDays", 0), 0),
  "warrantyStartsAt" = CASE
    WHEN GREATEST(p."warrantyDays", COALESCE(cs."defaultWarrantyDays", 0), 0) > 0
      THEN s."createdAt"
    ELSE NULL
  END,
  "warrantyExpiresAt" = CASE
    WHEN GREATEST(p."warrantyDays", COALESCE(cs."defaultWarrantyDays", 0), 0) > 0
      THEN s."createdAt" + (
        GREATEST(p."warrantyDays", COALESCE(cs."defaultWarrantyDays", 0), 0)
        * INTERVAL '1 day'
      )
    ELSE NULL
  END
FROM "sale_items" si
JOIN "sales" s ON s."id" = si."saleId"
JOIN "products" p ON p."id" = si."productId"
LEFT JOIN "company_settings" cs ON cs."companyId" = s."companyId"
WHERE siu."saleItemId" = si."id";

CREATE INDEX "sale_item_units_productUnitId_warrantyExpiresAt_idx"
  ON "sale_item_units"("productUnitId", "warrantyExpiresAt");
