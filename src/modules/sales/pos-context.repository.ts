import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";
import type { PosCatalogItem, PosCustomer, PosUnit, PosWarehouse } from "./sale-types";

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

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-PE")
    .trim()
    .replace(/\s+/g, " ");
}

function searchTokens(value?: string) {
  if (!value?.trim()) return [];
  return normalizeSearch(value)
    .split(" ")
    .filter(Boolean)
    .slice(0, 8);
}

function extractIdentifierCandidate(value: string) {
  return value
    .trim()
    .replace(/^(?:imei(?:\s*[12])?|serie|serial)\s*[:#-]?\s*/i, "")
    .replace(/\s+/g, "");
}

function loadProducts(companyId: string, q?: string, productIds?: string[]) {
  const tokens = searchTokens(q);

  return prisma.product.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      deletedAt: null,
      ...(productIds?.length ? { id: { in: productIds } } : {}),
      ...(tokens.length
        ? {
            AND: tokens.map((token) => ({
              OR: [
                { name: { contains: token, mode: "insensitive" as const } },
                { model: { contains: token, mode: "insensitive" as const } },
                { sku: { contains: token, mode: "insensitive" as const } },
                { barcode: { contains: token, mode: "insensitive" as const } },
                { brand: { name: { contains: token, mode: "insensitive" as const } } },
                { category: { name: { contains: token, mode: "insensitive" as const } } },
                {
                  variants: {
                    some: {
                      status: "ACTIVE",
                      OR: [
                        { sku: { contains: token, mode: "insensitive" as const } },
                        { barcode: { contains: token, mode: "insensitive" as const } },
                        { color: { contains: token, mode: "insensitive" as const } },
                        { ram: { contains: token, mode: "insensitive" as const } },
                        { storage: { contains: token, mode: "insensitive" as const } },
                      ],
                    },
                  },
                },
              ],
            })),
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

async function mapCatalog(
  companyId: string,
  warehouses: Array<{ id: string }>,
  products: ProductForPos[],
  matchedUnitsByVariant?: Map<string, PosUnit>,
) {
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
      const matchedUnit = matchedUnitsByVariant?.get(variant.id);

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
        units: matchedUnit ? [matchedUnit] : [],
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
  ).slice(0, 120);
}

function catalogSearchScore(item: PosCatalogItem, rawQuery: string) {
  const query = normalizeSearch(rawQuery);
  if (!query) return 0;

  const sku = normalizeSearch(item.sku ?? "");
  const name = normalizeSearch(item.name);
  const brand = normalizeSearch(item.brand);
  const variant = normalizeSearch(item.variant);
  const category = normalizeSearch(item.category);
  const identifiers = item.units.flatMap((unit) => [unit.imei1, unit.imei2, unit.serial]).filter(Boolean).map((value) => normalizeSearch(value ?? ""));

  let score = 0;
  if (identifiers.some((value) => value === query)) score += 2000;
  if (sku === query) score += 1500;
  if (name === query) score += 1200;
  if (name.startsWith(query)) score += 800;
  if (sku.startsWith(query)) score += 750;
  if (brand === query) score += 500;
  if (variant.includes(query)) score += 350;
  if (category.includes(query)) score += 150;

  const haystack = [name, brand, variant, category, sku, ...identifiers].join(" ");
  for (const token of searchTokens(query)) {
    if (haystack.includes(token)) score += 60;
  }

  return score;
}

async function searchAvailableIdentifiers(companyId: string, rawQuery: string, warehouseId?: string) {
  const candidate = extractIdentifierCandidate(rawQuery);
  if (candidate.length < 6 || !/^[a-z0-9-]+$/i.test(candidate)) return [];

  const exact = candidate.length >= 12;

  return prisma.productUnitIdentifier.findMany({
    where: {
      companyId,
      value: exact
        ? { equals: candidate, mode: "insensitive" }
        : { startsWith: candidate, mode: "insensitive" },
      productUnit: {
        status: "AVAILABLE",
        ...(warehouseId ? { warehouseId } : {}),
        product: { status: "ACTIVE", deletedAt: null },
        variant: { status: "ACTIVE" },
      },
    },
    select: {
      value: true,
      productUnit: {
        select: {
          id: true,
          productId: true,
          variantId: true,
          warehouseId: true,
          identifiers: { select: { type: true, value: true } },
        },
      },
    },
    take: 20,
  });
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

export async function searchPosCatalog(q: string, warehouseId?: string) {
  const company = await getActiveCompany();
  const query = q.trim();
  if (query.length < 2) return [];

  const [warehouses, textProducts, identifierHits] = await Promise.all([
    prisma.warehouse.findMany({
      where: { companyId: company.id, status: "ACTIVE", isSaleable: true },
      select: { id: true },
    }),
    loadProducts(company.id, query),
    searchAvailableIdentifiers(company.id, query, warehouseId),
  ]);

  const matchedUnitsByVariant = new Map<string, PosUnit>();
  const identifierProductIds = new Set<string>();

  const normalizedCandidate = normalizeSearch(extractIdentifierCandidate(query));
  const orderedHits = [...identifierHits].sort((a, b) => {
    const aExact = normalizeSearch(a.value) === normalizedCandidate ? 1 : 0;
    const bExact = normalizeSearch(b.value) === normalizedCandidate ? 1 : 0;
    return bExact - aExact;
  });

  for (const hit of orderedHits) {
    const unit = hit.productUnit;
    identifierProductIds.add(unit.productId);
    if (matchedUnitsByVariant.has(unit.variantId)) continue;

    const identifiers = new Map(unit.identifiers.map((identifier) => [identifier.type, identifier.value]));
    matchedUnitsByVariant.set(unit.variantId, {
      id: unit.id,
      warehouseId: unit.warehouseId,
      imei1: identifiers.get("IMEI_1") ?? null,
      imei2: identifiers.get("IMEI_2") ?? null,
      serial: identifiers.get("SERIAL") ?? null,
    });
  }

  const identifierProducts = identifierProductIds.size
    ? await loadProducts(company.id, undefined, [...identifierProductIds])
    : [];

  const [identifierCatalogRaw, textCatalog] = await Promise.all([
    identifierProducts.length
      ? mapCatalog(company.id, warehouses, identifierProducts, matchedUnitsByVariant)
      : Promise.resolve([] as PosCatalogItem[]),
    mapCatalog(company.id, warehouses, textProducts),
  ]);

  const identifierCatalog = identifierCatalogRaw.filter((item) => matchedUnitsByVariant.has(item.variantId));
  const merged = new Map<string, PosCatalogItem>();

  for (const item of identifierCatalog) merged.set(item.variantId, item);
  for (const item of textCatalog) {
    const existing = merged.get(item.variantId);
    merged.set(item.variantId, existing ? { ...item, units: existing.units } : item);
  }

  return [...merged.values()]
    .sort((a, b) => catalogSearchScore(b, query) - catalogSearchScore(a, query) || a.name.localeCompare(b.name, "es"))
    .slice(0, 80);
}
