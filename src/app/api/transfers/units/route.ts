import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/business-context";
import { getTransferUnits } from "@/modules/transfers/transfers.repository";

export async function GET(request: NextRequest) {
  await requirePermission("inventory.transfer");

  const variantId = request.nextUrl.searchParams.get("variantId")?.trim() ?? "";
  const warehouseId = request.nextUrl.searchParams.get("warehouseId")?.trim() ?? "";

  if (!variantId || !warehouseId) {
    return NextResponse.json(
      { error: "variantId y warehouseId son obligatorios." },
      { status: 400 },
    );
  }

  const items = await getTransferUnits(variantId, warehouseId);
  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
