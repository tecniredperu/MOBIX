import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/business-context";
import { searchServiceSoldUnits } from "@/modules/service/service.repository";

export async function GET(request: NextRequest) {
  await requirePermission("service.manage");
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  return NextResponse.json({ items: await searchServiceSoldUnits(q) });
}
