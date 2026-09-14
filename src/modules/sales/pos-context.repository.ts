import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";
import type { PosCatalogItem, PosCustomer, PosWarehouse } from "./sale-types";

type CreditProfileRow = {
  id: string;
  creditEnabled: boolean;
  creditLimit: unknown;
  creditDays: number;
  outstanding: unknown;
};

type ProductForPos = Awaited<ReturnType<typeof loadProducts>>[number];

function variantLabel(input: { ram: string | null; storage: string | null; color: string | null }) {
  return [input.ram, input.storage, input.color].filter(Boolean).join(" / ") || "Variante base";
}

function customerDisplayName(customer: { businessName?: string | null; firstName?: string | null; lastName?: string | null }, fallback: string) {
  if (customer.businessName?.trim()) return customer.businessName;
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  return name || fallback;
}

function loadProducts(companyId: string, q?: string) {
  const query = q?.trim();
  return prisma.product.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      deletedAt: null,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { model: { contains: query, mode: "insensitive" as const } },
              { sku: { contains: query, mode: "insensitive" as const } },
              { barcode: { contains: query, mode: "insensitive" as const } },
              { brand: { name: { contains: query, mode: "insensitive" as const } } },
              {
                variants: {
                  some: {
                    status: "ACTIVE",
                    OR: [
                      { sku: { contains: query, mode: "insensitive" as const } },
                      { barcode: { contains: query, mode: "insensitive" as const } },
                      { color: { contains: query, mode: "insensitive" as const } },
                      { ram: { contains: query, mode: "insensitive" as const } },
                      { storage: { contains: query, mode: "insensitive" as const } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 80,
    select: {
      id: true,
      type: true,
      name: true,
      sku: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
      variants: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          sku: true,
          ram: true,
          storage: true,
          color: true,
          salePrice: true,
          minimumSalePrice: true,
          inventoryBalances: { select: { warehouseId: true, quantity: true } },
        },
      },
    },
  });
}

async function mapCatalog(companyId: string, warehouses: Array<{ id: string }>, products: ProductForPos[]) {
  const variantIds = products.flatMap((product) => product.variants.map((variant) => variant.id));
  const serializedStock = variantIds.length
    ? await prisma.productUnit.groupBy({
        by: ["variantId", "warehouseId"],
        where: { companyId, status: "AVAILABLE", variantId: { in: variantIds } },
        _count: { _all: true },
      })
    : [];
  const stockMap = new Map(serializedStock.map((row) => [`${row.variantId}:${row.warehouseId}`, row._count._all]));

  return products.flatMap((product): PosCatalogItem[] =>
    product.variants.map((variant) => {
      const serialized = product.type === "PHONE" || product.type === "SERIALIZED";
      return {
        productId: product.id,
        variantId: variant.id,
        type: product.type,
        name: product.name,
        brand: product.brand?.name ?? "Sin marca",
        category: product.category?.name ?? "Sin categoría",
        sku: variant.sku ?? product.sku,
        variant: variantLabel(variant),
        salePrice: Number(variant.salePrice),
        minimumSalePrice: Number(variant.minimumSalePrice),
        units: [],
        balances: serialized
          ? warehouses.map((warehouse) => ({
              warehouseId: warehouse.id,
              quantity: stockMap.get(`${variant.id}:${warehouse.id}`) ?? 0,
            }))
          : variant.inventoryBalances.map((balance) => ({
              warehouseId: balance.warehouseId,
              quantity: Number(balance.quantity),
            })),
      };
    }),
  ).slice(0, 80);
}

export async function getOptimizedPosContext() {
  const company = await getActiveCompany();
  const [warehouses, products, customers, creditProfiles] = await Promise.all([
    prisma.warehouse.findMany({
      where: { companyId: company.id, status: "ACTIVE", isSaleable: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, branch: { select: { name: true } } },
    }),
    loadProducts(company.id),
    prisma.customer.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.$queryRaw<CreditProfileRow[]>`
      SELECT c."id", c."creditEnabled", c."creditLimit", c."creditDays",
        COALESCE(SUM(ar."balance") FILTER (WHERE ar."status" IN ('OPEN', 'PARTIAL')), 0) AS "outstanding"
      FROM "customers" c
      LEFT JOIN "accounts_receivable" ar ON ar."customerId" = c."id" AND ar."companyId" = c."companyId"
      WHERE c."companyId" = ${company.id}
      GROUP BY c."id", c."creditEnabled", c."creditLimit", c."creditDays"
    `,
  ]);

  const creditMap = new Map(creditProfiles.map((profile) => [profile.id, profile]));
  const catalog = await mapCatalog(company.id, warehouses, products);
  const warehouseOptions: PosWarehouse[] = warehouses.map((warehouse) => ({
    id: warehouse.id,
    name: warehouse.name,
    branchName: warehouse.branch.name,
  }));
  const customerOptions: PosCustomer[] = customers.map((customer) => {
    const profile = creditMap.get(customer.id);
    const creditLimit = Number(profile?.creditLimit ?? 0);
    const outstanding = Number(profile?.outstanding ?? 0);
    return {
      id: customer.id,
      documentType: customer.documentType,
      documentNumber: customer.documentNumber,
      name: customerDisplayName(customer, "Cliente"),
      phone: customer.whatsapp ?? customer.phone,
      creditEnabled: Boolean(profile?.creditEnabled),
      creditLimit,
      creditDays: Number(profile?.creditDays ?? 30),
      outstanding,
      availableCredit: Math.max(0, creditLimit - outstanding),
    };
  });

  return { company, warehouses: warehouseOptions, catalog, customers: customerOptions };
}

export async function searchPosCatalog(q: string) {
  const company = await getActiveCompany();
  const query = q.trim();
  if (query.length < 2) return [];
  const [warehouses, products] = await Promise.all([
    prisma.warehouse.findMany({
      where: { companyId: company.id, status: "ACTIVE", isSaleable: true },
      select: { id: true },
    }),
    loadProducts(company.id, query),
  ]);
  return mapCatalog(company.id, warehouses, products);
}
