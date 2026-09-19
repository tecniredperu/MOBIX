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

  const [warehouses, products, customers, creditProfiles, serializedStock] = await Promise.all([
    prisma.warehouse.findMany({
      where: { companyId: company.id, status: "ACTIVE", isSaleable: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, branch: { select: { name: true } } },
    }),
    prisma.product.findMany({
      where: { companyId: company.id, status: "ACTIVE", deletedAt: null },
      orderBy: { name: "asc" },
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
            inventoryBalances: {
              select: { warehouseId: true, quantity: true },
            },
          },
        },
      },
    }),
    prisma.customer.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.$queryRaw<CreditProfileRow[]>`
      SELECT
        c."id",
        c."creditEnabled",
        c."creditLimit",
        c."creditDays",
        COALESCE(SUM(ar."balance") FILTER (WHERE ar."status" IN ('OPEN', 'PARTIAL')), 0) AS "outstanding"
      FROM "customers" c
      LEFT JOIN "accounts_receivable" ar
        ON ar."customerId" = c."id" AND ar."companyId" = c."companyId"
      WHERE c."companyId" = ${company.id}
      GROUP BY c."id", c."creditEnabled", c."creditLimit", c."creditDays"
    `,
    prisma.productUnit.groupBy({
      by: ["variantId", "warehouseId"],
      where: { companyId: company.id, status: "AVAILABLE" },
      _count: { _all: true },
    }),
  ]);

  const creditMap = new Map(creditProfiles.map((profile) => [profile.id, profile]));
  const serializedStockMap = new Map(
    serializedStock.map((row) => [`${row.variantId}:${row.warehouseId}`, row._count._all]),
  );

  const catalog: PosCatalogItem[] = products.flatMap((product) =>
    product.variants.map((variant) => {
      const serialized = product.type === "PHONE" || product.type === "SERIALIZED";
      const balances = serialized
        ? warehouses.map((warehouse) => ({
            warehouseId: warehouse.id,
            quantity: serializedStockMap.get(`${variant.id}:${warehouse.id}`) ?? 0,
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
      };
    }),
  );

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
  const [sales, todaySummary, todayReturns] = await Promise.all([
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
    prisma.sale.aggregate({
      where: {
        companyId: company.id,
        status: { in: ["COMPLETED", "REFUNDED"] },
        createdAt: { gte: start, lt: end },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.returnOrder.findMany({
      where: {
        companyId: company.id,
        status: "COMPLETED",
        createdAt: { gte: start, lt: end },
      },
      select: {
        items: { select: { amount: true } },
      },
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

  const todayGross = Number(todaySummary._sum.total ?? 0);
  const todayReturnsTotal = todayReturns.reduce(
    (sum, order) =>
      sum + order.items.reduce((itemSum, item) => itemSum + Number(item.amount), 0),
    0,
  );
  const todayTotal = Math.round(
    (todayGross - todayReturnsTotal + Number.EPSILON) * 100,
  ) / 100;
  const todayCount = todaySummary._count._all;
  return {
    items,
    summary: {
      todayTotal,
      todayGross,
      todayReturns: Math.round((todayReturnsTotal + Number.EPSILON) * 100) / 100,
      todayReturnCount: todayReturns.length,
      todayCount,
      averageTicket: todayCount ? todayGross / todayCount : 0,
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
      exchangeCreditUsages: {
        include: {
          exchangeCredit: {
            include: {
              returnOrder: {
                include: {
                  items: {
                    include: {
                      product: { select: { name: true } },
                      productUnit: {
                        include: { identifiers: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      returnOrders: {
        where: { status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        include: {
          exchangeCredit: {
            select: {
              id: true,
              originalAmount: true,
              balance: true,
              status: true,
              refundedAmount: true,
            },
          },
          items: {
            select: {
              quantity: true,
              amount: true,
              productUnitId: true,
            },
          },
        },
      },
      serviceOrders: {
        orderBy: { receivedAt: "desc" },
        select: {
          id: true,
          serviceNumber: true,
          serviceType: true,
          status: true,
          deviceName: true,
          identifier: true,
          warrantyCovered: true,
          reportedIssue: true,
          receivedAt: true,
          deliveredAt: true,
          finalCost: true,
        },
      },
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

  const cancellationAudit = sale.status === "CANCELLED"
    ? await prisma.auditLog.findFirst({
        where: {
          companyId: company.id,
          entity: "SALE",
          entityId: sale.id,
          action: "CANCEL",
        },
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true } },
        },
      })
    : null;
  const cancellationValues = cancellationAudit?.newValues
    && typeof cancellationAudit.newValues === "object"
    && !Array.isArray(cancellationAudit.newValues)
      ? cancellationAudit.newValues as Record<string, unknown>
      : null;

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
    cancellation: cancellationAudit
      ? {
          reason: typeof cancellationValues?.reason === "string"
            ? cancellationValues.reason
            : "Anulación registrada",
          userName: cancellationAudit.user?.name ?? "Usuario",
          createdAt: cancellationAudit.createdAt.toISOString(),
        }
      : null,
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
          warrantyDays: link.warrantyDays,
          warrantyStartsAt: link.warrantyStartsAt?.toISOString() ?? null,
          warrantyExpiresAt: link.warrantyExpiresAt?.toISOString() ?? null,
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
    exchangeOrigins: sale.exchangeCreditUsages.map((usage) => ({
      exchangeCreditId: usage.exchangeCreditId,
      returnNumber: usage.exchangeCredit.returnOrder.returnNumber,
      amount: Number(usage.amount),
      originalAmount: Number(usage.exchangeCredit.originalAmount),
      balance: Number(usage.exchangeCredit.balance),
      status: usage.exchangeCredit.status,
      refundedAmount: Number(usage.exchangeCredit.refundedAmount),
      returnedUnits: usage.exchangeCredit.returnOrder.items
        .filter((returnItem) => Boolean(returnItem.productUnit))
        .map((returnItem) => {
          const identifiers = returnItem.productUnit?.identifiers ?? [];
          return {
            id: returnItem.productUnitId,
            product: returnItem.product.name,
            identifier:
              identifiers.find((identifier) => identifier.type === "IMEI_1")?.value
              ?? identifiers.find((identifier) => identifier.type === "SERIAL")?.value
              ?? returnItem.productUnitId
              ?? "Sin identificador",
          };
        }),
    })),
    returns: sale.returnOrders.map((order) => ({
      id: order.id,
      returnNumber: order.returnNumber,
      type: order.type,
      reason: order.reason,
      refundMethod: order.refundMethod,
      refundAmount: Number(order.refundAmount),
      createdAt: order.createdAt.toISOString(),
      quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
      value: order.items.reduce((sum, item) => sum + Number(item.amount), 0),
      serializedCount: order.items.filter((item) => Boolean(item.productUnitId)).length,
      exchangeCredit: order.exchangeCredit
        ? {
            id: order.exchangeCredit.id,
            originalAmount: Number(order.exchangeCredit.originalAmount),
            balance: Number(order.exchangeCredit.balance),
            status: order.exchangeCredit.status,
            refundedAmount: Number(order.exchangeCredit.refundedAmount),
          }
        : null,
    })),
    serviceOrders: sale.serviceOrders.map((order) => ({
      id: order.id,
      serviceNumber: order.serviceNumber,
      serviceType: order.serviceType,
      status: order.status,
      deviceName: order.deviceName,
      identifier: order.identifier,
      warrantyCovered: order.warrantyCovered,
      reportedIssue: order.reportedIssue,
      receivedAt: order.receivedAt.toISOString(),
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      finalCost: Number(order.finalCost),
    })),
  };
}
