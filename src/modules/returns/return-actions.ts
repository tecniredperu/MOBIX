"use server";

import { randomUUID } from "node:crypto";
import { requirePermission } from "@/lib/business-context";
import { lockInventoryBalance } from "@/lib/inventory-lock";
import { roundMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { revalidatePaths } from "@/lib/revalidation";

const REFUND_METHODS = new Set(["CASH", "YAPE", "PLIN", "CARD", "TRANSFER", "CREDIT", "OTHER"] as const);
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
type ReturnType = "RETURN" | "EXCHANGE";

type CreateReturnInput = {
  saleId: string;
  type: ReturnType;
  reason: string;
  refundMethod?: string;
  notes?: string;
  items: Array<{ saleItemId: string; quantity: number; productUnitId?: string }>;
};

type PriorReturnRow = { saleItemId: string; qty: bigint };
type ReceivableRow = { id: string; originalAmount: unknown; paidAmount: unknown; balance: unknown };
type CashSessionRow = { id: string };

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
          units: { include: { productUnit: true } },
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

  const prior = await prisma.$queryRaw<PriorReturnRow[]>`
    SELECT ri."saleItemId", COALESCE(SUM(ri."quantity"), 0)::bigint AS "qty"
    FROM "return_items" ri
    JOIN "return_orders" ro ON ro."id" = ri."returnOrderId"
    WHERE ro."companyId" = ${company.id}
      AND ro."saleId" = ${sale.id}
      AND ro."status" = 'COMPLETED'
    GROUP BY ri."saleItemId"
  `;
  const priorMap = new Map(prior.map((row) => [row.saleItemId, Number(row.qty)]));

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
    if (serialized) {
      if (line.quantity !== 1 || !line.productUnitId) {
        throw new Error(`Selecciona el IMEI/serie exacto de ${item.product.name}.`);
      }
      const link = item.units.find((unit) => unit.productUnitId === line.productUnitId);
      if (!link || link.productUnit.status !== "SOLD") {
        throw new Error(`El IMEI de ${item.product.name} no está disponible para devolución.`);
      }
      unitId = line.productUnitId;
    }

    const amount = roundMoney((Number(item.total) / item.quantity) * line.quantity);
    merchandiseAmount = roundMoney(merchandiseAmount + amount);
    return { item, quantity: line.quantity, unitId, amount };
  });

  // Un cambio reingresa mercadería, pero no representa una salida de dinero.
  // El reemplazo se registra como una nueva venta para conservar la trazabilidad.
  const refundAmount = input.type === "RETURN" ? merchandiseAmount : 0;

  const result = await prisma.$transaction(async (tx) => {
    // Serializa devoluciones sobre la misma venta. Esto evita que dos usuarios
    // devuelvan simultáneamente más unidades de las que se vendieron.
    const saleLock = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "sales"
      WHERE "id" = ${sale.id} AND "companyId" = ${company.id} AND "status" = 'COMPLETED'::"SaleStatus"
      FOR UPDATE
    `;
    if (!saleLock.length) throw new Error("La venta cambió de estado durante la devolución.");

    const currentPrior = await tx.$queryRaw<PriorReturnRow[]>`
      SELECT ri."saleItemId", COALESCE(SUM(ri."quantity"), 0)::bigint AS "qty"
      FROM "return_items" ri
      JOIN "return_orders" ro ON ro."id" = ri."returnOrderId"
      WHERE ro."companyId" = ${company.id}
        AND ro."saleId" = ${sale.id}
        AND ro."status" = 'COMPLETED'
      GROUP BY ri."saleItemId"
    `;
    const currentPriorMap = new Map(currentPrior.map((row) => [row.saleItemId, Number(row.qty)]));
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

    let creditReceivable: ReceivableRow | null = null;
    if (input.type === "RETURN" && input.refundMethod === "CREDIT") {
      const rows = await tx.$queryRaw<ReceivableRow[]>`
        SELECT "id", "originalAmount", "paidAmount", "balance"
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

    await tx.$executeRaw`
      INSERT INTO "return_orders" (
        "id", "companyId", "saleId", "customerId", "warehouseId", "returnNumber", "type", "status",
        "reason", "refundMethod", "refundAmount", "notes", "createdById", "createdAt"
      ) VALUES (
        ${returnId}, ${company.id}, ${sale.id}, ${sale.customerId}, ${sale.warehouseId}, ${returnNumber},
        ${input.type}, 'COMPLETED', ${reason}, ${input.type === "RETURN" ? input.refundMethod || null : null},
        ${refundAmount}, ${input.notes?.trim() || null}, ${membership.userId}, NOW()
      )
    `;

    for (const row of validated) {
      await tx.$executeRaw`
        INSERT INTO "return_items" (
          "id", "returnOrderId", "saleItemId", "productId", "variantId", "productUnitId",
          "quantity", "unitPrice", "unitCost", "amount", "createdAt"
        ) VALUES (
          ${randomUUID()}, ${returnId}, ${row.item.id}, ${row.item.productId}, ${row.item.variantId}, ${row.unitId},
          ${row.quantity}, ${Number(row.item.unitPrice)}, ${Number(row.item.unitCost)}, ${row.amount}, NOW()
        )
      `;

      if (row.unitId) {
        const updated = await tx.productUnit.updateMany({
          where: { id: row.unitId, companyId: company.id, status: "SOLD" },
          data: { status: "AVAILABLE", warehouseId: sale.warehouseId },
        });
        if (updated.count !== 1) throw new Error("El estado del IMEI cambió durante la devolución.");

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
            notes: `Reingreso por ${input.type === "EXCHANGE" ? "cambio" : "devolución"} ${returnNumber}`,
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

      await tx.$executeRaw`
        UPDATE "accounts_receivable"
        SET "originalAmount" = ${newOriginal},
            "balance" = ${newBalance},
            "status" = ${newStatus}::"AccountReceivableStatus",
            "updatedAt" = NOW(),
            "notes" = CONCAT(COALESCE("notes", ''), ${` | Ajuste por devolución ${returnNumber}: -S/ ${refundAmount.toFixed(2)}`})
        WHERE "id" = ${creditReceivable.id} AND "companyId" = ${company.id}
      `;
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
        },
      },
    });

    return { id: returnId, returnNumber, amount: refundAmount, merchandiseAmount };
  });

  revalidatePaths(RETURN_PATHS);
  if (sale.customerId) revalidatePaths([`/clientes/${sale.customerId}`]);
  return result;
}
