"use server";

import { requirePermission } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";
import { revalidatePaths } from "@/lib/revalidation";

type ReturnedDeviceResolution = "RESTOCK" | "DAMAGED";

export async function resolveReturnedDeviceAction(input: {
  productUnitId: string;
  resolution: ReturnedDeviceResolution;
}) {
  const { company, membership } = await requirePermission("inventory.manage");

  if (!input.productUnitId) {
    throw new Error("No se identificó el equipo.");
  }
  if (input.resolution !== "RESTOCK" && input.resolution !== "DAMAGED") {
    throw new Error("La resolución seleccionada no es válida.");
  }

  const unit = await prisma.productUnit.findFirst({
    where: {
      id: input.productUnitId,
      companyId: company.id,
      status: "RETURNED",
    },
    select: {
      id: true,
      productId: true,
      variantId: true,
      warehouseId: true,
    },
  });

  if (!unit) {
    throw new Error("Este IMEI ya no está pendiente de revisión.");
  }

  const targetStatus = input.resolution === "RESTOCK" ? "AVAILABLE" : "DAMAGED";

  await prisma.$transaction(async (tx) => {
    const updated = await tx.productUnit.updateMany({
      where: {
        id: unit.id,
        companyId: company.id,
        status: "RETURNED",
      },
      data: { status: targetStatus },
    });

    if (updated.count !== 1) {
      throw new Error("El estado del equipo cambió durante la revisión. Actualiza la pantalla.");
    }

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "UPDATE",
        entity: "PRODUCT_UNIT",
        entityId: unit.id,
        oldValues: { status: "RETURNED" },
        newValues: {
          status: targetStatus,
          resolution: input.resolution,
          productId: unit.productId,
          variantId: unit.variantId,
          warehouseId: unit.warehouseId,
        },
      },
    });
  });

  revalidatePaths([
    "/equipos",
    `/equipos/${unit.id}`,
    "/productos",
    "/reportes",
    "/devoluciones",
    "/pos",
  ]);

  return { id: unit.id, status: targetStatus };
}
