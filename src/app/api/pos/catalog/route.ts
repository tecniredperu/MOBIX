import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/business-context";
import { searchPosCatalog } from "@/modules/sales/sales.repository";

export async function GET(request: NextRequest) {
  await requirePermission("sales.create");
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const items = await searchPosCatalog(q);
  return NextResponse.json({ items });
}
