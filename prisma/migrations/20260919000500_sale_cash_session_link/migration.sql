ALTER TABLE "sales"
  ADD COLUMN "cashSessionId" TEXT;

CREATE INDEX "sales_cashSessionId_createdAt_idx"
  ON "sales"("cashSessionId", "createdAt");

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Vincula ventas históricas a la sesión de caja que estaba abierta en ese momento.
UPDATE "sales" s
SET "cashSessionId" = (
  SELECT cs."id"
  FROM "cash_sessions" cs
  WHERE cs."companyId" = s."companyId"
    AND cs."branchId" = s."branchId"
    AND cs."userId" = s."sellerId"
    AND cs."openedAt" <= s."createdAt"
    AND (cs."closedAt" IS NULL OR cs."closedAt" >= s."createdAt")
  ORDER BY cs."openedAt" DESC
  LIMIT 1
)
WHERE s."cashSessionId" IS NULL
  AND s."status" IN ('COMPLETED','REFUNDED');
