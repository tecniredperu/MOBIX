import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/business-context";
import { searchPosCatalog } from "@/modules/sales/pos-context.repository";

export async function GET(request: NextRequest) {
  await requirePermission("sales.create");
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const warehouseId = request.nextUrl.searchParams.get("warehouseId")?.trim() || undefined;
  const items = await searchPosCatalog(q, warehouseId);
  return NextResponse.json({ items });
}
