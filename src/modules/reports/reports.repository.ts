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

type AmountSummaryRow = { total: unknown };
type ReceivableSummaryRow = { total: unknown; overdue: unknown };
type ReturnSummaryRow = {
  merchandiseTotal: unknown;
  cashRefundTotal: unknown;
  count: bigint;
  cost: unknown;
};

type SaleCostRow = {
  saleId: string;
  cost: unknown;
};

type ProductSummaryRow = {
  productId: string;
  product: string;
  brand: string;
  quantity: bigint;
  sales: unknown;
  cost: unknown;
};

type PaymentSummaryRow = {
  method: string;
  amount: unknown;
};

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

  const warnings: string[] = [];
  async function safe<T>(label: string, fallback: T, task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (error) {
      console.error(`[MOBIX reportes] ${label}`, error);
      warnings.push(label);
      return fallback;
    }
  }

  const [sales, saleCostRows, productRows, paymentRows] = await Promise.all([
    safe("Ventas del periodo", [], () => prisma.sale.findMany({
      where: {
        companyId: company.id,
        status: { in: ["COMPLETED", "REFUNDED"] },
        createdAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        total: true,
        discount: true,
        createdAt: true,
        sellerId: true,
        branchId: true,
        seller: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    })),
    canSeeCosts
      ? safe<SaleCostRow[]>("Costos de ventas", [], () => prisma.$queryRaw<SaleCostRow[]>`
          SELECT
            si."saleId",
            COALESCE(SUM(si."unitCost" * si."quantity"), 0) AS "cost"
          FROM "sale_items" si
          INNER JOIN "sales" s ON s."id" = si."saleId"
          WHERE s."companyId" = ${company.id}
            AND s."status" IN ('COMPLETED', 'REFUNDED')
            AND s."createdAt" BETWEEN ${from} AND ${to}
          GROUP BY si."saleId"
        `)
      : Promise.resolve([] as SaleCostRow[]),
    safe<ProductSummaryRow[]>("Productos vendidos", [], () => prisma.$queryRaw<ProductSummaryRow[]>`
      SELECT
        si."productId",
        p."name" AS "product",
        COALESCE(b."name", 'Sin marca') AS "brand",
        COALESCE(SUM(si."quantity"), 0)::bigint AS "quantity",
        COALESCE(SUM(si."total"), 0) AS "sales",
        COALESCE(SUM(si."unitCost" * si."quantity"), 0) AS "cost"
      FROM "sale_items" si
      INNER JOIN "sales" s ON s."id" = si."saleId"
      INNER JOIN "products" p ON p."id" = si."productId"
      LEFT JOIN "brands" b ON b."id" = p."brandId"
      WHERE s."companyId" = ${company.id}
        AND s."status" IN ('COMPLETED', 'REFUNDED')
        AND s."createdAt" BETWEEN ${from} AND ${to}
      GROUP BY si."productId", p."name", b."name"
    `),
    safe<PaymentSummaryRow[]>("Medios de pago", [], () => prisma.$queryRaw<PaymentSummaryRow[]>`
      SELECT
        sp."paymentMethod"::text AS "method",
        COALESCE(SUM(sp."amount"), 0) AS "amount"
      FROM "sale_payments" sp
      INNER JOIN "sales" s ON s."id" = sp."saleId"
      WHERE s."companyId" = ${company.id}
        AND s."status" IN ('COMPLETED', 'REFUNDED')
        AND s."createdAt" BETWEEN ${from} AND ${to}
      GROUP BY sp."paymentMethod"
    `),
  ]);

  const saleCostMap = new Map(
    saleCostRows.map((row) => [row.saleId, Number(row.cost ?? 0)]),
  );
  let grossSalesTotal = 0;
  let grossCostTotal = canSeeCosts
    ? saleCostRows.reduce((sum, row) => sum + Number(row.cost ?? 0), 0)
    : 0;
  let discountTotal = 0;
  const daily = new Map<string, { date: string; sales: number; cost: number | null; profit: number | null; count: number }>();
  const sellers = new Map<string, { seller: string; sales: number; profit: number | null; count: number }>();
  const branches = new Map<string, { branch: string; sales: number; profit: number | null; count: number }>();

  for (const sale of sales) {
    const saleTotal = Number(sale.total);
    grossSalesTotal += saleTotal;
    discountTotal += Number(sale.discount);
    const saleCost = canSeeCosts ? saleCostMap.get(sale.id) ?? 0 : 0;
    const key = isoDate(sale.createdAt);
    const day = daily.get(key) ?? { date: key, sales: 0, cost: canSeeCosts ? 0 : null, profit: canSeeCosts ? 0 : null, count: 0 };
    day.sales += saleTotal;
    if (canSeeCosts) {
      day.cost = Number(day.cost ?? 0) + saleCost;
      day.profit = Number(day.profit ?? 0) + saleTotal - saleCost;
    }
    day.count += 1;
    daily.set(key, day);

    const seller = sellers.get(sale.sellerId) ?? { seller: sale.seller.name, sales: 0, profit: canSeeCosts ? 0 : null, count: 0 };
    seller.sales += saleTotal;
    if (canSeeCosts) seller.profit = Number(seller.profit ?? 0) + saleTotal - saleCost;
    seller.count += 1;
    sellers.set(sale.sellerId, seller);

    const branch = branches.get(sale.branchId) ?? { branch: sale.branch.name, sales: 0, profit: canSeeCosts ? 0 : null, count: 0 };
    branch.sales += saleTotal;
    if (canSeeCosts) branch.profit = Number(branch.profit ?? 0) + saleTotal - saleCost;
    branch.count += 1;
    branches.set(sale.branchId, branch);
  }

  const products = productRows.map((row) => {
    const sales = Number(row.sales ?? 0);
    const cost = Number(row.cost ?? 0);
    return {
      product: row.product,
      brand: row.brand,
      quantity: Number(row.quantity ?? 0),
      sales,
      cost: canSeeCosts ? cost : null,
      profit: canSeeCosts ? sales - cost : null,
    };
  });
  const payments = paymentRows.map((row) => ({
    method: row.method,
    amount: Number(row.amount ?? 0),
  }));

  const [receivableRows, cashDifferenceRows, returnRows, cancelledCount] = await Promise.all([
    safe<ReceivableSummaryRow[]>("Cuentas por cobrar", [{ total: 0, overdue: 0 }], () => prisma.$queryRaw<ReceivableSummaryRow[]>`
      SELECT
        COALESCE(SUM("balance"), 0) AS "total",
        COALESCE(SUM("balance") FILTER (WHERE "dueDate" < NOW()), 0) AS "overdue"
      FROM "accounts_receivable"
      WHERE "companyId" = ${company.id}
        AND "status" IN ('OPEN', 'PARTIAL')
        AND "balance" > 0
    `),
    safe<AmountSummaryRow[]>("Cierres de caja", [{ total: 0 }], () => prisma.$queryRaw<AmountSummaryRow[]>`
      SELECT COALESCE(SUM("difference"), 0) AS "total"
      FROM "cash_sessions"
      WHERE "companyId" = ${company.id}
        AND "status" = 'CLOSED'
        AND "closedAt" BETWEEN ${from} AND ${to}
    `),
    safe<ReturnSummaryRow[]>("Devoluciones", [], () => prisma.$queryRaw<ReturnSummaryRow[]>`
      SELECT
        COALESCE((
          SELECT SUM(ri."amount")
          FROM "return_items" ri
          INNER JOIN "return_orders" ro ON ro."id"=ri."returnOrderId"
          WHERE ro."companyId"=${company.id}
            AND ro."status"='COMPLETED'
            AND ro."createdAt" BETWEEN ${from} AND ${to}
        ),0) AS "merchandiseTotal",
        COALESCE((
          SELECT SUM(ro."refundAmount")
          FROM "return_orders" ro
          WHERE ro."companyId"=${company.id}
            AND ro."status"='COMPLETED'
            AND ro."createdAt" BETWEEN ${from} AND ${to}
        ),0) AS "cashRefundTotal",
        (
          SELECT COUNT(*)
          FROM "return_orders" ro
          WHERE ro."companyId"=${company.id}
            AND ro."status"='COMPLETED'
            AND ro."createdAt" BETWEEN ${from} AND ${to}
        ) AS "count",
        COALESCE((
          SELECT SUM(ri."unitCost" * ri."quantity")
          FROM "return_items" ri
          INNER JOIN "return_orders" ro ON ro."id"=ri."returnOrderId"
          WHERE ro."companyId"=${company.id}
            AND ro."status"='COMPLETED'
            AND ro."createdAt" BETWEEN ${from} AND ${to}
        ),0) AS "cost"
    `),
    safe("Ventas anuladas", 0, () => prisma.sale.count({
      where: {
        companyId: company.id,
        status: "CANCELLED",
        updatedAt: { gte: from, lte: to },
      },
    })),
  ]);

  let purchasesTotal: number | null = null;
  let inventoryValue: number | null = null;
  if (canSeeCosts) {
    [purchasesTotal, inventoryValue] = await Promise.all([
      safe("Compras", 0, async () => {
        const purchases = await prisma.purchase.aggregate({
          where: {
            companyId: company.id,
            status: "RECEIVED",
            issueDate: { gte: from, lte: to },
          },
          _sum: { total: true },
        });
        return Number(purchases._sum.total ?? 0);
      }),
      safe("Stock valorizado", 0, async () => {
        const rows = await prisma.$queryRaw<AmountSummaryRow[]>`
          SELECT
            COALESCE((
              SELECT SUM("quantity" * "averageCost")
              FROM "inventory_balances"
              WHERE "companyId" = ${company.id}
            ), 0)
            +
            COALESCE((
              SELECT SUM("purchaseCost")
              FROM "product_units"
              WHERE "companyId" = ${company.id}
                AND "status" = 'AVAILABLE'
            ), 0) AS "total"
        `;
        return Number(rows[0]?.total ?? 0);
      }),
    ]);
  }

  const receivableTotal = Number(receivableRows[0]?.total ?? 0);
  const overdueTotal = Number(receivableRows[0]?.overdue ?? 0);
  const cashDifference = Number(cashDifferenceRows[0]?.total ?? 0);
  const returnsTotal = Number(returnRows[0]?.merchandiseTotal ?? 0);
  const cashRefundTotal = Number(returnRows[0]?.cashRefundTotal ?? 0);
  const returnedCost = canSeeCosts ? Number(returnRows[0]?.cost ?? 0) : null;
  const salesTotal = grossSalesTotal - returnsTotal;
  const costTotal = canSeeCosts ? grossCostTotal - Number(returnedCost ?? 0) : null;
  const grossProfit = canSeeCosts ? salesTotal - Number(costTotal ?? 0) : null;

  return {
    canSeeCosts,
    warnings,
    range: { from: isoDate(from), to: isoDate(to) },
    summary: {
      grossSalesTotal,
      salesTotal,
      grossCostTotal: canSeeCosts ? grossCostTotal : null,
      returnedCost,
      costTotal,
      grossProfit,
      margin: canSeeCosts && salesTotal ? (Number(grossProfit) / salesTotal) * 100 : null,
      transactions: sales.length,
      averageTicket: sales.length ? grossSalesTotal / sales.length : 0,
      purchasesTotal,
      inventoryValue,
      receivableTotal,
      overdueTotal,
      discountTotal,
      cashDifference,
      returnsTotal,
      cashRefundTotal,
      returnsCount: Number(returnRows[0]?.count ?? 0),
      cancelledCount,
    },
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    topProducts: products.sort((a, b) => b.sales - a.sales).slice(0, 12),
    sellers: [...sellers.values()].sort((a, b) => b.sales - a.sales),
    branches: [...branches.values()].sort((a, b) => b.sales - a.sales),
    payments: payments.sort((a, b) => b.amount - a.amount),
  };
}
