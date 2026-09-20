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
  failedMigration: boolean;
};

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
        EXISTS (
          SELECT 1
          FROM "_prisma_migrations"
          WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL
        ) AS "failedMigration"
    `;

    const schema = rows[0];
    const schemaReady = Boolean(
      schema?.saleCashSession &&
      schema.returnRefundCashSession &&
      schema.exchangeRefundCashSession &&
      schema.userSessionVersion &&
      !schema.failedMigration
    );

    if (!schemaReady) {
      logger.error("health.schema_outdated", new Error("El esquema de producción no coincide con la versión de MOBIX."));
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

    return Response.json(
      {
        status: "ok",
        service: "MOBIX",
        database: "ok",
        schema: "ok",
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
