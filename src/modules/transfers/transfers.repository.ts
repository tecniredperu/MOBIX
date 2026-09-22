import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

export async function getTransfers() {
  const company = await getActiveCompany();
  const rows = await prisma.stockTransfer.findMany({
    where: { companyId: company.id },
    select: {
      id: true,
      transferNumber: true,
      status: true,
      notes: true,
      createdAt: true,
      sentAt: true,
      receivedAt: true,
      fromWarehouse: {
        select: {
          name: true,
          branch: { select: { name: true } },
        },
      },
      toWarehouse: {
        select: {
          name: true,
          branch: { select: { name: true } },
        },
      },
      createdBy: { select: { name: true } },
      receivedBy: { select: { name: true } },
      items: { select: { quantity: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  return rows.map((row) => ({
    id: row.id,
    transferNumber: row.transferNumber,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    fromWarehouse: row.fromWarehouse.name,
    fromBranch: row.fromWarehouse.branch.name,
    toWarehouse: row.toWarehouse.name,
    toBranch: row.toWarehouse.branch.name,
    createdBy: row.createdBy.name,
    receivedBy: row.receivedBy?.name ?? null,
    items: row.items.length,
    units: row.items.reduce((sum, item) => sum + item.quantity, 0),
  }));
}

export async function getTransferOptions() {
  const company = await getActiveCompany();
  const [warehouses, variants, serializedStock] = await Promise.all([
    prisma.warehouse.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      select: { id: true, name: true, branch: { select: { name: true } } },
      orderBy: [{ branch: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.productVariant.findMany({
      where: {
        companyId: company.id,
        status: "ACTIVE",
        product: { status: "ACTIVE", type: { in: ["PHONE", "SERIALIZED", "ACCESSORY"] } },
      },
      select: {
        id: true,
        color: true,
        ram: true,
        storage: true,
        sku: true,
        product: {
          select: {
            name: true,
            type: true,
            brand: { select: { name: true } },
          },
        },
        inventoryBalances: {
          select: { warehouseId: true, quantity: true },
        },
      },
      orderBy: { product: { name: "asc" } },
    }),
    prisma.productUnit.groupBy({
      by: ["variantId", "warehouseId"],
      where: {
        companyId: company.id,
        status: "AVAILABLE",
      },
      _count: { _all: true },
    }),
  ]);

  const serializedBalanceMap = new Map<string, number>(
    serializedStock.map((row) => [
      `${row.variantId}:${row.warehouseId}`,
      row._count._all,
    ]),
  );

  return {
    warehouses: warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      branch: warehouse.branch.name,
    })),
    products: variants.map((variant) => ({
      variantId: variant.id,
      name: variant.product.name,
      type: variant.product.type,
      variant:
        [variant.color, variant.ram, variant.storage].filter(Boolean).join(" · ") ||
        variant.sku ||
        "General",
      brand: variant.product.brand?.name ?? "",
      balances: variant.product.type === "ACCESSORY"
        ? variant.inventoryBalances.map((balance) => ({
            warehouseId: balance.warehouseId,
            quantity: Number(balance.quantity),
          }))
        : warehouses.map((warehouse) => ({
            warehouseId: warehouse.id,
            quantity: serializedBalanceMap.get(`${variant.id}:${warehouse.id}`) ?? 0,
          })),
    })),
  };
}

export async function getTransferUnits(variantId: string, warehouseId: string) {
  const company = await getActiveCompany();
  if (!variantId || !warehouseId) return [];

  const units = await prisma.productUnit.findMany({
    where: {
      companyId: company.id,
      variantId,
      warehouseId,
      status: "AVAILABLE",
      variant: {
        status: "ACTIVE",
        product: {
          status: "ACTIVE",
          type: { in: ["PHONE", "SERIALIZED"] },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      identifiers: { select: { type: true, value: true } },
    },
  });

  return units.map((unit) => ({
    id: unit.id,
    identifier:
      unit.identifiers.find((identifier) => identifier.type === "IMEI_1")?.value
      ?? unit.identifiers.find((identifier) => identifier.type === "SERIAL")?.value
      ?? unit.id,
  }));
}
