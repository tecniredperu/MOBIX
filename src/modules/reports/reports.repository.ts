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
type SalesSummaryRow = {
  grossSalesTotal: unknown;
  discountTotal: unknown;
  grossCostTotal: unknown;
  transactions: bigint;
};
type DailySalesRow = {
  date: string;
  sales: unknown;
  cost: unknown;
  count: bigint;
};
type ProductSalesRow = {
  product: string;
  brand: string | null;
  quantity: unknown;
  sales: unknown;
  cost: unknown;
};
type SellerSalesRow = {
  seller: string;
  sales: unknown;
  cost: unknown;
  count: bigint;
};
type BranchSalesRow = {
  branch: string;
  sales: unknown;
  cost: unknown;
  count: bigint;
};
type PaymentSalesRow = {
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

  const [
    salesSummaryRows,
    dailyRows,
    productRows,
    sellerRows,
    branchRows,
    paymentRows,
  ] = await Promise.all([
    safe<SalesSummaryRow[]>("Resumen de ventas", [{
      grossSalesTotal: 0,
      discountTotal: 0,
      grossCostTotal: 0,
      transactions: 0n,
    }], () => prisma.$queryRaw<SalesSummaryRow[]>`
      WITH filtered_sales AS (
        SELECT "id", "total", "discount"
        FROM "sales"
        WHERE "companyId" = ${company.id}
          AND "status" IN ('COMPLETED', 'REFUNDED')
          AND "createdAt" BETWEEN ${from} AND ${to}
      ),
      sale_costs AS (
        SELECT si."saleId", COALESCE(SUM(si."unitCost" * si."quantity"), 0) AS "cost"
        FROM "sale_items" si
        INNER JOIN filtered_sales fs ON fs."id" = si."saleId"
        GROUP BY si."saleId"
      )
      SELECT
        COALESCE(SUM(fs."total"), 0) AS "grossSalesTotal",
        COALESCE(SUM(fs."discount"), 0) AS "discountTotal",
        COALESCE(SUM(COALESCE(sc."cost", 0)), 0) AS "grossCostTotal",
        COUNT(*) AS "transactions"
      FROM filtered_sales fs
      LEFT JOIN sale_costs sc ON sc."saleId" = fs."id"
    `),
    safe<DailySalesRow[]>("Ventas por día", [], () => prisma.$queryRaw<DailySalesRow[]>`
      WITH filtered_sales AS (
        SELECT "id", "total", "createdAt"
        FROM "sales"
        WHERE "companyId" = ${company.id}
          AND "status" IN ('COMPLETED', 'REFUNDED')
          AND "createdAt" BETWEEN ${from} AND ${to}
      ),
      sale_costs AS (
        SELECT si."saleId", COALESCE(SUM(si."unitCost" * si."quantity"), 0) AS "cost"
        FROM "sale_items" si
        INNER JOIN filtered_sales fs ON fs."id" = si."saleId"
        GROUP BY si."saleId"
      )
      SELECT
        TO_CHAR(fs."createdAt" AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS "date",
        COALESCE(SUM(fs."total"), 0) AS "sales",
        COALESCE(SUM(COALESCE(sc."cost", 0)), 0) AS "cost",
        COUNT(*) AS "count"
      FROM filtered_sales fs
      LEFT JOIN sale_costs sc ON sc."saleId" = fs."id"
      GROUP BY 1
      ORDER BY 1
    `),
    safe<ProductSalesRow[]>("Ventas por producto", [], () => prisma.$queryRaw<ProductSalesRow[]>`
      WITH filtered_sales AS (
        SELECT "id"
        FROM "sales"
        WHERE "companyId" = ${company.id}
          AND "status" IN ('COMPLETED', 'REFUNDED')
          AND "createdAt" BETWEEN ${from} AND ${to}
      )
      SELECT
        p."name" AS "product",
        b."name" AS "brand",
        COALESCE(SUM(si."quantity"), 0) AS "quantity",
        COALESCE(SUM(si."total"), 0) AS "sales",
        COALESCE(SUM(si."unitCost" * si."quantity"), 0) AS "cost"
      FROM "sale_items" si
      INNER JOIN filtered_sales fs ON fs."id" = si."saleId"
      INNER JOIN "products" p ON p."id" = si."productId"
      LEFT JOIN "brands" b ON b."id" = p."brandId"
      GROUP BY p."id", p."name", b."name"
      ORDER BY "sales" DESC
      LIMIT 12
    `),
    safe<SellerSalesRow[]>("Ventas por vendedor", [], () => prisma.$queryRaw<SellerSalesRow[]>`
      WITH filtered_sales AS (
        SELECT "id", "sellerId", "total"
        FROM "sales"
        WHERE "companyId" = ${company.id}
          AND "status" IN ('COMPLETED', 'REFUNDED')
          AND "createdAt" BETWEEN ${from} AND ${to}
      ),
      sale_costs AS (
        SELECT si."saleId", COALESCE(SUM(si."unitCost" * si."quantity"), 0) AS "cost"
        FROM "sale_items" si
        INNER JOIN filtered_sales fs ON fs."id" = si."saleId"
        GROUP BY si."saleId"
      )
      SELECT
        u."name" AS "seller",
        COALESCE(SUM(fs."total"), 0) AS "sales",
        COALESCE(SUM(COALESCE(sc."cost", 0)), 0) AS "cost",
        COUNT(*) AS "count"
      FROM filtered_sales fs
      INNER JOIN "users" u ON u."id" = fs."sellerId"
      LEFT JOIN sale_costs sc ON sc."saleId" = fs."id"
      GROUP BY u."id", u."name"
      ORDER BY "sales" DESC
    `),
    safe<BranchSalesRow[]>("Ventas por sucursal", [], () => prisma.$queryRaw<BranchSalesRow[]>`
      WITH filtered_sales AS (
        SELECT "id", "branchId", "total"
        FROM "sales"
        WHERE "companyId" = ${company.id}
          AND "status" IN ('COMPLETED', 'REFUNDED')
          AND "createdAt" BETWEEN ${from} AND ${to}
      ),
      sale_costs AS (
        SELECT si."saleId", COALESCE(SUM(si."unitCost" * si."quantity"), 0) AS "cost"
        FROM "sale_items" si
        INNER JOIN filtered_sales fs ON fs."id" = si."saleId"
        GROUP BY si."saleId"
      )
      SELECT
        b."name" AS "branch",
        COALESCE(SUM(fs."total"), 0) AS "sales",
        COALESCE(SUM(COALESCE(sc."cost", 0)), 0) AS "cost",
        COUNT(*) AS "count"
      FROM filtered_sales fs
      INNER JOIN "branches" b ON b."id" = fs."branchId"
      LEFT JOIN sale_costs sc ON sc."saleId" = fs."id"
      GROUP BY b."id", b."name"
      ORDER BY "sales" DESC
    `),
    safe<PaymentSalesRow[]>("Medios de pago", [], () => prisma.$queryRaw<PaymentSalesRow[]>`
      SELECT
        sp."paymentMethod"::text AS "method",
        COALESCE(SUM(sp."amount"), 0) AS "amount"
      FROM "sale_payments" sp
      INNER JOIN "sales" s ON s."id" = sp."saleId"
      WHERE s."companyId" = ${company.id}
        AND s."status" IN ('COMPLETED', 'REFUNDED')
        AND s."createdAt" BETWEEN ${from} AND ${to}
      GROUP BY sp."paymentMethod"
      ORDER BY "amount" DESC
    `),
  ]);

  const salesSummary = salesSummaryRows[0];
  const grossSalesTotal = Number(salesSummary?.grossSalesTotal ?? 0);
  const grossCostTotal = canSeeCosts ? Number(salesSummary?.grossCostTotal ?? 0) : 0;
  const discountTotal = Number(salesSummary?.discountTotal ?? 0);
  const transactionCount = Number(salesSummary?.transactions ?? 0);

  const daily = dailyRows.map((row) => {
    const sales = Number(row.sales ?? 0);
    const cost = Number(row.cost ?? 0);
    return {
      date: row.date,
      sales,
      cost: canSeeCosts ? cost : null,
      profit: canSeeCosts ? sales - cost : null,
      count: Number(row.count ?? 0),
    };
  });

  const topProducts = productRows.map((row) => {
    const sales = Number(row.sales ?? 0);
    const cost = Number(row.cost ?? 0);
    return {
      product: row.product,
      brand: row.brand ?? "Sin marca",
      quantity: Number(row.quantity ?? 0),
      sales,
      cost: canSeeCosts ? cost : null,
      profit: canSeeCosts ? sales - cost : null,
    };
  });

  const sellers = sellerRows.map((row) => {
    const sales = Number(row.sales ?? 0);
    const cost = Number(row.cost ?? 0);
    return {
      seller: row.seller,
      sales,
      profit: canSeeCosts ? sales - cost : null,
      count: Number(row.count ?? 0),
    };
  });

  const branches = branchRows.map((row) => {
    const sales = Number(row.sales ?? 0);
    const cost = Number(row.cost ?? 0);
    return {
      branch: row.branch,
      sales,
      profit: canSeeCosts ? sales - cost : null,
      count: Number(row.count ?? 0),
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
      transactions: transactionCount,
      averageTicket: transactionCount ? grossSalesTotal / transactionCount : 0,
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
    daily,
    topProducts,
    sellers,
    branches,
    payments,
  };
}
