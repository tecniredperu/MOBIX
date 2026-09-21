import { BUILD_COMMIT } from "@/lib/build-info";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

type SchemaProbe = {
  saleCashSession: boolean;
  returnRefundCashSession: boolean;
  exchangeRefundCashSession: boolean;
  userSessionVersion: boolean;
  productImagesTable: boolean;
  suppliersTable: boolean;
  purchasesTable: boolean;
  purchaseItemsTable: boolean;
  purchaseCoreColumns: boolean;
  purchaseUnitPurchaseId: boolean;
  purchaseUnitPurchaseItemId: boolean;
  inventoryBalancesTable: boolean;
  inventoryMovementsTable: boolean;
  cashSessionsTable: boolean;
  receivablesTable: boolean;
  returnOrdersTable: boolean;
  exchangeCreditsTable: boolean;
  serviceOrdersTable: boolean;
  stockTransfersTable: boolean;
  failedMigration: boolean;
};

function moduleStatus(schema: SchemaProbe | undefined) {
  return {
    catalog: Boolean(schema?.productImagesTable),
    purchases: Boolean(
      schema?.suppliersTable &&
      schema.purchasesTable &&
      schema.purchaseItemsTable &&
      schema.purchaseCoreColumns &&
      schema.purchaseUnitPurchaseId &&
      schema.purchaseUnitPurchaseItemId
    ),
    inventory: Boolean(schema?.inventoryBalancesTable && schema.inventoryMovementsTable),
    sales: Boolean(schema?.saleCashSession),
    cash: Boolean(schema?.cashSessionsTable && schema.saleCashSession),
    credit: Boolean(schema?.receivablesTable),
    returns: Boolean(schema?.returnOrdersTable && schema.returnRefundCashSession),
    exchanges: Boolean(schema?.exchangeCreditsTable && schema.exchangeRefundCashSession),
    service: Boolean(schema?.serviceOrdersTable),
    transfers: Boolean(schema?.stockTransfersTable),
    security: Boolean(schema?.userSessionVersion),
  };
}

export async function GET() {
  const started = performance.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    logger.error("health.database_failed", error);
    return Response.json(
      {
        status: "degraded",
        service: "MOBIX",
        database: "error",
        schema: "unknown",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: noStoreHeaders },
    );
  }

  const databaseLatencyMs = Math.round((performance.now() - started) * 10) / 10;

  try {
    const rows = await prisma.$queryRaw<SchemaProbe[]>`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'cashSessionId'
        ) AS "saleCashSession",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'return_orders' AND column_name = 'refundCashSessionId'
        ) AS "returnRefundCashSession",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'exchange_credits' AND column_name = 'refundCashSessionId'
        ) AS "exchangeRefundCashSession",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'sessionVersion'
        ) AS "userSessionVersion",
        to_regclass('public.product_images') IS NOT NULL AS "productImagesTable",

        to_regclass('public.suppliers') IS NOT NULL AS "suppliersTable",
        to_regclass('public.purchases') IS NOT NULL AS "purchasesTable",
        to_regclass('public.purchase_items') IS NOT NULL AS "purchaseItemsTable",
        (
          SELECT COUNT(*) = 7
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'purchases'
            AND column_name IN ('companyId','supplierId','warehouseId','number','issueDate','status','createdById')
        ) AS "purchaseCoreColumns",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'product_units' AND column_name = 'purchaseId'
        ) AS "purchaseUnitPurchaseId",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'product_units' AND column_name = 'purchaseItemId'
        ) AS "purchaseUnitPurchaseItemId",

        to_regclass('public.inventory_balances') IS NOT NULL AS "inventoryBalancesTable",
        to_regclass('public.inventory_movements') IS NOT NULL AS "inventoryMovementsTable",
        to_regclass('public.cash_sessions') IS NOT NULL AS "cashSessionsTable",
        to_regclass('public.accounts_receivable') IS NOT NULL AS "receivablesTable",
        to_regclass('public.return_orders') IS NOT NULL AS "returnOrdersTable",
        to_regclass('public.exchange_credits') IS NOT NULL AS "exchangeCreditsTable",
        to_regclass('public.service_orders') IS NOT NULL AS "serviceOrdersTable",
        to_regclass('public.stock_transfers') IS NOT NULL AS "stockTransfersTable",

        EXISTS (
          SELECT 1
          FROM "_prisma_migrations"
          WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL
        ) AS "failedMigration"
    `;

    const schema = rows[0];
    const modules = moduleStatus(schema);
    const modulesReady = Object.values(modules).every(Boolean);
    const schemaReady = Boolean(schema && modulesReady && !schema.failedMigration);

    if (!schemaReady) {
      logger.error("health.schema_outdated", new Error("El esquema de producción no coincide con la versión de MOBIX."));
      return Response.json(
        {
          status: "degraded",
          service: "MOBIX",
          database: "ok",
          schema: "error",
          modules,
          migration: schema?.failedMigration ? "failed" : "ok",
          databaseLatencyMs,
          timestamp: new Date().toISOString(),
        },
        { status: 503, headers: noStoreHeaders },
      );
    }

    return Response.json(
      {
        status: "ok",
        service: "MOBIX",
        database: "ok",
        schema: "ok",
        modules,
        migration: "ok",
        databaseLatencyMs,
        uptimeSeconds: Math.round(process.uptime()),
        environment: process.env.NODE_ENV ?? "unknown",
        commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? BUILD_COMMIT,
        timestamp: new Date().toISOString(),
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    logger.error("health.schema_check_failed", error);
    return Response.json(
      {
        status: "degraded",
        service: "MOBIX",
        database: "ok",
        schema: "error",
        databaseLatencyMs,
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
