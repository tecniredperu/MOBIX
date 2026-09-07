import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

const IN_TYPES = new Set(["PURCHASE", "TRANSFER_IN", "RETURN_IN", "ADJUSTMENT_IN", "WARRANTY_OUT"]);
const OUT_TYPES = new Set(["SALE", "TRANSFER_OUT", "RETURN_OUT", "ADJUSTMENT_OUT", "WARRANTY_IN"]);

export async function getKardex(filters: { q?: string; movementType?: string; warehouseId?: string } = {}) {
  const company = await getActiveCompany();
  const q = filters.q?.trim();
  const allowedTypes = ["PURCHASE", "SALE", "TRANSFER_IN", "TRANSFER_OUT", "RETURN_IN", "RETURN_OUT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "WARRANTY_IN", "WARRANTY_OUT"];

  const where = {
    companyId: company.id,
    ...(filters.movementType && allowedTypes.includes(filters.movementType)
      ? { movementType: filters.movementType as "PURCHASE" | "SALE" | "TRANSFER_IN" | "TRANSFER_OUT" | "RETURN_IN" | "RETURN_OUT" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "WARRANTY_IN" | "WARRANTY_OUT" }
      : {}),
    ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
    ...(q
      ? {
          OR: [
            { product: { name: { contains: q, mode: "insensitive" as const } } },
            { variant: { sku: { contains: q, mode: "insensitive" as const } } },
            { referenceType: { contains: q, mode: "insensitive" as const } },
            { notes: { contains: q, mode: "insensitive" as const } },
            { productUnit: { identifiers: { some: { value: { contains: q, mode: "insensitive" as const } } } } },
          ],
        }
      : {}),
  };

  const [movements, warehouses] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        product: { include: { brand: true } },
        variant: true,
        warehouse: { include: { branch: true } },
        productUnit: { include: { identifiers: true } },
        createdBy: true,
      },
    }),
    prisma.warehouse.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, branch: { select: { name: true } } },
    }),
  ]);

  const items = movements.map((movement) => {
    const identifiers = new Map(movement.productUnit?.identifiers.map((identifier) => [identifier.type, identifier.value]) ?? []);
    const quantity = Number(movement.quantity);
    const direction = IN_TYPES.has(movement.movementType) ? "IN" : OUT_TYPES.has(movement.movementType) ? "OUT" : "NEUTRAL";
    return {
      id: movement.id,
      date: movement.createdAt.toISOString(),
      product: movement.product.name,
      brand: movement.product.brand?.name ?? "Sin marca",
      variant: [movement.variant.ram, movement.variant.storage, movement.variant.color].filter(Boolean).join(" / ") || "Variante base",
      movementType: movement.movementType,
      direction,
      quantity,
      unitCost: Number(movement.unitCost),
      warehouse: movement.warehouse.name,
      branch: movement.warehouse.branch.name,
      imei: identifiers.get("IMEI_1") ?? identifiers.get("SERIAL") ?? null,
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      notes: movement.notes,
      user: movement.createdBy.name,
    };
  });

  return {
    items,
    warehouses: warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name, branchName: warehouse.branch.name })),
    summary: {
      movements: items.length,
      entries: items.filter((item) => item.direction === "IN").reduce((sum, item) => sum + item.quantity, 0),
      exits: items.filter((item) => item.direction === "OUT").reduce((sum, item) => sum + item.quantity, 0),
      value: items.reduce((sum, item) => sum + item.quantity * item.unitCost * (item.direction === "OUT" ? -1 : item.direction === "IN" ? 1 : 0), 0),
    },
  };
}
