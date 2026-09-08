import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

export async function getTransfers() {
  const company = await getActiveCompany();
  const rows = await prisma.stockTransfer.findMany({
    where: { companyId: company.id },
    include: {
      fromWarehouse: { include: { branch: { select: { name: true } } } },
      toWarehouse: { include: { branch: { select: { name: true } } } },
      createdBy: { select: { name: true } },
      receivedBy: { select: { name: true } },
      items: { select: { quantity: true } },
      _count: { select: { items: true } },
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
    items: row._count.items,
    units: row.items.reduce((sum, item) => sum + item.quantity, 0),
  }));
}

export async function getTransferOptions() {
  const company = await getActiveCompany();
  const [warehouses, variants] = await Promise.all([
    prisma.warehouse.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      include: { branch: { select: { name: true } } },
      orderBy: [{ branch: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.productVariant.findMany({
      where: {
        companyId: company.id,
        status: "ACTIVE",
        product: { status: "ACTIVE", type: { in: ["PHONE", "SERIALIZED", "ACCESSORY"] } },
      },
      include: {
        product: { include: { brand: true } },
        units: { where: { status: "AVAILABLE" }, include: { identifiers: true } },
        inventoryBalances: true,
      },
      orderBy: { product: { name: "asc" } },
    }),
  ]);

  return {
    warehouses: warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      branch: warehouse.branch.name,
    })),
    products: variants.map((variant) => ({
      variantId: variant.id,
      productId: variant.productId,
      name: variant.product.name,
      type: variant.product.type,
      variant:
        [variant.color, variant.ram, variant.storage].filter(Boolean).join(" · ") ||
        variant.sku ||
        "General",
      brand: variant.product.brand?.name ?? "",
      cost: Number(variant.purchasePrice),
      balances: variant.inventoryBalances.map((balance) => ({
        warehouseId: balance.warehouseId,
        quantity: Number(balance.quantity),
        averageCost: Number(balance.averageCost),
      })),
      units: variant.units.map((unit) => ({
        id: unit.id,
        warehouseId: unit.warehouseId,
        cost: Number(unit.purchaseCost),
        identifier:
          unit.identifiers.find((identifier) => identifier.type === "IMEI_1")?.value ||
          unit.identifiers.find((identifier) => identifier.type === "SERIAL")?.value ||
          unit.id,
      })),
    })),
  };
}
