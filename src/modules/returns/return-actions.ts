"use server";

import { randomUUID } from "node:crypto";
import { requirePermission } from "@/lib/business-context";
import { lockInventoryBalance } from "@/lib/inventory-lock";
import { roundMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { revalidatePaths } from "@/lib/revalidation";

const REFUND_METHODS = new Set(["CASH", "YAPE", "PLIN", "CARD", "TRANSFER", "CREDIT", "OTHER"] as const);
const EXCHANGE_REFUND_METHODS = new Set(["CASH", "YAPE", "PLIN", "CARD", "TRANSFER", "OTHER"] as const);
const RETURN_PATHS = [
  "/devoluciones",
  "/ventas",
  "/clientes",
  "/productos",
  "/equipos",
  "/kardex",
  "/caja",
  "/reportes",
] as const;

type RefundMethod = "CASH" | "YAPE" | "PLIN" | "CARD" | "TRANSFER" | "CREDIT" | "OTHER";
type ExchangeRefundMethod = "CASH" | "YAPE" | "PLIN" | "CARD" | "TRANSFER" | "OTHER";
type ReturnType = "RETURN" | "EXCHANGE";
type ReturnDisposition = "RESTOCK" | "QUARANTINE" | "DAMAGED";

const RETURN_DISPOSITIONS = new Set<ReturnDisposition>([
  "RESTOCK",
  "QUARANTINE",
  "DAMAGED",
]);

type CreateReturnInput = {
  saleId: string;
  type: ReturnType;
  reason: string;
  refundMethod?: string;
  notes?: string;
  items: Array<{
    saleItemId: string;
    quantity: number;
    productUnitId?: string;
    disposition?: ReturnDisposition;
  }>;
};

type ReceivableLockRow = {
  id: string;
  originalAmount: unknown;
  paidAmount: unknown;
  balance: unknown;
  notes: string | null;
};

type CashSessionRow = { id: string };

async function returnedQuantityMap(
  client: Pick<typeof prisma, "returnItem">,
  companyId: string,
  saleId: string,
) {
  const rows = await client.returnItem.groupBy({
    by: ["saleItemId"],
    where: {
      returnOrder: {
        companyId,
        saleId,
        status: "COMPLETED",
      },
    },
    _sum: { quantity: true },
  });

  return new Map(rows.map((row) => [row.saleItemId, Number(row._sum.quantity ?? 0)]));
}

export async function createReturnAction(input: CreateReturnInput) {
  const { company, membership } = await requirePermission("returns.manage");
  const reason = input.reason?.trim();

  if (!input.saleId || !input.items.length) {
    throw new Error("Selecciona la venta y al menos un producto.");
  }
  if (!reason || reason.length < 4) {
    throw new Error("Indica el motivo de la devolución o cambio.");
  }
  if (input.type !== "RETURN" && input.type !== "EXCHANGE") {
    throw new Error("El tipo de operación no es válido.");
  }
  if (input.type === "RETURN" && !REFUND_METHODS.has(input.refundMethod as RefundMethod)) {
    throw new Error("Selecciona el medio por el que se devolverá el dinero.");
  }

  const sale = await prisma.sale.findFirst({
    where: { id: input.saleId, companyId: company.id, status: "COMPLETED" },
    include: {
      items: {
        include: {
          product: true,
          units: {
            include: {
              productUnit: {
                include: {
                  serviceOrders: {
                    where: {
                      companyId: company.id,
                      status: { notIn: ["DELIVERED", "CANCELLED"] },
                    },
                    select: { id: true },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!sale) throw new Error("La venta ya no está disponible para devolución.");

  const itemMap = new Map(sale.items.map((item) => [item.id, item]));
  const requestedItemIds = input.items.map((item) => item.saleItemId);
  if (new Set(requestedItemIds).size !== requestedItemIds.length) {
    throw new Error("No repitas una misma línea de venta.");
  }

  const priorMap = await returnedQuantityMap(prisma, company.id, sale.id);

  let merchandiseAmount = 0;
  const validated = input.items.map((line) => {
    const item = itemMap.get(line.saleItemId);
    if (!item) throw new Error("Uno de los productos no pertenece a la venta seleccionada.");

    const remaining = item.quantity - (priorMap.get(item.id) ?? 0);
    if (!Number.isInteger(line.quantity) || line.quantity <= 0 || line.quantity > remaining) {
      throw new Error(`Cantidad inválida para ${item.product.name}. Disponible para devolver: ${remaining}.`);
    }

    const serialized = item.product.type === "PHONE" || item.product.type === "SERIALIZED";
    let unitId: string | null = null;
    let disposition: ReturnDisposition = "RESTOCK";

    if (serialized) {
      if (line.quantity !== 1 || !line.productUnitId) {
        throw new Error(`Selecciona el IMEI/serie exacto de ${item.product.name}.`);
      }

      const link = item.units.find((unit) => unit.productUnitId === line.productUnitId);
      if (!link || link.productUnit.status !== "SOLD") {
        throw new Error(`El IMEI de ${item.product.name} no está disponible para devolución.`);
      }
      if (link.productUnit.serviceOrders.length) {
        throw new Error(
          `El IMEI de ${item.product.name} tiene una atención de postventa abierta. Ciérrala antes de registrar una devolución o cambio.`,
        );
      }

      disposition = line.disposition ?? "QUARANTINE";
      if (!RETURN_DISPOSITIONS.has(disposition)) {
        throw new Error("Selecciona qué ocurrirá con el equipo que regresa.");
      }
      unitId = line.productUnitId;
    }

    const amount = roundMoney((Number(item.total) / item.quantity) * line.quantity);
    merchandiseAmount = roundMoney(merchandiseAmount + amount);
    return { item, quantity: line.quantity, unitId, amount, disposition };
  });

  const refundAmount = input.type === "RETURN" ? merchandiseAmount : 0;

  const result = await prisma.$transaction(async (tx) => {
    const saleLock = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "sales"
      WHERE "id" = ${sale.id}
        AND "companyId" = ${company.id}
        AND "status" = 'COMPLETED'::"SaleStatus"
      FOR UPDATE
    `;
    if (!saleLock.length) {
      throw new Error("La venta cambió de estado durante la devolución.");
    }

    const currentPriorMap = await returnedQuantityMap(tx, company.id, sale.id);
    for (const row of validated) {
      const remaining = row.item.quantity - (currentPriorMap.get(row.item.id) ?? 0);
      if (row.quantity > remaining) {
        throw new Error(`La cantidad disponible para devolver de ${row.item.product.name} cambió. Actualiza la pantalla.`);
      }
    }

    let cashSessionId: string | null = null;
    if (input.type === "RETURN" && input.refundMethod === "CASH") {
      const sessions = await tx.$queryRaw<CashSessionRow[]>`
        SELECT "id"
        FROM "cash_sessions"
        WHERE "companyId" = ${company.id}
          AND "branchId" = ${sale.branchId}
          AND "userId" = ${membership.userId}
          AND "status" = 'OPEN'::"CashSessionStatus"
        ORDER BY "openedAt" DESC
        LIMIT 1
        FOR UPDATE
      `;
      const session = sessions[0];
      if (!session) {
        throw new Error("Para devolver dinero en efectivo debes tener una caja abierta en la sucursal de la venta.");
      }
      cashSessionId = session.id;
    }

    let creditReceivable: ReceivableLockRow | null = null;
    if (input.type === "RETURN" && input.refundMethod === "CREDIT") {
      const rows = await tx.$queryRaw<ReceivableLockRow[]>`
        SELECT "id", "originalAmount", "paidAmount", "balance", "notes"
        FROM "accounts_receivable"
        WHERE "companyId" = ${company.id}
          AND "saleId" = ${sale.id}
          AND "status" IN ('OPEN','PARTIAL')
        LIMIT 1
        FOR UPDATE
      `;
      creditReceivable = rows[0] ?? null;
      if (!creditReceivable) {
        throw new Error("Esta venta no tiene una cuenta por cobrar pendiente donde aplicar la devolución.");
      }

      const pending = roundMoney(Number(creditReceivable.balance));
      if (refundAmount > pending + 0.01) {
        throw new Error(`El saldo pendiente del crédito es S/ ${pending.toFixed(2)}. Para devolver un importe mayor utiliza otro medio de devolución.`);
      }
    }

    await tx.$queryRaw<Array<{ locked: number }>>`
      WITH lock_row AS (
        SELECT pg_advisory_xact_lock(hashtext(${`${company.id}:return-order`}))
      )
      SELECT 1::int AS "locked" FROM lock_row
    `;
    const sequence = await tx.$queryRaw<Array<{ next: unknown }>>`
      SELECT COALESCE(MAX(CAST(SPLIT_PART("returnNumber", '-', 2) AS INTEGER)), 0) + 1 AS "next"
      FROM "return_orders"
      WHERE "companyId" = ${company.id}
    `;
    const returnNumber = `DV001-${String(Number(sequence[0]?.next ?? 1)).padStart(6, "0")}`;
    const returnId = randomUUID();

    await tx.returnOrder.create({
      data: {
        id: returnId,
        companyId: company.id,
        saleId: sale.id,
        customerId: sale.customerId,
        warehouseId: sale.warehouseId,
        returnNumber,
        type: input.type,
        status: "COMPLETED",
        reason,
        refundMethod: input.type === "RETURN" ? input.refundMethod || null : null,
        refundAmount,
        notes: input.notes?.trim() || null,
        createdById: membership.userId,
      },
    });

    let exchangeCreditId: string | null = null;
    if (input.type === "EXCHANGE") {
      exchangeCreditId = randomUUID();
      await tx.exchangeCredit.create({
        data: {
          id: exchangeCreditId,
          companyId: company.id,
          returnOrderId: returnId,
          customerId: sale.customerId,
          originalAmount: merchandiseAmount,
          balance: merchandiseAmount,
          status: "OPEN",
        },
      });
    }

    for (const row of validated) {
      await tx.returnItem.create({
        data: {
          id: randomUUID(),
          returnOrderId: returnId,
          saleItemId: row.item.id,
          productId: row.item.productId,
          variantId: row.item.variantId,
          productUnitId: row.unitId,
          disposition: row.disposition,
          quantity: row.quantity,
          unitPrice: Number(row.item.unitPrice),
          unitCost: Number(row.item.unitCost),
          amount: row.amount,
        },
      });

      if (row.unitId) {
        const targetStatus = row.disposition === "RESTOCK"
          ? "AVAILABLE"
          : row.disposition === "DAMAGED"
            ? "DAMAGED"
            : "RETURNED";

        const updated = await tx.productUnit.updateMany({
          where: { id: row.unitId, companyId: company.id, status: "SOLD" },
          data: { status: targetStatus, warehouseId: sale.warehouseId },
        });
        if (updated.count !== 1) {
          throw new Error("El estado del IMEI cambió durante la devolución.");
        }

        const dispositionLabel = row.disposition === "RESTOCK"
          ? "disponible para venta"
          : row.disposition === "DAMAGED"
            ? "dañado / no vendible"
            : "en revisión";

        await tx.inventoryMovement.create({
          data: {
            companyId: company.id,
            warehouseId: sale.warehouseId,
            productId: row.item.productId,
            variantId: row.item.variantId,
            productUnitId: row.unitId,
            movementType: "RETURN_IN",
            quantity: 1,
            unitCost: Number(row.item.unitCost),
            referenceType: "RETURN",
            referenceId: returnId,
            notes: `Reingreso por ${input.type === "EXCHANGE" ? "cambio" : "devolución"} ${returnNumber} · ${dispositionLabel}`,
            createdById: membership.userId,
          },
        });
      } else if (row.item.product.type === "ACCESSORY") {
        await lockInventoryBalance(tx, company.id, sale.warehouseId, row.item.variantId);
        const balance = await tx.inventoryBalance.findUnique({
          where: {
            companyId_warehouseId_variantId: {
              companyId: company.id,
              warehouseId: sale.warehouseId,
              variantId: row.item.variantId,
            },
          },
        });
        const oldQty = Number(balance?.quantity ?? 0);
        const oldAverage = Number(balance?.averageCost ?? 0);
        const newQty = oldQty + row.quantity;
        const unitCost = Number(row.item.unitCost);
        const newAverage = newQty > 0
          ? roundMoney((oldQty * oldAverage + row.quantity * unitCost) / newQty)
          : unitCost;

        await tx.inventoryBalance.upsert({
          where: {
            companyId_warehouseId_variantId: {
              companyId: company.id,
              warehouseId: sale.warehouseId,
              variantId: row.item.variantId,
            },
          },
          update: { quantity: newQty, averageCost: newAverage },
          create: {
            companyId: company.id,
            warehouseId: sale.warehouseId,
            productId: row.item.productId,
            variantId: row.item.variantId,
            quantity: row.quantity,
            averageCost: unitCost,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            companyId: company.id,
            warehouseId: sale.warehouseId,
            productId: row.item.productId,
            variantId: row.item.variantId,
            movementType: "RETURN_IN",
            quantity: row.quantity,
            unitCost,
            referenceType: "RETURN",
            referenceId: returnId,
            notes: `Reingreso por ${input.type === "EXCHANGE" ? "cambio" : "devolución"} ${returnNumber}`,
            createdById: membership.userId,
          },
        });
      }
    }

    if (input.type === "RETURN" && input.refundMethod === "CASH" && cashSessionId) {
      await tx.cashMovement.create({
        data: {
          companyId: company.id,
          cashSessionId,
          type: "EXPENSE",
          amount: refundAmount,
          concept: `Devolución ${returnNumber} · Venta ${sale.saleNumber}`,
          reference: returnId,
          createdById: membership.userId,
        },
      });
    }

    if (input.type === "RETURN" && input.refundMethod === "CREDIT" && creditReceivable) {
      const previousBalance = roundMoney(Number(creditReceivable.balance));
      const previousOriginal = roundMoney(Number(creditReceivable.originalAmount));
      const paidAmount = roundMoney(Number(creditReceivable.paidAmount));
      const newBalance = roundMoney(Math.max(0, previousBalance - refundAmount));
      const newOriginal = roundMoney(Math.max(paidAmount, previousOriginal - refundAmount));
      const newStatus = newBalance <= 0.01 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "OPEN";
      const adjustment = `Ajuste por devolución ${returnNumber}: -S/ ${refundAmount.toFixed(2)}`;
      const notes = [creditReceivable.notes?.trim(), adjustment].filter(Boolean).join(" | ");

      await tx.accountReceivable.update({
        where: { id: creditReceivable.id },
        data: {
          originalAmount: newOriginal,
          balance: newBalance,
          status: newStatus,
          notes,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "CREATE",
        entity: "RETURN_ORDER",
        entityId: returnId,
        newValues: {
          returnNumber,
          type: input.type,
          saleId: sale.id,
          merchandiseAmount,
          refundAmount,
          refundMethod: input.type === "RETURN" ? input.refundMethod || null : null,
          reason,
          itemDispositions: validated
            .filter((row) => Boolean(row.unitId))
            .map((row) => ({
              productUnitId: row.unitId,
              disposition: row.disposition,
            })),
        },
      },
    });

    return {
      id: returnId,
      returnNumber,
      amount: refundAmount,
      merchandiseAmount,
      exchangeCreditId,
    };
  });

  revalidatePaths(RETURN_PATHS);
  if (sale.customerId) revalidatePaths([`/clientes/${sale.customerId}`]);
  return result;
}


type ExchangeCreditRefundLockRow = {
  id: string;
  balance: unknown;
  status: string;
  returnNumber: string;
  saleNumber: string;
  branchId: string;
};

export async function refundExchangeCreditAction(input: {
  exchangeCreditId: string;
  method: ExchangeRefundMethod;
  reference?: string;
}) {
  const { company, membership } = await requirePermission("returns.manage");
  const exchangeCreditId = input.exchangeCreditId?.trim();
  const reference = input.reference?.trim() || null;

  if (!exchangeCreditId) throw new Error("No se identificó el vale de cambio.");
  if (!EXCHANGE_REFUND_METHODS.has(input.method)) {
    throw new Error("Selecciona un medio válido para devolver el saldo.");
  }
  if (["YAPE", "PLIN", "CARD", "TRANSFER"].includes(input.method) && !reference) {
    throw new Error("Ingresa el número de operación o referencia de la devolución.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ExchangeCreditRefundLockRow[]>`
      SELECT ec."id", ec."balance", ec."status",
             ro."returnNumber", s."saleNumber", s."branchId"
      FROM "exchange_credits" ec
      JOIN "return_orders" ro ON ro."id" = ec."returnOrderId"
      JOIN "sales" s ON s."id" = ro."saleId"
      WHERE ec."id" = ${exchangeCreditId}
        AND ec."companyId" = ${company.id}
        AND ec."status" IN ('OPEN','PARTIAL')
      LIMIT 1
      FOR UPDATE OF ec
    `;

    const credit = rows[0];
    if (!credit) {
      throw new Error("El vale ya fue utilizado, reembolsado o no está disponible.");
    }

    const amount = roundMoney(Number(credit.balance ?? 0));
    if (amount <= 0.01) throw new Error("El vale ya no tiene saldo por devolver.");

    let cashSessionId: string | null = null;
    if (input.method === "CASH") {
      const sessions = await tx.$queryRaw<CashSessionRow[]>`
        SELECT "id"
        FROM "cash_sessions"
        WHERE "companyId" = ${company.id}
          AND "branchId" = ${credit.branchId}
          AND "userId" = ${membership.userId}
          AND "status" = 'OPEN'::"CashSessionStatus"
        ORDER BY "openedAt" DESC
        LIMIT 1
        FOR UPDATE
      `;
      cashSessionId = sessions[0]?.id ?? null;
      if (!cashSessionId) {
        throw new Error("Para devolver el saldo en efectivo debes tener una caja abierta en la sucursal de la venta original.");
      }

      await tx.cashMovement.create({
        data: {
          companyId: company.id,
          cashSessionId,
          type: "EXPENSE",
          amount,
          concept: `Devolución de saldo de vale ${credit.returnNumber}`,
          reference: exchangeCreditId,
          createdById: membership.userId,
        },
      });
    }

    await tx.exchangeCredit.update({
      where: { id: exchangeCreditId },
      data: {
        balance: 0,
        status: "USED",
        refundedAmount: amount,
        refundMethod: input.method,
        refundReference: reference,
        refundedAt: new Date(),
        refundedById: membership.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "UPDATE",
        entity: "EXCHANGE_CREDIT",
        entityId: exchangeCreditId,
        oldValues: {
          status: credit.status,
          balance: amount,
        },
        newValues: {
          status: "USED",
          balance: 0,
          refundedAmount: amount,
          refundMethod: input.method,
          refundReference: reference,
          returnNumber: credit.returnNumber,
          saleNumber: credit.saleNumber,
          cashSessionId,
        },
      },
    });

    return {
      id: exchangeCreditId,
      amount,
      method: input.method,
      returnNumber: credit.returnNumber,
    };
  });

  revalidatePaths(["/devoluciones", "/caja", "/reportes", "/pos"]);
  return result;
}
