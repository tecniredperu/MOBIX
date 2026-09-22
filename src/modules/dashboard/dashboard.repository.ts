import { requirePermission } from "@/lib/business-context";
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

type LowStockRow = { count: bigint };
type DashboardReturnRow = { createdAt: Date; amount: unknown };

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
  const { company, user } = await requirePermission("dashboard.view");
  const todayStart = limaTodayStart();
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
  const sevenDayStart = new Date(todayStart.getTime() - 6 * 86_400_000);

  const [availableUnits, activeProducts, lowStockRows, weekSales, weekReturns, recentSales, openCash] = await Promise.all([
    prisma.productUnit.count({
      where: { companyId: company.id, status: "AVAILABLE", product: { status: "ACTIVE" } },
    }),
    prisma.product.count({
      where: { companyId: company.id, status: "ACTIVE", deletedAt: null },
    }),
    prisma.$queryRaw<LowStockRow[]>`
      WITH active_products AS (
        SELECT p."id", p."type", p."minimumStock"
        FROM "products" p
        WHERE p."companyId" = ${company.id}
          AND p."status" = 'ACTIVE'
          AND p."deletedAt" IS NULL
          AND p."controlsStock" = TRUE
          AND p."type" <> 'SERVICE'
      ),
      serialized_stock AS (
        SELECT pu."productId", COUNT(*)::numeric AS "stock"
        FROM "product_units" pu
        INNER JOIN "product_variants" pv
          ON pv."id" = pu."variantId" AND pv."status" = 'ACTIVE'
        WHERE pu."companyId" = ${company.id}
          AND pu."status" = 'AVAILABLE'
        GROUP BY pu."productId"
      ),
      regular_stock AS (
        SELECT ib."productId", COALESCE(SUM(ib."quantity"), 0) AS "stock"
        FROM "inventory_balances" ib
        INNER JOIN "product_variants" pv
          ON pv."id" = ib."variantId" AND pv."status" = 'ACTIVE'
        WHERE ib."companyId" = ${company.id}
        GROUP BY ib."productId"
      )
      SELECT COUNT(*)::bigint AS "count"
      FROM active_products p
      LEFT JOIN serialized_stock ss ON ss."productId" = p."id"
      LEFT JOIN regular_stock rs ON rs."productId" = p."id"
      WHERE (
        CASE
          WHEN p."type" IN ('PHONE', 'SERIALIZED') THEN COALESCE(ss."stock", 0)
          ELSE COALESCE(rs."stock", 0)
        END
      ) <= p."minimumStock"
    `,
    prisma.sale.findMany({
      where: {
        companyId: company.id,
        status: { in: ["COMPLETED", "REFUNDED"] },
        createdAt: { gte: sevenDayStart, lt: tomorrowStart },
      },
      select: { total: true, createdAt: true },
    }),
    prisma.$queryRaw<DashboardReturnRow[]>`
      SELECT ro."createdAt", COALESCE(SUM(ri."amount"), 0) AS "amount"
      FROM "return_orders" ro
      LEFT JOIN "return_items" ri ON ri."returnOrderId" = ro."id"
      WHERE ro."companyId" = ${company.id}
        AND ro."status" = 'COMPLETED'
        AND ro."createdAt" >= ${sevenDayStart}
        AND ro."createdAt" < ${tomorrowStart}
      GROUP BY ro."id", ro."createdAt"
    `,
    prisma.sale.findMany({
      where: { companyId: company.id, status: { in: ["COMPLETED", "REFUNDED"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        saleNumber: true,
        total: true,
        status: true,
        createdAt: true,
        customer: { select: { businessName: true, firstName: true, lastName: true } },
        payments: { select: { paymentMethod: true } },
      },
    }),
    prisma.cashSession.findFirst({
      where: { companyId: company.id, userId: user.id, status: "OPEN" },
      orderBy: { openedAt: "desc" },
      select: { openedAt: true, branch: { select: { name: true } } },
    }),
  ]);

  const todaySales = weekSales.filter(
    (sale) => sale.createdAt >= todayStart && sale.createdAt < tomorrowStart,
  );
  const todayGross = todaySales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const todayReturnOrders = weekReturns.filter(
    (order) => order.createdAt >= todayStart && order.createdAt < tomorrowStart,
  );
  const todayReturns = todayReturnOrders.reduce(
    (sum, order) => sum + Number(order.amount),
    0,
  );
  const todayTotal = Math.round((todayGross - todayReturns + Number.EPSILON) * 100) / 100;

  const lowStock = Number(lowStockRows[0]?.count ?? 0);

  const chart = Array.from({ length: 7 }, (_, index) => {
    const start = new Date(sevenDayStart.getTime() + index * 86_400_000);
    return {
      key: limaDateKey(start),
      label: dayLabel(start),
      total: 0,
      gross: 0,
      returns: 0,
      count: 0,
      returnCount: 0,
    };
  });
  const chartMap = new Map(chart.map((item) => [item.key, item]));
  for (const sale of weekSales) {
    const item = chartMap.get(limaDateKey(sale.createdAt));
    if (item) {
      item.gross += Number(sale.total);
      item.total += Number(sale.total);
      item.count += 1;
    }
  }
  for (const order of weekReturns) {
    const item = chartMap.get(limaDateKey(order.createdAt));
    if (!item) continue;
    const returned = Number(order.amount);
    item.returns += returned;
    item.total -= returned;
    item.returnCount += 1;
  }

  for (const item of chart) {
    item.gross = Math.round((item.gross + Number.EPSILON) * 100) / 100;
    item.returns = Math.round((item.returns + Number.EPSILON) * 100) / 100;
    item.total = Math.round((item.total + Number.EPSILON) * 100) / 100;
  }

  return {
    summary: {
      todayTotal,
      todayGross,
      todayReturns,
      todayReturnCount: todayReturnOrders.length,
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
      status: sale.status,
      paymentMethods: [...new Set(sale.payments.map((payment) => payment.paymentMethod))],
      createdAt: sale.createdAt.toISOString(),
    })),
    cashStatus: openCash
      ? { open: true as const, branchName: openCash.branch.name, openedAt: openCash.openedAt.toISOString() }
      : { open: false as const, branchName: null, openedAt: null },
  };
}
