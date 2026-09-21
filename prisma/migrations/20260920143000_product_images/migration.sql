CREATE TABLE IF NOT EXISTS "product_images" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "dataBase64" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_images_productId_key" ON "product_images"("productId");
CREATE INDEX IF NOT EXISTS "product_images_companyId_productId_idx" ON "product_images"("companyId", "productId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_images_companyId_fkey') THEN
    ALTER TABLE "product_images"
      ADD CONSTRAINT "product_images_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_images_productId_fkey') THEN
    ALTER TABLE "product_images"
      ADD CONSTRAINT "product_images_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "products"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
