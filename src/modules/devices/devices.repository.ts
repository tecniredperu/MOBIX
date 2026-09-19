import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

export async function getDevices(filters: { q?: string; status?: string; warehouseId?: string } = {}) {
  const company = await getActiveCompany();
  const q = filters.q?.trim();
  const allowedStatuses = ["AVAILABLE", "RESERVED", "SOLD", "IN_TRANSFER", "WARRANTY", "TECHNICAL_SERVICE", "RETURNED", "DAMAGED", "LOST", "INACTIVE"];

  const where = {
    companyId: company.id,
    ...(filters.status && allowedStatuses.includes(filters.status)
      ? { status: filters.status as "AVAILABLE" | "RESERVED" | "SOLD" | "IN_TRANSFER" | "WARRANTY" | "TECHNICAL_SERVICE" | "RETURNED" | "DAMAGED" | "LOST" | "INACTIVE" }
      : {}),
    ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
    ...(q
      ? {
          OR: [
            { product: { name: { contains: q, mode: "insensitive" as const } } },
            { product: { model: { contains: q, mode: "insensitive" as const } } },
            { variant: { sku: { contains: q, mode: "insensitive" as const } } },
            { identifiers: { some: { value: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };

  const [units, warehouses, grouped] = await Promise.all([
    prisma.productUnit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 150,
      include: {
        product: { include: { brand: true } },
        variant: true,
        warehouse: { include: { branch: true } },
        identifiers: true,
        purchase: { include: { supplier: true } },
      },
    }),
    prisma.warehouse.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, branch: { select: { name: true } } },
    }),
    prisma.productUnit.groupBy({
      by: ["status"],
      where: { companyId: company.id },
      _count: { _all: true },
    }),
  ]);

  const statusCounts = new Map(grouped.map((row) => [row.status, row._count._all]));

  return {
    items: units.map((unit) => {
      const identifiers = new Map(unit.identifiers.map((identifier) => [identifier.type, identifier.value]));
      return {
        id: unit.id,
        product: unit.product.name,
        model: unit.product.model,
        brand: unit.product.brand?.name ?? "Sin marca",
        variant: [unit.variant.ram, unit.variant.storage, unit.variant.color].filter(Boolean).join(" / ") || "Variante base",
        sku: unit.variant.sku,
        imei1: identifiers.get("IMEI_1") ?? "—",
        imei2: identifiers.get("IMEI_2") ?? "—",
        serial: identifiers.get("SERIAL") ?? "—",
        warehouse: unit.warehouse.name,
        branch: unit.warehouse.branch.name,
        cost: Number(unit.purchaseCost),
        status: unit.status,
        supplier: unit.purchase?.supplier.businessName ?? "—",
        purchaseNumber: unit.purchase?.number ?? "—",
        createdAt: unit.createdAt.toISOString(),
      };
    }),
    warehouses: warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name, branchName: warehouse.branch.name })),
    summary: {
      total: grouped.reduce((sum, row) => sum + row._count._all, 0),
      available: statusCounts.get("AVAILABLE") ?? 0,
      sold: statusCounts.get("SOLD") ?? 0,
      service: (statusCounts.get("WARRANTY") ?? 0) + (statusCounts.get("TECHNICAL_SERVICE") ?? 0),
    },
  };
}


function displayCustomer(customer: {
  businessName: string | null;
  firstName: string | null;
  lastName: string | null;
} | null | undefined) {
  if (!customer) return "Consumidor final";
  if (customer.businessName?.trim()) return customer.businessName;
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || "Cliente";
}

function addDays(date: Date, days: number) {
  return days > 0 ? new Date(date.getTime() + days * 86_400_000) : null;
}

