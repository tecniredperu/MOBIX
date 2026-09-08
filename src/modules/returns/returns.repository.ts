import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

function customerName(customer: {
  businessName: string | null;
  firstName: string | null;
  lastName: string | null;
} | null) {
  if (!customer) return "Consumidor final";
  return customer.businessName?.trim()
    || [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim()
    || "Consumidor final";
}

export async function getReturns() {
  const company = await getActiveCompany();
  const rows = await prisma.returnOrder.findMany({
    where: { companyId: company.id, status: "COMPLETED" },
    include: {
      sale: { select: { saleNumber: true } },
      customer: { select: { businessName: true, firstName: true, lastName: true } },
      warehouse: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  return rows.map((row) => ({
    id: row.id,
    returnNumber: row.returnNumber,
    type: row.type,
    reason: row.reason,
    refundMethod: row.refundMethod,
    refundAmount: Number(row.refundAmount),
    createdAt: row.createdAt.toISOString(),
    saleNumber: row.sale.saleNumber,
    customer: customerName(row.customer),
    warehouse: row.warehouse.name,
    userName: row.createdBy.name,
  }));
}

export async function getReturnSaleOptions() {
  const company = await getActiveCompany();
  const [sales, returned] = await Promise.all([
    prisma.sale.findMany({
      where: { companyId: company.id, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        customer: true,
        warehouse: { select: { id: true, name: true, branchId: true } },
        items: {
          include: {
            product: true,
            variant: true,
            units: {
              include: {
                productUnit: { include: { identifiers: true } },
              },
            },
          },
        },
      },
    }),
    prisma.returnItem.groupBy({
      by: ["saleItemId"],
      where: {
        returnOrder: {
          companyId: company.id,
          status: "COMPLETED",
        },
      },
      _sum: { quantity: true },
    }),
  ]);

  const returnedMap = new Map(
    returned.map((row) => [row.saleItemId, Number(row._sum.quantity ?? 0)]),
  );

  return sales.map((sale) => ({
    id: sale.id,
    saleNumber: sale.saleNumber,
    createdAt: sale.createdAt.toISOString(),
    customer: customerName(sale.customer),
    warehouseId: sale.warehouseId,
    warehouse: sale.warehouse.name,
    total: Number(sale.total),
    items: sale.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      product: item.product.name,
      type: item.product.type,
      variant: [item.variant.color, item.variant.ram, item.variant.storage]
        .filter(Boolean)
        .join(" · ") || item.variant.sku || "General",
      quantity: item.quantity,
      returned: returnedMap.get(item.id) ?? 0,
      total: Number(item.total),
      unitPrice: Number(item.unitPrice),
      unitCost: Number(item.unitCost),
      units: item.units.map((link) => ({
        id: link.productUnit.id,
        status: link.productUnit.status,
        identifier:
          link.productUnit.identifiers.find((identifier) => identifier.type === "IMEI_1")?.value
          || link.productUnit.identifiers.find((identifier) => identifier.type === "SERIAL")?.value
          || link.productUnit.id,
      })),
    })),
  }));
}
