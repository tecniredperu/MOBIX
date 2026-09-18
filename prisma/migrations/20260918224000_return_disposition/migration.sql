CREATE TYPE "ReturnDisposition" AS ENUM ('RESTOCK', 'QUARANTINE', 'DAMAGED');

ALTER TABLE "return_items"
  ADD COLUMN "disposition" "ReturnDisposition" NOT NULL DEFAULT 'RESTOCK';