export async function getDeviceDetail(id: string) {
  const company = await getActiveCompany();
  const unit = await prisma.productUnit.findFirst({
    where: { id, companyId: company.id },
    include: {
      product: { include: { brand: true, category: true } },
      variant: true,
      warehouse: { include: { branch: true } },
      identifiers: true,
      purchase: { include: { supplier: true } },
      saleLinks: {
        include: {
          saleItem: {
            include: {
              sale: {
                include: {
                  customer: true,
                  seller: { select: { name: true } },
                  exchangeCreditUsages: {
                    include: {
                      exchangeCredit: {
                        include: {
                          returnOrder: {
                            include: {
                              items: {
                                include: {
                                  product: { select: { name: true } },
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
          },
        },
      },
      serviceOrders: {
        orderBy: { receivedAt: "desc" },
        select: {
          id: true,
          serviceNumber: true,
          serviceType: true,
          status: true,
          reportedIssue: true,
          warrantyCovered: true,
          receivedAt: true,
          deliveredAt: true,
        },
      },
      returnItems: {
        orderBy: { createdAt: "desc" },
        include: {
          returnOrder: {
            select: {
              id: true,
              returnNumber: true,
              type: true,
              reason: true,
              refundMethod: true,
              refundAmount: true,
              status: true,
              createdAt: true,
              exchangeCredit: {
                select: {
                  id: true,
                  originalAmount: true,
                  balance: true,
                  status: true,
                  refundedAmount: true,
                  usages: {
                    include: {
                      sale: {
                        include: {
                          items: {
                            include: {
                              product: { select: { name: true } },
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
          },
        },
      },
    },
  });

  if (!unit) return null;

  const identifiers = new Map(unit.identifiers.map((identifier) => [identifier.type, identifier.value]));
  const saleLinks = unit.saleLinks
    .filter((link) => link.saleItem.sale.status !== "CANCELLED")
    .sort((a, b) => +b.saleItem.sale.createdAt - +a.saleItem.sale.createdAt);
  const latestLink = saleLinks[0] ?? null;
  const sale = latestLink?.saleItem.sale ?? null;

  const legacyWarrantyDays = unit.product.warrantyDays ?? 0;
  const warrantyDays = latestLink?.warrantyDays || legacyWarrantyDays;
  const warrantyStartsAt = latestLink?.warrantyStartsAt ?? sale?.createdAt ?? null;
  const warrantyExpiresAt = latestLink?.warrantyExpiresAt
    ?? (warrantyStartsAt ? addDays(warrantyStartsAt, warrantyDays) : null);
  const latestSaleReturned = Boolean(
    latestLink && unit.returnItems.some((item) =>
      item.saleItemId === latestLink.saleItemId
      && item.returnOrder.status === "COMPLETED"),
  );
  const now = Date.now();
  const warrantyActive = Boolean(
    !latestSaleReturned
    && warrantyExpiresAt
    && warrantyExpiresAt.getTime() >= now,
  );

  return {
    id: unit.id,
    status: unit.status,
    product: {
      name: unit.product.name,
      model: unit.product.model,
      brand: unit.product.brand?.name ?? "Sin marca",
      category: unit.product.category?.name ?? "Sin categoría",
      warrantyDaysConfigured: unit.product.warrantyDays,
    },
    variant: {
      label: [unit.variant.ram, unit.variant.storage, unit.variant.color].filter(Boolean).join(" / ") || "Variante base",
      sku: unit.variant.sku ?? unit.product.sku,
      color: unit.variant.color,
      ram: unit.variant.ram,
      storage: unit.variant.storage,
    },
    identifiers: {
      imei1: identifiers.get("IMEI_1") ?? null,
      imei2: identifiers.get("IMEI_2") ?? null,
      serial: identifiers.get("SERIAL") ?? null,
    },
    location: {
      warehouse: unit.warehouse.name,
      branch: unit.warehouse.branch.name,
    },
    purchase: unit.purchase
      ? {
          number: unit.purchase.number,
          supplier: unit.purchase.supplier.businessName,
          issueDate: unit.purchase.issueDate.toISOString(),
          cost: Number(unit.purchaseCost),
        }
      : null,
    sale: sale
      ? {
          id: sale.id,
          saleNumber: sale.saleNumber,
          documentType: sale.documentType,
          documentSeries: sale.documentSeries,
          documentNumber: sale.documentNumber,
          soldAt: sale.createdAt.toISOString(),
          seller: sale.seller.name,
          returned: latestSaleReturned,
          exchangeOrigins: sale.exchangeCreditUsages.map((usage) => ({
            exchangeCreditId: usage.exchangeCreditId,
            amount: Number(usage.amount),
            returnNumber: usage.exchangeCredit.returnOrder.returnNumber,
            returnedUnits: usage.exchangeCredit.returnOrder.items
              .filter((item) => Boolean(item.productUnit))
              .map((item) => {
                const oldIdentifiers = item.productUnit?.identifiers ?? [];
                return {
                  id: item.productUnitId,
                  product: item.product.name,
                  identifier:
                    oldIdentifiers.find((identifier) => identifier.type === "IMEI_1")?.value
                    ?? oldIdentifiers.find((identifier) => identifier.type === "SERIAL")?.value
                    ?? item.productUnitId
                    ?? "Sin identificador",
                };
              }),
          })),
          customer: sale.customer
            ? {
                id: sale.customer.id,
                name: displayCustomer(sale.customer),
                documentType: sale.customer.documentType,
                documentNumber: sale.customer.documentNumber,
                phone: sale.customer.whatsapp ?? sale.customer.phone,
                email: sale.customer.email,
                address: sale.customer.address,
              }
            : null,
        }
      : null,
    warranty: {
      days: warrantyDays,
      startsAt: warrantyStartsAt?.toISOString() ?? null,
      expiresAt: warrantyExpiresAt?.toISOString() ?? null,
      active: warrantyActive,
      expired: Boolean(warrantyExpiresAt && warrantyExpiresAt.getTime() < now),
    },
    serviceOrders: unit.serviceOrders.map((order) => ({
      id: order.id,
      serviceNumber: order.serviceNumber,
      serviceType: order.serviceType,
      status: order.status,
      reportedIssue: order.reportedIssue,
      warrantyCovered: order.warrantyCovered,
      receivedAt: order.receivedAt.toISOString(),
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
    })),
    returns: unit.returnItems.map((item) => ({
      id: item.id,
      returnOrderId: item.returnOrder.id,
      returnNumber: item.returnOrder.returnNumber,
      type: item.returnOrder.type,
      reason: item.returnOrder.reason,
      disposition: item.disposition,
      refundMethod: item.returnOrder.refundMethod,
      refundAmount: Number(item.returnOrder.refundAmount),
      createdAt: item.returnOrder.createdAt.toISOString(),
      exchange: item.returnOrder.exchangeCredit
        ? {
            id: item.returnOrder.exchangeCredit.id,
            originalAmount: Number(item.returnOrder.exchangeCredit.originalAmount),
            balance: Number(item.returnOrder.exchangeCredit.balance),
            status: item.returnOrder.exchangeCredit.status,
            refundedAmount: Number(item.returnOrder.exchangeCredit.refundedAmount),
            usages: item.returnOrder.exchangeCredit.usages.map((usage) => ({
              saleId: usage.saleId,
              saleNumber: usage.sale.saleNumber,
              amount: Number(usage.amount),
              newUnits: usage.sale.items.flatMap((saleItem) =>
                saleItem.units.map((link) => {
                  const newIdentifiers = link.productUnit.identifiers;
                  return {
                    id: link.productUnit.id,
                    product: saleItem.product.name,
                    identifier:
                      newIdentifiers.find((identifier) => identifier.type === "IMEI_1")?.value
                      ?? newIdentifiers.find((identifier) => identifier.type === "SERIAL")?.value
                      ?? link.productUnit.id,
                  };
                }),
              ),
            })),
          }
        : null,
    })),
  };
}
