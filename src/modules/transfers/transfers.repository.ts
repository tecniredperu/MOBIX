import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

type TransferRow = {
  id: string;
  transferNumber: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  sentAt: Date | null;
  receivedAt: Date | null;
  fromWarehouse: string;
  fromBranch: string;
  toWarehouse: string;
  toBranch: string;
  createdBy: string;
  receivedBy: string | null;
  items: bigint;
  units: bigint;
};

export async function getTransfers() {
  const company = await getActiveCompany();
  const rows = await prisma.$queryRaw<TransferRow[]>`
    SELECT
      t."id",
      t."transferNumber",
      t."status",
      t."notes",
      t."createdAt",
      t."sentAt",
      t."receivedAt",
      fw."name" AS "fromWarehouse",
      fb."name" AS "fromBranch",
      tw."name" AS "toWarehouse",
      tb."name" AS "toBranch",
      cu."name" AS "createdBy",
      ru."name" AS "receivedBy",
      COUNT(ti."id")::bigint AS "items",
      COALESCE(SUM(ti."quantity"), 0)::bigint AS "units"
    FROM "stock_transfers" t
    JOIN "warehouses" fw ON fw."id" = t."fromWarehouseId"
    JOIN "branches" fb ON fb."id" = fw."branchId"
    JOIN "warehouses" tw ON tw."id" = t."toWarehouseId"
    JOIN "branches" tb ON tb."id" = tw."branchId"
    JOIN "users" cu ON cu."id" = t."createdById"
    LEFT JOIN "users" ru ON ru."id" = t."receivedById"
    LEFT JOIN "stock_transfer_items" ti ON ti."transferId" = t."id"
    WHERE t."companyId" = ${company.id}
    GROUP BY t."id", fw."name", fb."name", tw."name", tb."name", cu."name", ru."name"
    ORDER BY t."createdAt" DESC
    LIMIT 150
  `;

  return rows.map((row) => ({
    ...row,
    items: Number(row.items),
    units: Number(row.units),
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    receivedAt: row.receivedAt?.toISOString() ?? null,
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
