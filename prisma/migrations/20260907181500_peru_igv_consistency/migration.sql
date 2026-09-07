-- MOBIX Perú · coherencia tributaria
-- La edición Perú trabaja con la tasa general vigente de IGV 18%.
-- Las operaciones no gravadas se representan mediante TAXED / EXEMPT / UNAFFECTED.

UPDATE "company_settings"
SET "taxRate" = 18.000,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "taxRate" <> 18.000;

ALTER TABLE "company_settings"
  DROP CONSTRAINT IF EXISTS "company_settings_peru_igv_rate";

ALTER TABLE "company_settings"
  ADD CONSTRAINT "company_settings_peru_igv_rate"
  CHECK ("taxRate" = 18.000);
