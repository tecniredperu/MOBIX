import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/business-context";
import { resolvePosScan } from "@/modules/sales/pos-context.repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await requirePermission("sales.create");

  const value = request.nextUrl.searchParams.get("value")?.trim() ?? "";
  const warehouseId = request.nextUrl.searchParams.get("warehouseId")?.trim() ?? "";

  if (!value || !warehouseId) {
    return NextResponse.json(
      { error: "value y warehouseId son obligatorios." },
      { status: 400 },
    );
  }

  const match = await resolvePosScan(value, warehouseId);
  return NextResponse.json({ match });
}
