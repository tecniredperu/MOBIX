import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";
import type { PosCatalogItem, PosCustomer, PosWarehouse } from "./sale-types";

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

export async function getPosContext() {
  const company = await getActiveCompany();

  const [warehouses, products, customers] = await Promise.all([
    prisma.warehouse.findMany({
      where: { companyId: company.id, status: "ACTIVE", isSaleable: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, branch: { select: { name: true } } },
    }),
    prisma.product.findMany({
      where: { companyId: company.id, status: "ACTIVE", deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        brand: true,
        category: true,
        variants: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
          include: {
            units: {
              where: { status: "AVAILABLE" },
              include: { identifiers: true },
              orderBy: { createdAt: "asc" },
            },
            inventoryBalances: true,
          },
        },
      },
    }),
    prisma.customer.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  const catalog: PosCatalogItem[] = products.flatMap((product) =>
    product.variants.map((variant) => ({
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
      units: variant.units.map((unit) => {
        const identifiers = identifierMap(unit.identifiers);
        return {
          id: unit.id,
          warehouseId: unit.warehouseId,
          imei1: identifiers.get("IMEI_1") ?? null,
          imei2: identifiers.get("IMEI_2") ?? null,
          serial: identifiers.get("SERIAL") ?? null,
        };
      }),
      balances: variant.inventoryBalances.map((balance) => ({
        warehouseId: balance.warehouseId,
        quantity: Number(balance.quantity),
      })),
    })),
  );

  const warehouseOptions: PosWarehouse[] = warehouses.map((warehouse) => ({
    id: warehouse.id,
    name: warehouse.name,
    branchName: warehouse.branch.name,
  }));

  const customerOptions: PosCustomer[] = customers.map((customer) => ({
    id: customer.id,
    documentType: customer.documentType,
    documentNumber: customer.documentNumber,
    name: customerDisplayName(customer, "Cliente"),
    phone: customer.whatsapp ?? customer.phone,
  }));

  return { company, warehouses: warehouseOptions, catalog, customers: customerOptions };
}

export async function getSales(filters: { q?: string; status?: string; documentType?: string } = {}) {
  const company = await getActiveCompany();
  const q = filters.q?.trim();
  const allowedStatuses = ["DRAFT", "COMPLETED", "CANCELLED", "REFUNDED"];
  const allowedDocuments = ["RECEIPT", "INVOICE", "SALES_NOTE"];

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
  const [sales, todaySales] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 150,
      include: {
        customer: true,
        warehouse: { include: { branch: true } },
        seller: true,
        items: { select: { quantity: true } },
        payments: true,
      },
    }),
    prisma.sale.findMany({
      where: { companyId: company.id, status: "COMPLETED", createdAt: { gte: start, lt: end } },
      select: { total: true },
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

  const todayTotal = todaySales.reduce((sum, sale) => sum + Number(sale.total), 0);
  return {
    items,
    summary: {
      todayTotal,
      todayCount: todaySales.length,
      averageTicket: todaySales.length ? todayTotal / todaySales.length : 0,
      listed: items.length,
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
