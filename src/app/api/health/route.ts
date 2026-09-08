import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  const started = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const databaseLatencyMs = Math.round((performance.now() - started) * 10) / 10;
    return Response.json(
      {
        status: "ok",
        service: "MOBIX",
        database: "ok",
        databaseLatencyMs,
        uptimeSeconds: Math.round(process.uptime()),
        environment: process.env.NODE_ENV ?? "unknown",
        commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null,
        timestamp: new Date().toISOString(),
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    logger.error("health.database_failed", error);
    return Response.json(
      {
        status: "degraded",
        service: "MOBIX",
        database: "error",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
