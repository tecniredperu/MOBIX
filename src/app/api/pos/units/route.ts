import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/business-context";
import { getPosUnits } from "@/modules/sales/sales.repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePermission("sales.create");
    const { searchParams } = new URL(request.url);
    const variantId = searchParams.get("variantId")?.trim() ?? "";
    const warehouseId = searchParams.get("warehouseId")?.trim() ?? "";

    if (!variantId || !warehouseId) {
      return NextResponse.json({ error: "Faltan variante y almacén." }, { status: 400 });
    }

    const units = await getPosUnits({ variantId, warehouseId });
    return NextResponse.json({ units });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "No se pudieron consultar los equipos disponibles.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
