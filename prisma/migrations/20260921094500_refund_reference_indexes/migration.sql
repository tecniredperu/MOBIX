-- MOBIX · Índices para conciliación de referencias de devoluciones digitales.
-- Evitan búsquedas completas al validar Yape, Plin, tarjeta y transferencia.

CREATE INDEX IF NOT EXISTS "return_orders_refund_reference_normalized_idx"
ON "return_orders" (
  "companyId",
  "refundMethod",
  (regexp_replace(upper(COALESCE("refundReference", '')), '[^A-Z0-9]', '', 'g'))
)
WHERE "refundReference" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "exchange_credits_refund_reference_normalized_idx"
ON "exchange_credits" (
  "companyId",
  "refundMethod",
  (regexp_replace(upper(COALESCE("refundReference", '')), '[^A-Z0-9]', '', 'g'))
)
WHERE "refundReference" IS NOT NULL;
