import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", service: "MOBIX" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "error", service: "MOBIX" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
