import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { company } = await requirePermission("sales.create");
  const variantId = request.nextUrl.searchParams.get("variantId")?.trim();
  const warehouseId = request.nextUrl.searchParams.get("warehouseId")?.trim();

  if (!variantId || !warehouseId) {
    return NextResponse.json({ error: "variantId y warehouseId son obligatorios." }, { status: 400 });
  }

  const units = await prisma.productUnit.findMany({
    where: {
      companyId: company.id,
      variantId,
      warehouseId,
      status: "AVAILABLE",
      variant: { status: "ACTIVE", product: { status: "ACTIVE", deletedAt: null } },
    },
    select: {
      id: true,
      warehouseId: true,
      identifiers: { select: { type: true, value: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    units: units.map((unit) => {
      const identifiers = new Map(unit.identifiers.map((identifier) => [identifier.type, identifier.value]));
      return {
        id: unit.id,
        warehouseId: unit.warehouseId,
        imei1: identifiers.get("IMEI_1") ?? null,
        imei2: identifiers.get("IMEI_2") ?? null,
        serial: identifiers.get("SERIAL") ?? null,
      };
    }),
  });
}
