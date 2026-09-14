import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";
import type { PosCatalogItem, PosCustomer, PosUnit, PosWarehouse } from "./sale-types";

function variantLabel(input: { ram: string | null; storage: string | null; color: string | null }) {
  return [input.ram, input.storage, input.color].filter(Boolean).join(" / ") || "Variante base";
}

function identifierMap(identifiers: Array<{ type: string; value: string }>) {
  return new Map(identifiers.map((item) => [item.type, item.value]));
}

function customerDisplayName(customer: { businessName?: string | null; firstName?: string | null; lastName?: string | null } | null | undefined, fallback: string) {
  if (!customer) return fallback;
  if (customer.businessName?.trim()) return customer.businessName;
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  return name || fallback;
}

function getLimaDayBounds() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const start = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 5, 0, 0));
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

function normalizePage(value: number | undefined) {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 1;
}

async function buildPosCatalog(companyId: string, query = "", limit = 80): Promise<PosCatalogItem[]> {
  const q = query.trim();
  const products = await prisma.product.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { model: { contains: q, mode: "insensitive" as const } },
              { sku: { contains: q, mode: "insensitive" as const } },
              { barcode: { contains: q, mode: "insensitive" as const } },
              { brand: { name: { contains: q, mode: "insensitive" as const } } },
              {
                variants: {
                  some: {
                    OR: [
                      { sku: { contains: q, mode: "insensitive" as const } },
                      { barcode: { contains: q, mode: "insensitive" as const } },
                      { color: { contains: q, mode: "insensitive" as const } },
                      { ram: { contains: q, mode: "insensitive" as const } },
                      { storage: { contains: q, mode: "insensitive" as const } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: Math.min(Math.max(limit, 1), 120),
    include: {
      brand: { select: { name: true } },
      category: { select: { name: true } },
      variants: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        include: { inventoryBalances: true },
      },
    },
  });

  const serializedVariantIds = products.flatMap((product) =>
    product.type === "PHONE" || product.type === "SERIALIZED"
      ? product.variants.map((variant) => variant.id)
      : [],
  );

  const unitCounts = serializedVariantIds.length
    ? await prisma.productUnit.groupBy({
        by: ["variantId", "warehouseId"],
        where: {
          companyId,
          status: "AVAILABLE",
          variantId: { in: serializedVariantIds },
        },
        _count: { _all: true },
      })
    : [];

  const countMap = new Map<string, number>();
  for (const row of unitCounts) {
    countMap.set(`${row.variantId}:${row.warehouseId}`, row._count._all);
  }

  return products.flatMap((product) =>
    product.variants.map((variant) => {
      const serialized = product.type === "PHONE" || product.type === "SERIALIZED";
      const balances = serialized
        ? unitCounts
            .filter((row) => row.variantId === variant.id)
            .map((row) => ({
              warehouseId: row.warehouseId,
              quantity: countMap.get(`${variant.id}:${row.warehouseId}`) ?? 0,
            }))
        : variant.inventoryBalances.map((balance) => ({
            warehouseId: balance.warehouseId,
            quantity: Number(balance.quantity),
          }));

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
        balances,
      } satisfies PosCatalogItem;
    }),
  );
}

export async function searchPosCatalog(query = "", limit = 80) {
  const company = await getActiveCompany();
  return buildPosCatalog(company.id, query, limit);
}

export async function getPosUnits(input: { variantId: string; warehouseId: string }): Promise<PosUnit[]> {
  const company = await getActiveCompany();
  const units = await prisma.productUnit.findMany({
    where: {
      companyId: company.id,
      variantId: input.variantId,
      warehouseId: input.warehouseId,
      status: "AVAILABLE",
    },
    orderBy: { createdAt: "asc" },
    take: 120,
    include: { identifiers: true },
  });

  return units.map((unit) => {
    const identifiers = identifierMap(unit.identifiers);
    return {
      id: unit.id,
      warehouseId: unit.warehouseId,
      imei1: identifiers.get("IMEI_1") ?? null,
      imei2: identifiers.get("IMEI_2") ?? null,
      serial: identifiers.get("SERIAL") ?? null,
    };
  });
}

export async function getPosContext() {
  const company = await getActiveCompany();

  const [warehouses, catalog, customers] = await Promise.all([
    prisma.warehouse.findMany({
      where: { companyId: company.id, status: "ACTIVE", isSaleable: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, branch: { select: { name: true } } },
    }),
    buildPosCatalog(company.id, "", 80),
    prisma.customer.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 60,
    }),
  ]);

  const customerIds = customers.map((customer) => customer.id);
  const debts = customerIds.length
    ? await prisma.accountReceivable.groupBy({
        by: ["customerId"],
        where: {
          companyId: company.id,
          customerId: { in: customerIds },
          status: { in: ["OPEN", "PARTIAL"] },
        },
        _sum: { balance: true },
      })
    : [];
  const debtMap = new Map(debts.map((row) => [row.customerId, Number(row._sum.balance ?? 0)]));

  const warehouseOptions: PosWarehouse[] = warehouses.map((warehouse) => ({
    id: warehouse.id,
    name: warehouse.name,
    branchName: warehouse.branch.name,
  }));

  const customerOptions: PosCustomer[] = customers.map((customer) => {
    const creditLimit = Number(customer.creditLimit ?? 0);
    const outstanding = debtMap.get(customer.id) ?? 0;
    return {
      id: customer.id,
      documentType: customer.documentType,
      documentNumber: customer.documentNumber,
      name: customerDisplayName(customer, "Cliente"),
      phone: customer.whatsapp ?? customer.phone,
      creditEnabled: customer.creditEnabled,
      creditLimit,
      creditDays: customer.creditDays,
      outstanding,
      availableCredit: Math.max(0, creditLimit - outstanding),
    };
  });

  return { company, warehouses: warehouseOptions, catalog, customers: customerOptions };
}

