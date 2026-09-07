import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

function limaTodayStart() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 5, 0, 0));
}

function limaDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function dayLabel(value: Date) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    weekday: "short",
  }).format(value).replace(".", "");
}

function customerName(customer: {
  businessName: string | null;
  firstName: string | null;
  lastName: string | null;
} | null) {
  if (!customer) return "Consumidor final";
  if (customer.businessName?.trim()) return customer.businessName;
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || "Cliente";
}

export async function getDashboardData() {
  const company = await getActiveCompany();
  const todayStart = limaTodayStart();
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
  const sevenDayStart = new Date(todayStart.getTime() - 6 * 86_400_000);

  const membership = await prisma.companyUser.findFirst({
    where: { companyId: company.id, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });

  const [todaySales, availableUnits, activeProducts, stockProducts, weekSales, recentSales, openCash] = await Promise.all([
    prisma.sale.findMany({
      where: {
        companyId: company.id,
        status: "COMPLETED",
        createdAt: { gte: todayStart, lt: tomorrowStart },
      },
      select: { total: true },
    }),
    prisma.productUnit.count({
      where: { companyId: company.id, status: "AVAILABLE", product: { status: "ACTIVE" } },
    }),
    prisma.product.count({
      where: { companyId: company.id, status: "ACTIVE", deletedAt: null },
    }),
    prisma.product.findMany({
      where: {
        companyId: company.id,
        status: "ACTIVE",
        deletedAt: null,
        controlsStock: true,
        type: { not: "SERVICE" },
      },
      select: {
        id: true,
        type: true,
        minimumStock: true,
        variants: {
          where: { status: "ACTIVE" },
          select: {
            units: { where: { status: "AVAILABLE" }, select: { id: true } },
            inventoryBalances: { select: { quantity: true } },
          },
        },
      },
    }),
    prisma.sale.findMany({
      where: { companyId: company.id, status: "COMPLETED", createdAt: { gte: sevenDayStart, lt: tomorrowStart } },
      select: { total: true, createdAt: true },
    }),
    prisma.sale.findMany({
      where: { companyId: company.id, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        customer: { select: { businessName: true, firstName: true, lastName: true } },
        payments: { select: { paymentMethod: true } },
      },
    }),
    membership
      ? prisma.cashSession.findFirst({
          where: { companyId: company.id, userId: membership.userId, status: "OPEN" },
          orderBy: { openedAt: "desc" },
          include: { branch: { select: { name: true } } },
        })
      : Promise.resolve(null),
  ]);

  const todayTotal = todaySales.reduce((sum, sale) => sum + Number(sale.total), 0);

  let lowStock = 0;
  for (const product of stockProducts) {
    const stock = product.variants.reduce((total, variant) => {
      if (product.type === "PHONE" || product.type === "SERIALIZED") {
        return total + variant.units.length;
      }
      return total + variant.inventoryBalances.reduce((sum, balance) => sum + Number(balance.quantity), 0);
    }, 0);
    if (stock <= product.minimumStock) lowStock += 1;
  }

  const chart = Array.from({ length: 7 }, (_, index) => {
    const start = new Date(sevenDayStart.getTime() + index * 86_400_000);
    return {
      key: limaDateKey(start),
      label: dayLabel(start),
      total: 0,
      count: 0,
    };
  });
  const chartMap = new Map(chart.map((item) => [item.key, item]));
  for (const sale of weekSales) {
    const item = chartMap.get(limaDateKey(sale.createdAt));
    if (item) {
      item.total += Number(sale.total);
      item.count += 1;
    }
  }

  return {
    summary: {
      todayTotal,
      todayCount: todaySales.length,
      availableUnits,
      activeProducts,
      lowStock,
    },
    chart,
    recentSales: recentSales.map((sale) => ({
      id: sale.id,
      saleNumber: sale.saleNumber,
      customer: customerName(sale.customer),
      total: Number(sale.total),
      paymentMethods: [...new Set(sale.payments.map((payment) => payment.paymentMethod))],
      createdAt: sale.createdAt.toISOString(),
    })),
    cashStatus: openCash
      ? { open: true as const, branchName: openCash.branch.name, openedAt: openCash.openedAt.toISOString() }
      : { open: false as const, branchName: null, openedAt: null },
  };
}
