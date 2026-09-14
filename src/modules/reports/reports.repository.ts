import { requirePermission } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";

function startOfDay(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(`${value}T00:00:00-05:00`);
  return Number.isNaN(date.getTime()) ? fallback : date;
}
function endOfDay(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(`${value}T23:59:59.999-05:00`);
  return Number.isNaN(date.getTime()) ? fallback : date;
}
function isoDate(date: Date) { return date.toISOString().slice(0, 10); }

type SummaryRow = { grossSalesTotal: unknown; grossCostTotal: unknown; discountTotal: unknown; transactions: bigint };
type DailyRow = { date: Date; sales: unknown; cost: unknown; count: bigint };
type ProductRow = { product: string; brand: string; quantity: bigint; sales: unknown; cost: unknown };
type SellerRow = { seller: string; sales: unknown; cost: unknown; count: bigint };
type BranchRow = { branch: string; sales: unknown; cost: unknown; count: bigint };
type PaymentRow = { method: string; amount: unknown };
type ReceivableSummaryRow = { total: unknown; overdue: unknown };
type ReturnSummaryRow = { total: unknown; count: bigint; cost: unknown };
type InventoryValueRow = { value: unknown };

export async function getReports(filters: { from?: string; to?: string }) {
  const { company, membership, permissions } = await requirePermission("reports.view");
  const canSeeCosts = membership.role.isSystem || permissions.has("costs.view");
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 29);
  defaultFrom.setHours(0, 0, 0, 0);
  const from = startOfDay(filters.from, defaultFrom);
  const to = endOfDay(filters.to, now);
  if (from > to) throw new Error("El rango de fechas del reporte no es válido.");

  const [summaryRows, dailyRows, productRows, sellerRows, branchRows, paymentRows, receivableRows, cashClosures, returnRows] = await Promise.all([
    prisma.$queryRaw<SummaryRow[]>`
      SELECT
        COALESCE(SUM(s."total"), 0) AS "grossSalesTotal",
        COALESCE(SUM(s."discount"), 0) AS "discountTotal",
        COUNT(*) AS "transactions",
        COALESCE(SUM(sc.cost), 0) AS "grossCostTotal"
      FROM "sales" s
      LEFT JOIN (
        SELECT si."saleId", SUM(si."unitCost" * si."quantity") AS cost
        FROM "sale_items" si
        GROUP BY si."saleId"
      ) sc ON sc."saleId" = s."id"
      WHERE s."companyId" = ${company.id}
        AND s."status" = 'COMPLETED'
        AND s."createdAt" BETWEEN ${from} AND ${to}
    `,
    prisma.$queryRaw<DailyRow[]>`
      SELECT
        DATE(s."createdAt" AT TIME ZONE 'America/Lima') AS "date",
        SUM(s."total") AS "sales",
        COALESCE(SUM(sc.cost), 0) AS "cost",
        COUNT(*) AS "count"
      FROM "sales" s
      LEFT JOIN (
        SELECT si."saleId", SUM(si."unitCost" * si."quantity") AS cost
        FROM "sale_items" si
        GROUP BY si."saleId"
      ) sc ON sc."saleId" = s."id"
      WHERE s."companyId" = ${company.id}
        AND s."status" = 'COMPLETED'
        AND s."createdAt" BETWEEN ${from} AND ${to}
      GROUP BY DATE(s."createdAt" AT TIME ZONE 'America/Lima')
      ORDER BY "date" ASC
    `,
    prisma.$queryRaw<ProductRow[]>`
      SELECT
        p."name" AS "product",
        COALESCE(b."name", 'Sin marca') AS "brand",
        SUM(si."quantity")::bigint AS "quantity",
        SUM(si."total") AS "sales",
        SUM(si."unitCost" * si."quantity") AS "cost"
      FROM "sale_items" si
      INNER JOIN "sales" s ON s."id" = si."saleId"
      INNER JOIN "products" p ON p."id" = si."productId"
      LEFT JOIN "brands" b ON b."id" = p."brandId"
      WHERE s."companyId" = ${company.id}
        AND s."status" = 'COMPLETED'
        AND s."createdAt" BETWEEN ${from} AND ${to}
      GROUP BY p."id", p."name", b."name"
      ORDER BY SUM(si."total") DESC
      LIMIT 12
    `,
    prisma.$queryRaw<SellerRow[]>`
      SELECT
        u."name" AS "seller",
        SUM(s."total") AS "sales",
        COALESCE(SUM(sc.cost), 0) AS "cost",
        COUNT(*) AS "count"
      FROM "sales" s
      INNER JOIN "users" u ON u."id" = s."sellerId"
      LEFT JOIN (
        SELECT si."saleId", SUM(si."unitCost" * si."quantity") AS cost
        FROM "sale_items" si GROUP BY si."saleId"
      ) sc ON sc."saleId" = s."id"
      WHERE s."companyId" = ${company.id}
        AND s."status" = 'COMPLETED'
        AND s."createdAt" BETWEEN ${from} AND ${to}
      GROUP BY u."id", u."name"
      ORDER BY SUM(s."total") DESC
    `,
    prisma.$queryRaw<BranchRow[]>`
      SELECT
        br."name" AS "branch",
        SUM(s."total") AS "sales",
        COALESCE(SUM(sc.cost), 0) AS "cost",
        COUNT(*) AS "count"
      FROM "sales" s
      INNER JOIN "branches" br ON br."id" = s."branchId"
      LEFT JOIN (
        SELECT si."saleId", SUM(si."unitCost" * si."quantity") AS cost
        FROM "sale_items" si GROUP BY si."saleId"
      ) sc ON sc."saleId" = s."id"
      WHERE s."companyId" = ${company.id}
        AND s."status" = 'COMPLETED'
        AND s."createdAt" BETWEEN ${from} AND ${to}
      GROUP BY br."id", br."name"
      ORDER BY SUM(s."total") DESC
    `,
    prisma.$queryRaw<PaymentRow[]>`
      SELECT sp."paymentMethod"::text AS "method", SUM(sp."amount") AS "amount"
      FROM "sale_payments" sp
      INNER JOIN "sales" s ON s."id" = sp."saleId"
      WHERE s."companyId" = ${company.id}
        AND s."status" = 'COMPLETED'
        AND s."createdAt" BETWEEN ${from} AND ${to}
      GROUP BY sp."paymentMethod"
      ORDER BY SUM(sp."amount") DESC
    `,
    prisma.$queryRaw<ReceivableSummaryRow[]>`
      SELECT
        COALESCE(SUM("balance"), 0) AS "total",
        COALESCE(SUM("balance") FILTER (WHERE "dueDate" < NOW()), 0) AS "overdue"
      FROM "accounts_receivable"
      WHERE "companyId" = ${company.id} AND "status" IN ('OPEN', 'PARTIAL')
    `,
    prisma.cashSession.findMany({
      where: { companyId: company.id, status: "CLOSED", closedAt: { gte: from, lte: to } },
      select: { difference: true },
    }),
    prisma.$queryRaw<ReturnSummaryRow[]>`
      SELECT
        COALESCE(SUM(ro."refundAmount"), 0) AS "total",
        COUNT(DISTINCT ro."id") AS "count",
        COALESCE(SUM(ri."unitCost" * ri."quantity"), 0) AS "cost"
      FROM "return_orders" ro
      LEFT JOIN "return_items" ri ON ri."returnOrderId" = ro."id"
      WHERE ro."companyId" = ${company.id}
        AND ro."status" = 'COMPLETED'
        AND ro."createdAt" BETWEEN ${from} AND ${to}
    `,
  ]);

  let purchasesTotal: number | null = null;
  let inventoryValue: number | null = null;
  if (canSeeCosts) {
    const [purchases, inventoryRows] = await Promise.all([
      prisma.purchase.aggregate({
        where: { companyId: company.id, status: "RECEIVED", issueDate: { gte: from, lte: to } },
        _sum: { total: true },
      }),
      prisma.$queryRaw<InventoryValueRow[]>`
        SELECT
          COALESCE((
            SELECT SUM(ib."quantity" * ib."averageCost")
            FROM "inventory_balances" ib
            WHERE ib."companyId" = ${company.id}
          ), 0) + COALESCE((
            SELECT SUM(pu."purchaseCost")
            FROM "product_units" pu
            WHERE pu."companyId" = ${company.id} AND pu."status" = 'AVAILABLE'
          ), 0) AS "value"
      `,
    ]);
    purchasesTotal = Number(purchases._sum.total ?? 0);
    inventoryValue = Number(inventoryRows[0]?.value ?? 0);
  }

  const summary = summaryRows[0];
  const grossSalesTotal = Number(summary?.grossSalesTotal ?? 0);
  const grossCostTotal = Number(summary?.grossCostTotal ?? 0);
  const discountTotal = Number(summary?.discountTotal ?? 0);
  const transactions = Number(summary?.transactions ?? 0);
  const receivableTotal = Number(receivableRows[0]?.total ?? 0);
  const overdueTotal = Number(receivableRows[0]?.overdue ?? 0);
  const cashDifference = cashClosures.reduce((sum, item) => sum + Number(item.difference ?? 0), 0);
  const returnsTotal = Number(returnRows[0]?.total ?? 0);
  const returnedCost = canSeeCosts ? Number(returnRows[0]?.cost ?? 0) : null;
  const salesTotal = Math.max(0, grossSalesTotal - returnsTotal);
  const costTotal = canSeeCosts ? Math.max(0, grossCostTotal - Number(returnedCost ?? 0)) : null;
  const grossProfit = canSeeCosts ? salesTotal - Number(costTotal ?? 0) : null;

  return {
    canSeeCosts,
    range: { from: isoDate(from), to: isoDate(to) },
    summary: {
      grossSalesTotal,
      salesTotal,
      grossCostTotal: canSeeCosts ? grossCostTotal : null,
      returnedCost,
      costTotal,
      grossProfit,
      margin: canSeeCosts && salesTotal ? (Number(grossProfit) / salesTotal) * 100 : null,
      transactions,
      averageTicket: transactions ? grossSalesTotal / transactions : 0,
      purchasesTotal,
      inventoryValue,
      receivableTotal,
      overdueTotal,
      discountTotal,
      cashDifference,
      returnsTotal,
      returnsCount: Number(returnRows[0]?.count ?? 0),
    },
    daily: dailyRows.map((row) => {
      const sales = Number(row.sales ?? 0);
      const cost = Number(row.cost ?? 0);
      return {
        date: isoDate(new Date(row.date)),
        sales,
        cost: canSeeCosts ? cost : null,
        profit: canSeeCosts ? sales - cost : null,
        count: Number(row.count),
      };
    }),
    topProducts: productRows.map((row) => {
      const sales = Number(row.sales ?? 0);
      const cost = Number(row.cost ?? 0);
      return {
        product: row.product,
        brand: row.brand,
        quantity: Number(row.quantity),
        sales,
        cost: canSeeCosts ? cost : null,
        profit: canSeeCosts ? sales - cost : null,
      };
    }),
    sellers: sellerRows.map((row) => {
      const sales = Number(row.sales ?? 0);
      const cost = Number(row.cost ?? 0);
      return { seller: row.seller, sales, profit: canSeeCosts ? sales - cost : null, count: Number(row.count) };
    }),
    branches: branchRows.map((row) => {
      const sales = Number(row.sales ?? 0);
      const cost = Number(row.cost ?? 0);
      return { branch: row.branch, sales, profit: canSeeCosts ? sales - cost : null, count: Number(row.count) };
    }),
    payments: paymentRows.map((row) => ({ method: row.method, amount: Number(row.amount ?? 0) })),
  };
}
