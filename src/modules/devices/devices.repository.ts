import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

export async function getDevices(filters: { q?: string; status?: string; warehouseId?: string } = {}) {
  const company = await getActiveCompany();
  const q = filters.q?.trim();
  const allowedStatuses = ["AVAILABLE", "RESERVED", "SOLD", "IN_TRANSFER", "WARRANTY", "TECHNICAL_SERVICE", "RETURNED", "DAMAGED", "LOST", "INACTIVE"];

  const where = {
    companyId: company.id,
    ...(filters.status && allowedStatuses.includes(filters.status)
      ? { status: filters.status as "AVAILABLE" | "RESERVED" | "SOLD" | "IN_TRANSFER" | "WARRANTY" | "TECHNICAL_SERVICE" | "RETURNED" | "DAMAGED" | "LOST" | "INACTIVE" }
      : {}),
    ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
    ...(q
      ? {
          OR: [
            { product: { name: { contains: q, mode: "insensitive" as const } } },
            { product: { model: { contains: q, mode: "insensitive" as const } } },
            { variant: { sku: { contains: q, mode: "insensitive" as const } } },
            { identifiers: { some: { value: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };

  const [units, warehouses, grouped] = await Promise.all([
    prisma.productUnit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 150,
      include: {
        product: { include: { brand: true } },
        variant: true,
        warehouse: { include: { branch: true } },
        identifiers: true,
        purchase: { include: { supplier: true } },
      },
    }),
    prisma.warehouse.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, branch: { select: { name: true } } },
    }),
    prisma.productUnit.groupBy({
      by: ["status"],
      where: { companyId: company.id },
      _count: { _all: true },
    }),
  ]);

  const statusCounts = new Map(grouped.map((row) => [row.status, row._count._all]));

  return {
    items: units.map((unit) => {
      const identifiers = new Map(unit.identifiers.map((identifier) => [identifier.type, identifier.value]));
      return {
        id: unit.id,
        product: unit.product.name,
        model: unit.product.model,
        brand: unit.product.brand?.name ?? "Sin marca",
        variant: [unit.variant.ram, unit.variant.storage, unit.variant.color].filter(Boolean).join(" / ") || "Variante base",
        sku: unit.variant.sku,
        imei1: identifiers.get("IMEI_1") ?? "—",
        imei2: identifiers.get("IMEI_2") ?? "—",
        serial: identifiers.get("SERIAL") ?? "—",
        warehouse: unit.warehouse.name,
        branch: unit.warehouse.branch.name,
        cost: Number(unit.purchaseCost),
        status: unit.status,
        supplier: unit.purchase?.supplier.businessName ?? "—",
        purchaseNumber: unit.purchase?.number ?? "—",
        createdAt: unit.createdAt.toISOString(),
      };
    }),
    warehouses: warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name, branchName: warehouse.branch.name })),
    summary: {
      total: grouped.reduce((sum, row) => sum + row._count._all, 0),
      available: statusCounts.get("AVAILABLE") ?? 0,
      sold: statusCounts.get("SOLD") ?? 0,
      service: (statusCounts.get("WARRANTY") ?? 0) + (statusCounts.get("TECHNICAL_SERVICE") ?? 0),
    },
  };
}
