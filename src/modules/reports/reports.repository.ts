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

type ReceivableRow = { balance: unknown; dueDate: Date };
type ReturnSummaryRow = { total: unknown; count: bigint };

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

  const sales = await prisma.sale.findMany({
    where: { companyId: company.id, status: "COMPLETED", createdAt: { gte: from, lte: to } },
    include: {
      items: { include: { product: { include: { brand: true, category: true } }, variant: true } },
      payments: true,
      seller: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  let salesTotal = 0;
  let costTotal = 0;
  let discountTotal = 0;
  const daily = new Map<string, { date: string; sales: number; cost: number | null; profit: number | null; count: number }>();
  const products = new Map<string, { product: string; brand: string; quantity: number; sales: number; cost: number | null; profit: number | null }>();
  const sellers = new Map<string, { seller: string; sales: number; profit: number | null; count: number }>();
  const branches = new Map<string, { branch: string; sales: number; profit: number | null; count: number }>();
  const payments = new Map<string, number>();

  for (const sale of sales) {
    const saleTotal = Number(sale.total);
    salesTotal += saleTotal;
    discountTotal += Number(sale.discount);
    const saleCost = canSeeCosts ? sale.items.reduce((sum, item) => sum + Number(item.unitCost) * item.quantity, 0) : 0;
    if (canSeeCosts) costTotal += saleCost;
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

    for (const payment of sale.payments) payments.set(payment.paymentMethod, (payments.get(payment.paymentMethod) ?? 0) + Number(payment.amount));
    for (const item of sale.items) {
      const row = products.get(item.productId) ?? { product: item.product.name, brand: item.product.brand?.name ?? "Sin marca", quantity: 0, sales: 0, cost: canSeeCosts ? 0 : null, profit: canSeeCosts ? 0 : null };
      const itemCost = canSeeCosts ? Number(item.unitCost) * item.quantity : 0;
      row.quantity += item.quantity;
      row.sales += Number(item.total);
      if (canSeeCosts) {
        row.cost = Number(row.cost ?? 0) + itemCost;
        row.profit = Number(row.profit ?? 0) + Number(item.total) - itemCost;
      }
      products.set(item.productId, row);
    }
  }

  const baseQueries = [
    prisma.$queryRaw<ReceivableRow[]>`SELECT "balance", "dueDate" FROM "accounts_receivable" WHERE "companyId" = ${company.id} AND "status" IN ('OPEN', 'PARTIAL')`,
    prisma.cashSession.findMany({ where: { companyId: company.id, status: "CLOSED", closedAt: { gte: from, lte: to } }, select: { difference: true } }),
    prisma.$queryRaw<ReturnSummaryRow[]>`SELECT COALESCE(SUM("refundAmount"),0) AS "total", COUNT(*) AS "count" FROM "return_orders" WHERE "companyId" = ${company.id} AND "status" = 'COMPLETED' AND "createdAt" BETWEEN ${from} AND ${to}`,
  ] as const;
  const [receivables, cashClosures, returnRows] = await Promise.all(baseQueries);

  let purchasesTotal: number | null = null;
  let inventoryValue: number | null = null;
  if (canSeeCosts) {
    const [purchases, accessoryBalances, availableUnits] = await Promise.all([
      prisma.purchase.aggregate({ where: { companyId: company.id, status: "RECEIVED", issueDate: { gte: from, lte: to } }, _sum: { total: true } }),
      prisma.inventoryBalance.findMany({ where: { companyId: company.id }, select: { quantity: true, averageCost: true } }),
      prisma.productUnit.findMany({ where: { companyId: company.id, status: "AVAILABLE" }, select: { purchaseCost: true } }),
    ]);
    purchasesTotal = Number(purchases._sum.total ?? 0);
    inventoryValue = accessoryBalances.reduce((sum, item) => sum + Number(item.quantity) * Number(item.averageCost), 0) + availableUnits.reduce((sum, item) => sum + Number(item.purchaseCost), 0);
  }

  const receivableTotal = receivables.reduce((sum, item) => sum + Number(item.balance), 0);
  const overdueTotal = receivables.filter((item) => new Date(item.dueDate) < now).reduce((sum, item) => sum + Number(item.balance), 0);
  const cashDifference = cashClosures.reduce((sum, item) => sum + Number(item.difference ?? 0), 0);
  const grossProfit = canSeeCosts ? salesTotal - costTotal : null;

  return {
    canSeeCosts,
    range: { from: isoDate(from), to: isoDate(to) },
    summary: {
      salesTotal,
      costTotal: canSeeCosts ? costTotal : null,
      grossProfit,
      margin: canSeeCosts && salesTotal ? (Number(grossProfit) / salesTotal) * 100 : null,
      transactions: sales.length,
      averageTicket: sales.length ? salesTotal / sales.length : 0,
      purchasesTotal,
      inventoryValue,
      receivableTotal,
      overdueTotal,
      discountTotal,
      cashDifference,
      returnsTotal: Number(returnRows[0]?.total ?? 0),
      returnsCount: Number(returnRows[0]?.count ?? 0),
    },
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    topProducts: [...products.values()].sort((a, b) => b.sales - a.sales).slice(0, 12),
    sellers: [...sellers.values()].sort((a, b) => b.sales - a.sales),
    branches: [...branches.values()].sort((a, b) => b.sales - a.sales),
    payments: [...payments.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
  };
}
