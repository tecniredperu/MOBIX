import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

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

export async function getSalesPage(filters: {
  q?: string;
  status?: string;
  documentType?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const company = await getActiveCompany();
  const q = filters.q?.trim();
  const pageSize = Math.min(100, Math.max(20, filters.pageSize ?? 50));
  const page = Math.max(1, filters.page ?? 1);
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
            { customer: { lastName: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const { start, end } = getLimaDayBounds();
  const [sales, total, todaySummary] = await Promise.all([
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
        payments: { select: { paymentMethod: true } },
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
  const todayTotal = Number(todaySummary._sum.total ?? 0);
  const todayCount = todaySummary._count._all;

  return {
    items,
    summary: {
      todayTotal,
      todayCount,
      averageTicket: todayCount ? todayTotal / todayCount : 0,
      listed: total,
    },
    pagination: { page, pageSize, total },
  };
}
