import { prisma } from "@/lib/prisma";
import { getActiveCompany } from "@/lib/company-context";
import type { ProductListItem, ProductTypeValue } from "./product-types";

type ProductFilters = {
  q?: string;
  type?: ProductTypeValue;
  brandId?: string;
  categoryId?: string;
  status?: "ACTIVE" | "INACTIVE";
  page?: number;
  pageSize?: number;
};

type ProductSummaryRow = {
  activeProducts: bigint;
  availableDevices: bigint;
  lowStock: bigint;
  inventoryValue: unknown;
};

function decimalToNumber(value: { toString(): string } | number) {
  return Number(value.toString());
}

export async function getProductCatalogContext() {
  const company = await getActiveCompany();

  const [categories, brands] = await Promise.all([
    prisma.category.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.brand.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return { company, categories, brands };
}

export async function getProducts(filters: ProductFilters = {}) {
  const company = await getActiveCompany();
  const q = filters.q?.trim();
  const pageSize = Math.min(100, Math.max(20, filters.pageSize ?? 50));
  const page = Math.max(1, filters.page ?? 1);

  const where = {
    companyId: company.id,
    deletedAt: null,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.brandId ? { brandId: filters.brandId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { model: { contains: q, mode: "insensitive" as const } },
            { sku: { contains: q, mode: "insensitive" as const } },
            { barcode: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [products, total, summaryRows] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        brand: { select: { name: true } },
        category: { select: { name: true } },
        variants: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
          include: {
            inventoryBalances: { select: { quantity: true } },
          },
        },
        _count: {
          select: {
            units: { where: { status: "AVAILABLE" } },
          },
        },
      },
    }),
    prisma.product.count({ where }),
    prisma.$queryRaw<ProductSummaryRow[]>`
      WITH accessory_stock AS (
        SELECT p."id", p."minimumStock", COALESCE(SUM(ib."quantity"), 0) AS qty
        FROM "products" p
        LEFT JOIN "inventory_balances" ib ON ib."productId" = p."id" AND ib."companyId" = p."companyId"
        WHERE p."companyId" = ${company.id} AND p."deletedAt" IS NULL AND p."status" = 'ACTIVE' AND p."type" = 'ACCESSORY'
        GROUP BY p."id", p."minimumStock"
      ),
      device_stock AS (
        SELECT p."id", p."minimumStock", COUNT(pu."id") AS qty
        FROM "products" p
        LEFT JOIN "product_units" pu ON pu."productId" = p."id" AND pu."companyId" = p."companyId" AND pu."status" = 'AVAILABLE'
        WHERE p."companyId" = ${company.id} AND p."deletedAt" IS NULL AND p."status" = 'ACTIVE' AND p."type" IN ('PHONE', 'SERIALIZED')
        GROUP BY p."id", p."minimumStock"
      )
      SELECT
        (SELECT COUNT(*) FROM "products" p WHERE p."companyId"=${company.id} AND p."deletedAt" IS NULL AND p."status"='ACTIVE') AS "activeProducts",
        (SELECT COUNT(*) FROM "product_units" pu INNER JOIN "products" p ON p."id"=pu."productId" WHERE pu."companyId"=${company.id} AND pu."status"='AVAILABLE' AND p."deletedAt" IS NULL AND p."status"='ACTIVE') AS "availableDevices",
        ((SELECT COUNT(*) FROM accessory_stock WHERE qty <= "minimumStock") + (SELECT COUNT(*) FROM device_stock WHERE qty <= "minimumStock")) AS "lowStock",
        COALESCE((SELECT SUM(ib."quantity" * ib."averageCost") FROM "inventory_balances" ib WHERE ib."companyId"=${company.id}), 0)
          + COALESCE((SELECT SUM(pu."purchaseCost") FROM "product_units" pu WHERE pu."companyId"=${company.id} AND pu."status"='AVAILABLE'), 0) AS "inventoryValue"
    `,
  ]);

  const items: ProductListItem[] = products.map((product) => {
    const firstVariant = product.variants[0];
    const quantityStock = product.variants.reduce(
      (totalQuantity, variant) => totalQuantity + variant.inventoryBalances.reduce(
        (subtotal, balance) => subtotal + decimalToNumber(balance.quantity),
        0,
      ),
      0,
    );

    const stock = product.type === "PHONE" || product.type === "SERIALIZED"
      ? product._count.units
      : product.type === "SERVICE"
        ? 0
        : quantityStock;

    const variantParts = firstVariant ? [firstVariant.ram, firstVariant.storage, firstVariant.color].filter(Boolean) : [];

    return {
      id: product.id,
      name: product.name,
      model: product.model,
      type: product.type as ProductTypeValue,
      brand: product.brand?.name ?? "Sin marca",
      category: product.category?.name ?? "Sin categoría",
      stock,
      price: firstVariant ? decimalToNumber(firstVariant.salePrice) : 0,
      cost: firstVariant ? decimalToNumber(firstVariant.purchasePrice) : 0,
      minimumStock: product.minimumStock,
      status: product.status,
      variantSummary: variantParts.join(" · ") || (product.variants.length > 1 ? `${product.variants.length} variantes` : "Variante base"),
    };
  });

  const summaryRow = summaryRows[0];
  return {
    company,
    items,
    summary: {
      activeProducts: Number(summaryRow?.activeProducts ?? 0),
      availableDevices: Number(summaryRow?.availableDevices ?? 0),
      lowStock: Number(summaryRow?.lowStock ?? 0),
      inventoryValue: Number(summaryRow?.inventoryValue ?? 0),
    },
    pagination: { page, pageSize, total },
  };
}
