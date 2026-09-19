import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";
import { AccountReceivableStatus, type Prisma } from "../../../generated/prisma/client";

type CustomerCreditRow = {
  id: string;
  creditEnabled: boolean;
  creditLimit: unknown;
  creditDays: number;
  creditNotes: string | null;
  outstanding: unknown;
  overdue: unknown;
};

type ReceivableRow = {
  id: string;
  saleId: string;
  saleNumber: string;
  documentSeries: string | null;
  documentNumber: string | null;
  status: string;
  originalAmount: unknown;
  paidAmount: unknown;
  balance: unknown;
  dueDate: Date;
  createdAt: Date;
};

type ReceivablePaymentRow = {
  id: string;
  receivableId: string;
  amount: unknown;
  paymentMethod: string;
  reference: string | null;
  notes: string | null;
  paidAt: Date;
  createdBy: string;
};

function displayName(customer: {
  businessName: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  if (customer.businessName?.trim()) return customer.businessName;
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || "Cliente";
}

export async function getCustomers(filters: { q?: string; credit?: string; page?: number; pageSize?: number } = {}) {
  const company = await getActiveCompany();
  const q = filters.q?.trim();
  const pageSize = Math.min(100, Math.max(20, filters.pageSize ?? 50));
  const page = Math.max(1, filters.page ?? 1);
  const now = new Date();
  const openStatuses = [AccountReceivableStatus.OPEN, AccountReceivableStatus.PARTIAL];

  const creditWhere: Prisma.CustomerWhereInput = filters.credit === "enabled"
    ? { creditEnabled: true }
    : filters.credit === "debt"
      ? { receivables: { some: { companyId: company.id, status: { in: openStatuses }, balance: { gt: 0 } } } }
      : filters.credit === "overdue"
        ? { receivables: { some: { companyId: company.id, status: { in: openStatuses }, balance: { gt: 0 }, dueDate: { lt: now } } } }
        : {};

  const where: Prisma.CustomerWhereInput = {
    companyId: company.id,
    ...creditWhere,
    ...(q
      ? {
          OR: [
            { documentNumber: { contains: q, mode: "insensitive" as const } },
            { businessName: { contains: q, mode: "insensitive" as const } },
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q, mode: "insensitive" as const } },
            { whatsapp: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [customers, total, globalTotal, globalCreditEnabled, outstandingSummary, overdueSummary] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { sales: true } } },
    }),
    prisma.customer.count({ where }),
    prisma.customer.count({ where: { companyId: company.id, status: "ACTIVE" } }),
    prisma.customer.count({ where: { companyId: company.id, status: "ACTIVE", creditEnabled: true } }),
    prisma.accountReceivable.aggregate({
      where: { companyId: company.id, status: { in: openStatuses }, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
    prisma.accountReceivable.aggregate({
      where: { companyId: company.id, status: { in: openStatuses }, balance: { gt: 0 }, dueDate: { lt: now } },
      _sum: { balance: true },
    }),
  ]);

  const customerIds = customers.map((customer) => customer.id);
  const [outstandingRows, overdueRows, salesCountRows] = customerIds.length
    ? await Promise.all([
        prisma.accountReceivable.groupBy({
          by: ["customerId"],
          where: { companyId: company.id, customerId: { in: customerIds }, status: { in: openStatuses }, balance: { gt: 0 } },
          _sum: { balance: true },
        }),
        prisma.accountReceivable.groupBy({
          by: ["customerId"],
          where: { companyId: company.id, customerId: { in: customerIds }, status: { in: openStatuses }, balance: { gt: 0 }, dueDate: { lt: now } },
          _sum: { balance: true },
        }),
        prisma.sale.groupBy({
          by: ["customerId"],
          where: {
            companyId: company.id,
            customerId: { in: customerIds },
            status: { in: ["COMPLETED", "REFUNDED"] },
          },
          _count: { _all: true },
        }),
      ])
    : [[], [], []];

  const outstandingMap = new Map(outstandingRows.map((row) => [row.customerId, Number(row._sum.balance ?? 0)]));
  const overdueMap = new Map(overdueRows.map((row) => [row.customerId, Number(row._sum.balance ?? 0)]));
  const salesCountMap = new Map(
    salesCountRows
      .filter((row) => Boolean(row.customerId))
      .map((row) => [row.customerId as string, row._count._all]),
  );

  return {
    items: customers.map((customer) => {
      const creditLimit = Number(customer.creditLimit ?? 0);
      const outstanding = outstandingMap.get(customer.id) ?? 0;
      const overdue = overdueMap.get(customer.id) ?? 0;
      return {
        id: customer.id,
        name: displayName(customer),
        documentType: customer.documentType,
        documentNumber: customer.documentNumber,
        phone: customer.whatsapp ?? customer.phone,
        email: customer.email,
        status: customer.status,
        salesCount: salesCountMap.get(customer.id) ?? 0,
        creditEnabled: customer.creditEnabled,
        creditLimit,
        creditDays: customer.creditDays,
        outstanding,
        overdue,
        availableCredit: Math.max(0, creditLimit - outstanding),
        updatedAt: customer.updatedAt.toISOString(),
      };
    }),
    summary: {
      total: globalTotal,
      creditEnabled: globalCreditEnabled,
      outstanding: Number(outstandingSummary._sum.balance ?? 0),
      overdue: Number(overdueSummary._sum.balance ?? 0),
    },
    pagination: { page, pageSize, total },
  };
}

export async function getCustomerDetail(id: string) {
  const company = await getActiveCompany();
  const customer = await prisma.customer.findFirst({
    where: { id, companyId: company.id },
    include: {
      sales: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          payments: true,
          items: { select: { quantity: true } },
        },
      },
    },
  });
  if (!customer) return null;

  const [profiles, receivables, payments, exchangeCredits, salesSummary, customerReturns] = await Promise.all([
    prisma.$queryRaw<CustomerCreditRow[]>`
      SELECT
        c."id",
        c."creditEnabled",
        c."creditLimit",
        c."creditDays",
        c."creditNotes",
        COALESCE(SUM(ar."balance") FILTER (WHERE ar."status" IN ('OPEN', 'PARTIAL')), 0) AS "outstanding",
        COALESCE(SUM(ar."balance") FILTER (WHERE ar."status" IN ('OPEN', 'PARTIAL') AND ar."dueDate" < NOW()), 0) AS "overdue"
      FROM "customers" c
      LEFT JOIN "accounts_receivable" ar
        ON ar."customerId" = c."id" AND ar."companyId" = c."companyId"
      WHERE c."id" = ${customer.id} AND c."companyId" = ${company.id}
      GROUP BY c."id", c."creditEnabled", c."creditLimit", c."creditDays", c."creditNotes"
    `,
    prisma.$queryRaw<ReceivableRow[]>`
      SELECT
        ar."id",
        ar."saleId",
        s."saleNumber",
        s."documentSeries",
        s."documentNumber",
        ar."status"::text AS "status",
        ar."originalAmount",
        ar."paidAmount",
        ar."balance",
        ar."dueDate",
        ar."createdAt"
      FROM "accounts_receivable" ar
      INNER JOIN "sales" s ON s."id" = ar."saleId"
      WHERE ar."companyId" = ${company.id} AND ar."customerId" = ${customer.id}
      ORDER BY ar."createdAt" DESC
    `,
    prisma.$queryRaw<ReceivablePaymentRow[]>`
      SELECT
        rp."id",
        rp."receivableId",
        rp."amount",
        rp."paymentMethod"::text AS "paymentMethod",
        rp."reference",
        rp."notes",
        rp."paidAt",
        u."name" AS "createdBy"
      FROM "receivable_payments" rp
      INNER JOIN "accounts_receivable" ar ON ar."id" = rp."receivableId"
      INNER JOIN "users" u ON u."id" = rp."createdById"
      WHERE rp."companyId" = ${company.id} AND ar."customerId" = ${customer.id}
      ORDER BY rp."paidAt" DESC
      LIMIT 100
    `,
    prisma.exchangeCredit.findMany({
      where: {
        companyId: company.id,
        customerId: customer.id,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        returnOrder: {
          select: {
            id: true,
            returnNumber: true,
            reason: true,
            createdAt: true,
          },
        },
        usages: {
          orderBy: { createdAt: "asc" },
          include: {
            sale: {
              select: {
                id: true,
                saleNumber: true,
                createdAt: true,
              },
            },
          },
        },
      },
    }),
    prisma.sale.aggregate({
      where: {
        companyId: company.id,
        customerId: customer.id,
        status: { in: ["COMPLETED", "REFUNDED"] },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.returnOrder.findMany({
      where: {
        companyId: company.id,
        status: "COMPLETED",
        sale: { customerId: customer.id },
      },
      select: {
        items: { select: { amount: true } },
      },
    }),
  ]);

  const profile = profiles[0];
  const creditLimit = Number(profile?.creditLimit ?? 0);
  const outstanding = Number(profile?.outstanding ?? 0);
  const overdue = Number(profile?.overdue ?? 0);
  const grossPurchaseTotal = Number(salesSummary._sum.total ?? 0);
  const returnedPurchaseTotal = customerReturns.reduce(
    (sum, order) =>
      sum + order.items.reduce((itemSum, item) => itemSum + Number(item.amount), 0),
    0,
  );
  const purchaseTotal = Math.round(
    (grossPurchaseTotal - returnedPurchaseTotal + Number.EPSILON) * 100,
  ) / 100;
  const exchangeCreditBalance = exchangeCredits
    .filter((credit) => credit.status === "OPEN" || credit.status === "PARTIAL")
    .reduce((sum, credit) => sum + Number(credit.balance), 0);

  return {
    id: customer.id,
    name: displayName(customer),
    documentType: customer.documentType,
    documentNumber: customer.documentNumber,
    firstName: customer.firstName,
    lastName: customer.lastName,
    businessName: customer.businessName,
    phone: customer.phone,
    whatsapp: customer.whatsapp,
    email: customer.email,
    address: customer.address,
    status: customer.status,
    createdAt: customer.createdAt.toISOString(),
    credit: {
      enabled: Boolean(profile?.creditEnabled),
      limit: creditLimit,
      days: Number(profile?.creditDays ?? 30),
      notes: profile?.creditNotes ?? null,
      outstanding,
      overdue,
      available: Math.max(0, creditLimit - outstanding),
    },
    summary: {
      salesCount: salesSummary._count._all,
      purchaseTotal,
      grossPurchaseTotal,
      returnedPurchaseTotal,
      outstanding,
      overdue,
      exchangeCreditBalance,
    },
    sales: customer.sales.map((sale) => ({
      id: sale.id,
      saleNumber: sale.saleNumber,
      document: [sale.documentSeries, sale.documentNumber].filter(Boolean).join("-") || "—",
      total: Number(sale.total),
      status: sale.status,
      itemCount: sale.items.reduce((sum, item) => sum + item.quantity, 0),
      payments: sale.payments.map((payment) => payment.paymentMethod),
      createdAt: sale.createdAt.toISOString(),
    })),
    receivables: receivables.map((row) => ({
      id: row.id,
      saleId: row.saleId,
      saleNumber: row.saleNumber,
      document: [row.documentSeries, row.documentNumber].filter(Boolean).join("-") || "—",
      status: row.status,
      originalAmount: Number(row.originalAmount),
      paidAmount: Number(row.paidAmount),
      balance: Number(row.balance),
      dueDate: row.dueDate.toISOString(),
      createdAt: row.createdAt.toISOString(),
      overdue: Number(row.balance) > 0.009 && row.dueDate.getTime() < Date.now(),
    })),
    payments: payments.map((row) => ({
      id: row.id,
      receivableId: row.receivableId,
      amount: Number(row.amount),
      method: row.paymentMethod,
      reference: row.reference,
      notes: row.notes,
      createdBy: row.createdBy,
      paidAt: row.paidAt.toISOString(),
    })),
    exchangeCredits: exchangeCredits.map((credit) => ({
      id: credit.id,
      returnOrderId: credit.returnOrderId,
      returnNumber: credit.returnOrder.returnNumber,
      reason: credit.returnOrder.reason,
      originalAmount: Number(credit.originalAmount),
      balance: Number(credit.balance),
      status: credit.status,
      refundedAmount: Number(credit.refundedAmount),
      refundMethod: credit.refundMethod,
      refundReference: credit.refundReference,
      refundedAt: credit.refundedAt?.toISOString() ?? null,
      createdAt: credit.createdAt.toISOString(),
      usages: credit.usages.map((usage) => ({
        id: usage.id,
        saleId: usage.saleId,
        saleNumber: usage.sale.saleNumber,
        amount: Number(usage.amount),
        createdAt: usage.createdAt.toISOString(),
      })),
    })),
  };
}
