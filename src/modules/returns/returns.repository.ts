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
      exchangeCredit: {
        select: {
          id: true,
          originalAmount: true,
          balance: true,
          status: true,
          refundedAmount: true,
          refundMethod: true,
          refundReference: true,
          refundedAt: true,
        },
      },
      items: {
        select: {
          productUnitId: true,
          disposition: true,
        },
      },
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
    exchangeCredit: row.exchangeCredit
      ? {
          id: row.exchangeCredit.id,
          originalAmount: Number(row.exchangeCredit.originalAmount),
          balance: Number(row.exchangeCredit.balance),
          status: row.exchangeCredit.status,
          refundedAmount: Number(row.exchangeCredit.refundedAmount),
          refundMethod: row.exchangeCredit.refundMethod,
          refundReference: row.exchangeCredit.refundReference,
          refundedAt: row.exchangeCredit.refundedAt?.toISOString() ?? null,
        }
      : null,
    serializedDisposition: {
      restock: row.items.filter((item) => item.productUnitId && item.disposition === "RESTOCK").length,
      quarantine: row.items.filter((item) => item.productUnitId && item.disposition === "QUARANTINE").length,
      damaged: row.items.filter((item) => item.productUnitId && item.disposition === "DAMAGED").length,
    },
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

  return sales
    .map((sale) => ({
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
    }))
    .filter((sale) => sale.items.some((item) => item.returned < item.quantity));
}


function identifierValue(identifiers: Array<{ type: string; value: string }>) {
  return identifiers.find((identifier) => identifier.type === "IMEI_1")?.value
    || identifiers.find((identifier) => identifier.type === "SERIAL")?.value
    || identifiers.find((identifier) => identifier.type === "IMEI_2")?.value
    || null;
}

export async function getReturnDetail(id: string) {
  const company = await getActiveCompany();
  const order = await prisma.returnOrder.findFirst({
    where: { id, companyId: company.id },
    include: {
      sale: {
        include: {
          customer: true,
          warehouse: { include: { branch: true } },
          seller: { select: { name: true } },
        },
      },
      customer: true,
      warehouse: { include: { branch: true } },
      createdBy: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          product: { include: { brand: true } },
          variant: true,
          productUnit: {
            include: {
              identifiers: true,
            },
          },
        },
      },
      exchangeCredit: {
        include: {
          usages: {
            orderBy: { createdAt: "asc" },
            include: {
              sale: {
                include: {
                  items: {
                    include: {
                      product: true,
                      units: {
                        include: {
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
        },
      },
    },
  });

  if (!order) return null;

  const merchandiseAmount = order.items.reduce(
    (sum, item) => sum + Number(item.amount),
    0,
  );

  return {
    id: order.id,
    returnNumber: order.returnNumber,
    type: order.type,
    status: order.status,
    reason: order.reason,
    notes: order.notes,
    refundMethod: order.refundMethod,
    refundAmount: Number(order.refundAmount),
    merchandiseAmount,
    createdAt: order.createdAt.toISOString(),
    createdBy: order.createdBy.name,
    warehouse: {
      id: order.warehouse.id,
      name: order.warehouse.name,
      branch: order.warehouse.branch.name,
    },
    customer: order.customer
      ? {
          id: order.customer.id,
          name: customerName(order.customer),
          documentType: order.customer.documentType,
          documentNumber: order.customer.documentNumber,
          phone: order.customer.whatsapp ?? order.customer.phone,
          email: order.customer.email,
          address: order.customer.address,
        }
      : null,
    sale: {
      id: order.sale.id,
      saleNumber: order.sale.saleNumber,
      documentType: order.sale.documentType,
      documentSeries: order.sale.documentSeries,
      documentNumber: order.sale.documentNumber,
      status: order.sale.status,
      total: Number(order.sale.total),
      createdAt: order.sale.createdAt.toISOString(),
      seller: order.sale.seller.name,
      branch: order.sale.warehouse.branch.name,
      warehouse: order.sale.warehouse.name,
      customer: order.sale.customer
        ? {
            id: order.sale.customer.id,
            name: customerName(order.sale.customer),
            documentType: order.sale.customer.documentType,
            documentNumber: order.sale.customer.documentNumber,
          }
        : null,
    },
    items: order.items.map((item) => ({
      id: item.id,
      saleItemId: item.saleItemId,
      productId: item.productId,
      productUnitId: item.productUnitId,
      product: item.product.name,
      brand: item.product.brand?.name ?? "Sin marca",
      type: item.product.type,
      variant: [item.variant.ram, item.variant.storage, item.variant.color]
        .filter(Boolean)
        .join(" / ") || item.variant.sku || "Variante base",
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      unitCost: Number(item.unitCost),
      amount: Number(item.amount),
      disposition: item.disposition,
      unitStatus: item.productUnit?.status ?? null,
      identifier: item.productUnit
        ? identifierValue(item.productUnit.identifiers)
        : null,
    })),
    exchangeCredit: order.exchangeCredit
      ? {
          id: order.exchangeCredit.id,
          originalAmount: Number(order.exchangeCredit.originalAmount),
          balance: Number(order.exchangeCredit.balance),
          status: order.exchangeCredit.status,
          refundedAmount: Number(order.exchangeCredit.refundedAmount),
          refundMethod: order.exchangeCredit.refundMethod,
          refundReference: order.exchangeCredit.refundReference,
          refundedAt: order.exchangeCredit.refundedAt?.toISOString() ?? null,
          usages: order.exchangeCredit.usages.map((usage) => ({
            id: usage.id,
            amount: Number(usage.amount),
            createdAt: usage.createdAt.toISOString(),
            sale: {
              id: usage.sale.id,
              saleNumber: usage.sale.saleNumber,
              createdAt: usage.sale.createdAt.toISOString(),
              total: Number(usage.sale.total),
              units: usage.sale.items.flatMap((saleItem) =>
                saleItem.units.map((link) => ({
                  id: link.productUnit.id,
                  product: saleItem.product.name,
                  identifier: identifierValue(link.productUnit.identifiers)
                    || link.productUnit.id,
                })),
              ),
            },
          })),
        }
      : null,
  };
}
