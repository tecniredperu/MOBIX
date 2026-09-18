-- MOBIX POS V5: índices de búsqueda rápida.
-- pg_trgm acelera ILIKE/contains sin cambiar la semántica actual del buscador.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "products_pos_name_trgm_idx"
  ON "products" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "products_pos_model_trgm_idx"
  ON "products" USING GIN ("model" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "products_pos_sku_trgm_idx"
  ON "products" USING GIN ("sku" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "products_pos_barcode_trgm_idx"
  ON "products" USING GIN ("barcode" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "brands_pos_name_trgm_idx"
  ON "brands" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "categories_pos_name_trgm_idx"
  ON "categories" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "product_variants_pos_sku_trgm_idx"
  ON "product_variants" USING GIN ("sku" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "product_variants_pos_barcode_trgm_idx"
  ON "product_variants" USING GIN ("barcode" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "product_variants_pos_color_trgm_idx"
  ON "product_variants" USING GIN ("color" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "customers_pos_document_trgm_idx"
  ON "customers" USING GIN ("documentNumber" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "customers_pos_business_name_trgm_idx"
  ON "customers" USING GIN ("businessName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "customers_pos_first_name_trgm_idx"
  ON "customers" USING GIN ("firstName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "customers_pos_last_name_trgm_idx"
  ON "customers" USING GIN ("lastName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "customers_pos_phone_trgm_idx"
  ON "customers" USING GIN ("phone" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "customers_pos_whatsapp_trgm_idx"
  ON "customers" USING GIN ("whatsapp" gin_trgm_ops);
