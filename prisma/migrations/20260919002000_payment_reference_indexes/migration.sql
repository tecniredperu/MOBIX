-- MOBIX · Índices de conciliación para referencias digitales normalizadas.
-- Aceleran la detección de operaciones Yape/Plin/Transferencia repetidas sin
-- modificar los valores originales que se imprimen en comprobantes.

CREATE INDEX IF NOT EXISTS "sale_payments_reference_normalized_idx"
ON "sale_payments" (
  "paymentMethod",
  (regexp_replace(upper(COALESCE("reference", '')), '[^A-Z0-9]', '', 'g'))
)
WHERE "reference" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "receivable_payments_reference_normalized_idx"
ON "receivable_payments" (
  "companyId",
  "paymentMethod",
  (regexp_replace(upper(COALESCE("reference", '')), '[^A-Z0-9]', '', 'g'))
)
WHERE "reference" IS NOT NULL;
