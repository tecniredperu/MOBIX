import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

function variantLabel(input: { ram: string | null; storage: string | null; color: string | null }) {
  return [input.ram, input.storage, input.color].filter(Boolean).join(" / ") || "Variante base";
}

function identifierMap(identifiers: Array<{ type: string; value: string }>) {
  return new Map(identifiers.map((item) => [item.type, item.value]));
}

function customerDisplayName(customer: { businessName?: string | null; firstName?: string | null; lastName?: string | null } | null | undefined, fallback: string) {
  if (!customer) return fallback;
  if (customer.businessName?.trim()) return customer.businessName;
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  return name || fallback;
}

export async function getSaleDetail(id: string) {
  const company = await getActiveCompany();
  const sale = await prisma.sale.findFirst({
    where: { id, companyId: company.id },
    select: {
      id: true,
      saleNumber: true,
      documentType: true,
      documentSeries: true,
      documentNumber: true,
      taxCondition: true,
      subtotal: true,
      discount: true,
      tax: true,
      total: true,
      status: true,
      createdAt: true,
      customer: {
        select: {
          id: true,
          documentType: true,
          documentNumber: true,
          businessName: true,
          firstName: true,
          lastName: true,
          whatsapp: true,
          phone: true,
          email: true,
          address: true,
        },
      },
      warehouse: {
        select: {
          name: true,
          branch: { select: { name: true } },
        },
      },
      seller: { select: { name: true } },
      payments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          paymentMethod: true,
          amount: true,
          reference: true,
          notes: true,
        },
      },
      exchangeCreditUsages: {
        select: {
          exchangeCreditId: true,
          amount: true,
          exchangeCredit: {
            select: {
              originalAmount: true,
              balance: true,
              status: true,
              refundedAmount: true,
              returnOrder: {
                select: {
                  returnNumber: true,
                  items: {
                    select: {
                      productUnitId: true,
                      product: { select: { name: true } },
                      productUnit: {
                        select: {
                          identifiers: { select: { type: true, value: true } },
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
      returnOrders: {
        where: { status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          returnNumber: true,
          type: true,
          reason: true,
          refundMethod: true,
          refundAmount: true,
          createdAt: true,
          exchangeCredit: {
            select: {
              id: true,
              originalAmount: true,
              balance: true,
              status: true,
              refundedAmount: true,
            },
          },
          items: {
            select: {
              quantity: true,
              amount: true,
              productUnitId: true,
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
          deviceName: true,
          identifier: true,
          warrantyCovered: true,
          reportedIssue: true,
          receivedAt: true,
          deliveredAt: true,
          finalCost: true,
        },
      },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          unitCost: true,
          discount: true,
          subtotal: true,
          tax: true,
          total: true,
          product: {
            select: {
              name: true,
              brand: { select: { name: true } },
            },
          },
          variant: {
            select: {
              ram: true,
              storage: true,
              color: true,
            },
          },
          units: {
            select: {
              warrantyDays: true,
              warrantyStartsAt: true,
              warrantyExpiresAt: true,
              productUnit: {
                select: {
                  identifiers: { select: { type: true, value: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!sale) return null;

  const cancellationAudit = sale.status === "CANCELLED"
    ? await prisma.auditLog.findFirst({
        where: {
          companyId: company.id,
          entity: "SALE",
          entityId: sale.id,
          action: "CANCEL",
        },
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true } },
        },
      })
    : null;
  const cancellationValues = cancellationAudit?.newValues
    && typeof cancellationAudit.newValues === "object"
    && !Array.isArray(cancellationAudit.newValues)
      ? cancellationAudit.newValues as Record<string, unknown>
      : null;

  return {
    id: sale.id,
    saleNumber: sale.saleNumber,
    documentType: sale.documentType,
    documentSeries: sale.documentSeries,
    documentNumber: sale.documentNumber,
    taxCondition: sale.taxCondition,
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    discount: Number(sale.discount),
    total: Number(sale.total),
    status: sale.status,
    createdAt: sale.createdAt.toISOString(),
    cancellation: cancellationAudit
      ? {
          reason: typeof cancellationValues?.reason === "string"
            ? cancellationValues.reason
            : "Anulación registrada",
          userName: cancellationAudit.user?.name ?? "Usuario",
          createdAt: cancellationAudit.createdAt.toISOString(),
        }
      : null,
    branch: sale.warehouse.branch.name,
    warehouse: sale.warehouse.name,
    seller: sale.seller.name,
    customer: sale.customer
      ? {
          id: sale.customer.id,
          documentType: sale.customer.documentType,
          documentNumber: sale.customer.documentNumber,
          name: customerDisplayName(sale.customer, "Cliente"),
          phone: sale.customer.whatsapp ?? sale.customer.phone,
          email: sale.customer.email,
          address: sale.customer.address,
        }
      : null,
    items: sale.items.map((item) => ({
      id: item.id,
      product: item.product.name,
      brand: item.product.brand?.name ?? "Sin marca",
      variant: variantLabel(item.variant),
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      unitCost: Number(item.unitCost),
      discount: Number(item.discount),
      subtotal: Number(item.subtotal),
      tax: Number(item.tax),
      total: Number(item.total),
      identifiers: item.units.map((link) => {
        const identifiers = identifierMap(link.productUnit.identifiers);
        return {
          imei1: identifiers.get("IMEI_1") ?? null,
          imei2: identifiers.get("IMEI_2") ?? null,
          serial: identifiers.get("SERIAL") ?? null,
          warrantyDays: link.warrantyDays,
          warrantyStartsAt: link.warrantyStartsAt?.toISOString() ?? null,
          warrantyExpiresAt: link.warrantyExpiresAt?.toISOString() ?? null,
        };
      }),
    })),
    payments: sale.payments.map((payment) => ({
      id: payment.id,
      method: payment.paymentMethod,
      amount: Number(payment.amount),
      reference: payment.reference,
      notes: payment.notes,
    })),
    exchangeOrigins: sale.exchangeCreditUsages.map((usage) => ({
      exchangeCreditId: usage.exchangeCreditId,
      returnNumber: usage.exchangeCredit.returnOrder.returnNumber,
      amount: Number(usage.amount),
      originalAmount: Number(usage.exchangeCredit.originalAmount),
      balance: Number(usage.exchangeCredit.balance),
      status: usage.exchangeCredit.status,
      refundedAmount: Number(usage.exchangeCredit.refundedAmount),
      returnedUnits: usage.exchangeCredit.returnOrder.items
        .filter((returnItem) => Boolean(returnItem.productUnit))
        .map((returnItem) => {
          const identifiers = returnItem.productUnit?.identifiers ?? [];
          return {
            id: returnItem.productUnitId,
            product: returnItem.product.name,
            identifier:
              identifiers.find((identifier) => identifier.type === "IMEI_1")?.value
              ?? identifiers.find((identifier) => identifier.type === "SERIAL")?.value
              ?? returnItem.productUnitId
              ?? "Sin identificador",
          };
        }),
    })),
    returns: sale.returnOrders.map((order) => ({
      id: order.id,
      returnNumber: order.returnNumber,
      type: order.type,
      reason: order.reason,
      refundMethod: order.refundMethod,
      refundAmount: Number(order.refundAmount),
      createdAt: order.createdAt.toISOString(),
      quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
      value: order.items.reduce((sum, item) => sum + Number(item.amount), 0),
      serializedCount: order.items.filter((item) => Boolean(item.productUnitId)).length,
      exchangeCredit: order.exchangeCredit
        ? {
            id: order.exchangeCredit.id,
            originalAmount: Number(order.exchangeCredit.originalAmount),
            balance: Number(order.exchangeCredit.balance),
            status: order.exchangeCredit.status,
            refundedAmount: Number(order.exchangeCredit.refundedAmount),
          }
        : null,
    })),
    serviceOrders: sale.serviceOrders.map((order) => ({
      id: order.id,
      serviceNumber: order.serviceNumber,
      serviceType: order.serviceType,
      status: order.status,
      deviceName: order.deviceName,
      identifier: order.identifier,
      warrantyCovered: order.warrantyCovered,
      reportedIssue: order.reportedIssue,
      receivedAt: order.receivedAt.toISOString(),
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      finalCost: Number(order.finalCost),
    })),
  };
}
