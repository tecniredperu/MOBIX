import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";
import type { PurchaseCatalogItem } from "./purchase-types";

export async function getPurchaseContext() {
  const company = await getActiveCompany();
  const [warehouses, variants] = await Promise.all([
    prisma.warehouse.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: [{ branch: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, branch: { select: { name: true } } },
    }),
    prisma.productVariant.findMany({
      where: {
        companyId: company.id,
        status: "ACTIVE",
        product: { status: "ACTIVE", controlsStock: true, type: { not: "SERVICE" } },
      },
      orderBy: { product: { name: "asc" } },
      include: { product: { include: { brand: true } } },
    }),
  ]);

  const catalog: PurchaseCatalogItem[] = variants.map((variant) => ({
    variantId: variant.id,
    productId: variant.productId,
    name: variant.product.name,
    model: variant.product.model,
    type: variant.product.type as "PHONE" | "SERIALIZED" | "ACCESSORY",
    brand: variant.product.brand?.name ?? "Sin marca",
    color: variant.color,
    ram: variant.ram,
    storage: variant.storage,
    sku: variant.sku,
    purchasePrice: Number(variant.purchasePrice),
    requiresImei: variant.product.requiresImei,
    requiresSerial: variant.product.requiresSerial,
  }));

  return {
    warehouses: warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      branchName: warehouse.branch.name,
    })),
    catalog,
  };
}

export async function getPurchases(filters: { q?: string; status?: string } = {}) {
  const company = await getActiveCompany();
  const q = filters.q?.trim();
  const where = {
    companyId: company.id,
    ...(filters.status && ["DRAFT", "CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"].includes(filters.status)
      ? { status: filters.status as "DRAFT" | "CONFIRMED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED" }
      : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" as const } },
            { documentNumber: { contains: q, mode: "insensitive" as const } },
            { documentSeries: { contains: q, mode: "insensitive" as const } },
            { supplier: { businessName: { contains: q, mode: "insensitive" as const } } },
            { supplier: { documentNumber: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [purchases, totalCount, totals] = await Promise.all([
    prisma.purchase.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        supplier: true,
        warehouse: { include: { branch: true } },
        _count: { select: { items: true, productUnits: true } },
      },
    }),
    prisma.purchase.count({ where: { companyId: company.id, status: { not: "CANCELLED" } } }),
    prisma.purchase.aggregate({
      where: { companyId: company.id, status: { not: "CANCELLED" } },
      _sum: { total: true, tax: true },
    }),
  ]);

  return {
    items: purchases.map((purchase) => ({
      id: purchase.id,
      number: purchase.number,
      issueDate: purchase.issueDate.toISOString(),
      supplier: purchase.supplier.businessName,
      supplierDocument: purchase.supplier.documentNumber ?? "—",
      documentType: purchase.documentType ?? "—",
      document: [purchase.documentSeries, purchase.documentNumber].filter(Boolean).join("-") || "—",
      warehouse: purchase.warehouse.name,
      branch: purchase.warehouse.branch.name,
      subtotal: Number(purchase.subtotal),
      tax: Number(purchase.tax),
      total: Number(purchase.total),
      status: purchase.status,
      lines: purchase._count.items,
      serializedUnits: purchase._count.productUnits,
      notes: purchase.notes,
    })),
    summary: {
      purchases: totalCount,
      total: Number(totals._sum.total ?? 0),
      tax: Number(totals._sum.tax ?? 0),
    },
  };
}
