import { prisma } from "@/lib/prisma";
import { getActiveCompany } from "@/lib/company-context";
import type { ProductListItem, ProductTypeValue } from "./product-types";

type ProductFilters = {
  q?: string;
  type?: ProductTypeValue;
  brandId?: string;
  categoryId?: string;
  status?: "ACTIVE" | "INACTIVE";
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

  const products = await prisma.product.findMany({
    where: {
      companyId: company.id,
      deletedAt: null,
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.brandId ? { brandId: filters.brandId } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { model: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
              { barcode: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      brand: { select: { name: true } },
      category: { select: { name: true } },
      variants: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        include: {
          inventoryBalances: {
            select: { quantity: true },
          },
        },
      },
      units: {
        where: { status: "AVAILABLE" },
        select: { id: true },
      },
    },
  });

  const items: ProductListItem[] = products.map((product) => {
    const firstVariant = product.variants[0];
    const quantityStock = product.variants.reduce(
      (total, variant) =>
        total +
        variant.inventoryBalances.reduce(
          (subtotal, balance) => subtotal + decimalToNumber(balance.quantity),
          0,
        ),
      0,
    );

    const stock =
      product.type === "PHONE" || product.type === "SERIALIZED"
        ? product.units.length
        : product.type === "SERVICE"
          ? 0
          : quantityStock;

    const variantParts = firstVariant
      ? [firstVariant.ram, firstVariant.storage, firstVariant.color].filter(Boolean)
      : [];

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
      variantSummary:
        variantParts.join(" · ") ||
        (product.variants.length > 1 ? `${product.variants.length} variantes` : "Variante base"),
    };
  });

  const summary = items.reduce(
    (acc, product) => {
      if (product.status === "ACTIVE") acc.activeProducts += 1;
      if (product.type === "PHONE" || product.type === "SERIALIZED") {
        acc.availableDevices += product.stock;
      }
      if (
        product.status === "ACTIVE" &&
        product.type !== "SERVICE" &&
        product.stock <= product.minimumStock
      ) {
        acc.lowStock += 1;
      }
      acc.inventoryValue += product.stock * product.cost;
      return acc;
    },
    { activeProducts: 0, availableDevices: 0, lowStock: 0, inventoryValue: 0 },
  );

  return { company, items, summary };
}