export async function getSales(filters: { q?: string; status?: string; documentType?: string; page?: number } = {}) {
  const company = await getActiveCompany();
  const q = filters.q?.trim();
  const allowedStatuses = ["DRAFT", "COMPLETED", "CANCELLED", "REFUNDED"];
  const allowedDocuments = ["RECEIPT", "INVOICE", "SALES_NOTE"];
  const page = normalizePage(filters.page);
  const pageSize = 50;

  const where = {
    companyId: company.id,
    ...(filters.status && allowedStatuses.includes(filters.status)
      ? { status: filters.status as "DRAFT" | "COMPLETED" | "CANCELLED" | "REFUNDED" }
      : {}),
    ...(filters.documentType && allowedDocuments.includes(filters.documentType)
      ? { documentType: filters.documentType as "RECEIPT" | "INVOICE" | "SALES_NOTE" }
      : {}),
    ...(q
      ? {
          OR: [
            { saleNumber: { contains: q, mode: "insensitive" as const } },
            { documentNumber: { contains: q, mode: "insensitive" as const } },
            { customer: { documentNumber: { contains: q, mode: "insensitive" as const } } },
            { customer: { businessName: { contains: q, mode: "insensitive" as const } } },
            { customer: { firstName: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const { start, end } = getLimaDayBounds();
  const [sales, totalItems, today] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: true,
        warehouse: { include: { branch: true } },
        seller: true,
        items: { select: { quantity: true } },
        payments: true,
      },
    }),
    prisma.sale.count({ where }),
    prisma.sale.aggregate({
      where: { companyId: company.id, status: "COMPLETED", createdAt: { gte: start, lt: end } },
      _sum: { total: true },
      _count: { _all: true },
    }),
  ]);

  const items = sales.map((sale) => ({
    id: sale.id,
    saleNumber: sale.saleNumber,
    documentType: sale.documentType,
    documentSeries: sale.documentSeries,
    documentNumber: sale.documentNumber,
    customer: customerDisplayName(sale.customer, "Consumidor final"),
    total: Number(sale.total),
    status: sale.status,
    itemCount: sale.items.reduce((sum, item) => sum + item.quantity, 0),
    paymentMethods: [...new Set(sale.payments.map((payment) => payment.paymentMethod))],
    branch: sale.warehouse.branch.name,
    warehouse: sale.warehouse.name,
    seller: sale.seller.name,
    createdAt: sale.createdAt.toISOString(),
  }));

  const todayTotal = Number(today._sum.total ?? 0);
  const todayCount = today._count._all;
  return {
    items,
    summary: {
      todayTotal,
      todayCount,
      averageTicket: todayCount ? todayTotal / todayCount : 0,
      listed: totalItems,
    },
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  };
}

export async function getSaleDetail(id: string) {
  const company = await getActiveCompany();
  const sale = await prisma.sale.findFirst({
    where: { id, companyId: company.id },
    include: {
      customer: true,
      warehouse: { include: { branch: true } },
      seller: true,
      createdBy: true,
      payments: { orderBy: { createdAt: "asc" } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          product: { include: { brand: true } },
          variant: true,
          units: {
            include: {
              productUnit: { include: { identifiers: true } },
            },
          },
        },
      },
    },
  });

  if (!sale) return null;

  return {
    id: sale.id,
    saleNumber: sale.saleNumber,
    documentType: sale.documentType,
    documentSeries: sale.documentSeries,
    documentNumber: sale.documentNumber,
    taxCondition: sale.taxCondition,
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    discount: Number(sale.discount),
    total: Number(sale.total),
    status: sale.status,
    createdAt: sale.createdAt.toISOString(),
    branch: sale.warehouse.branch.name,
    warehouse: sale.warehouse.name,
    seller: sale.seller.name,
    customer: sale.customer
      ? {
          id: sale.customer.id,
          documentType: sale.customer.documentType,
          documentNumber: sale.customer.documentNumber,
          name: customerDisplayName(sale.customer, "Cliente"),
          phone: sale.customer.whatsapp ?? sale.customer.phone,
          email: sale.customer.email,
          address: sale.customer.address,
        }
      : null,
    items: sale.items.map((item) => ({
      id: item.id,
      product: item.product.name,
      brand: item.product.brand?.name ?? "Sin marca",
      variant: variantLabel(item.variant),
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      unitCost: Number(item.unitCost),
      discount: Number(item.discount),
      subtotal: Number(item.subtotal),
      tax: Number(item.tax),
      total: Number(item.total),
      identifiers: item.units.map((link) => {
        const identifiers = identifierMap(link.productUnit.identifiers);
        return {
          imei1: identifiers.get("IMEI_1") ?? null,
          imei2: identifiers.get("IMEI_2") ?? null,
          serial: identifiers.get("SERIAL") ?? null,
        };
      }),
    })),
    payments: sale.payments.map((payment) => ({
      id: payment.id,
      method: payment.paymentMethod,
      amount: Number(payment.amount),
      reference: payment.reference,
      notes: payment.notes,
    })),
  };
}
