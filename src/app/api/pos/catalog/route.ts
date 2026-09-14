import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/business-context";
import { searchPosCatalog } from "@/modules/sales/sales.repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePermission("sales.create");
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const items = await searchPosCatalog(q, 80);
    return NextResponse.json({ items });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "No se pudo consultar el catálogo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
