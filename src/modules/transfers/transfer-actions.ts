"use server";

import { randomUUID } from "node:crypto";
import { requirePermission } from "@/lib/business-context";
import { lockInventoryBalance } from "@/lib/inventory-lock";
import { roundMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { revalidatePaths } from "@/lib/revalidation";

const TRANSFER_PATHS = ["/transferencias", "/productos", "/equipos", "/kardex", "/reportes"] as const;

type CreateTransferInput = {
  fromWarehouseId: string;
  toWarehouseId: string;
  notes?: string;
  lines: Array<{ variantId: string; quantity: number; unitIds?: string[] }>;
};

function refreshTransfers() {
  revalidatePaths(TRANSFER_PATHS);
}

export async function createTransferAction(input: CreateTransferInput) {
  const { company, membership } = await requirePermission("inventory.transfer");

  if (!input.fromWarehouseId || !input.toWarehouseId || input.fromWarehouseId === input.toWarehouseId) {
    throw new Error("Selecciona almacenes de origen y destino diferentes.");
  }
  if (!input.lines.length) throw new Error("Agrega al menos un producto a la transferencia.");

  const warehouses = await prisma.warehouse.findMany({
    where: {
      companyId: company.id,
      id: { in: [input.fromWarehouseId, input.toWarehouseId] },
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (warehouses.length !== 2) throw new Error("Uno de los almacenes ya no está disponible.");

  const variantIds = [...new Set(input.lines.map((line) => line.variantId))];
  const variants = await prisma.productVariant.findMany({
    where: { companyId: company.id, id: { in: variantIds }, status: "ACTIVE" },
    include: { product: true },
  });
  if (variants.length !== variantIds.length) {
    throw new Error("Uno de los productos ya no está disponible.");
  }
  const variantMap = new Map(variants.map((variant) => [variant.id, variant]));

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ locked: number }>>`
      WITH lock_row AS (
        SELECT pg_advisory_xact_lock(hashtext(${`${company.id}:stock-transfer`}))
      )
      SELECT 1::int AS "locked" FROM lock_row
    `;

    const sequence = await tx.$queryRaw<Array<{ next: unknown }>>`
      SELECT COALESCE(MAX(CAST(SPLIT_PART("transferNumber", '-', 2) AS INTEGER)), 0) + 1 AS "next"
      FROM "stock_transfers"
      WHERE "companyId" = ${company.id}
    `;
    const transferNumber = `TR001-${String(Number(sequence[0]?.next ?? 1)).padStart(6, "0")}`;
    const transferId = randomUUID();

    await tx.stockTransfer.create({
      data: {
        id: transferId,
        companyId: company.id,
        transferNumber,
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        status: "IN_TRANSIT",
        notes: input.notes?.trim() || null,
        createdById: membership.userId,
        sentAt: new Date(),
      },
    });

    for (const line of input.lines) {
      const variant = variantMap.get(line.variantId);
      if (!variant) throw new Error("Producto inválido en la transferencia.");
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new Error(`Cantidad inválida para ${variant.product.name}.`);
      }

      const serialized = variant.product.type === "PHONE" || variant.product.type === "SERIALIZED";
      if (serialized) {
        const ids = line.unitIds ?? [];
        if (ids.length !== line.quantity || new Set(ids).size !== ids.length) {
          throw new Error(`Selecciona ${line.quantity} IMEI/serie para ${variant.product.name}.`);
        }

        const units = await tx.productUnit.findMany({
          where: {
            id: { in: ids },
            companyId: company.id,
            warehouseId: input.fromWarehouseId,
            variantId: line.variantId,
            status: "AVAILABLE",
          },
        });
        if (units.length !== ids.length) {
          throw new Error(`Uno de los equipos de ${variant.product.name} ya no está disponible en origen.`);
        }

        for (const unit of units) {
          const updated = await tx.productUnit.updateMany({
            where: {
              id: unit.id,
              companyId: company.id,
              status: "AVAILABLE",
              warehouseId: input.fromWarehouseId,
            },
            data: { status: "IN_TRANSFER" },
          });
          if (updated.count !== 1) {
            throw new Error("Un IMEI cambió de estado durante la transferencia.");
          }

          await tx.stockTransferItem.create({
            data: {
              id: randomUUID(),
              transferId,
              productId: variant.productId,
              variantId: variant.id,
              productUnitId: unit.id,
              quantity: 1,
              unitCost: Number(unit.purchaseCost),
            },
          });

          await tx.inventoryMovement.create({
            data: {
              companyId: company.id,
              warehouseId: input.fromWarehouseId,
              productId: variant.productId,
              variantId: variant.id,
              productUnitId: unit.id,
              movementType: "TRANSFER_OUT",
              quantity: 1,
              unitCost: Number(unit.purchaseCost),
              referenceType: "TRANSFER",
              referenceId: transferId,
              notes: `Salida transferencia ${transferNumber}`,
              createdById: membership.userId,
            },
          });
        }
      } else {
        await lockInventoryBalance(tx, company.id, input.fromWarehouseId, variant.id);
        const balance = await tx.inventoryBalance.findUnique({
          where: {
            companyId_warehouseId_variantId: {
              companyId: company.id,
              warehouseId: input.fromWarehouseId,
              variantId: variant.id,
            },
          },
        });
        if (!balance || Number(balance.quantity) < line.quantity) {
          throw new Error(`Stock insuficiente de ${variant.product.name} en almacén origen.`);
        }

        const updated = await tx.inventoryBalance.updateMany({
          where: { id: balance.id, quantity: { gte: line.quantity } },
          data: { quantity: { decrement: line.quantity } },
        });
        if (updated.count !== 1) {
          throw new Error(`Stock insuficiente de ${variant.product.name}.`);
        }

        await tx.stockTransferItem.create({
          data: {
            id: randomUUID(),
            transferId,
            productId: variant.productId,
            variantId: variant.id,
            productUnitId: null,
            quantity: line.quantity,
            unitCost: Number(balance.averageCost),
          },
        });

        await tx.inventoryMovement.create({
          data: {
            companyId: company.id,
            warehouseId: input.fromWarehouseId,
            productId: variant.productId,
            variantId: variant.id,
            movementType: "TRANSFER_OUT",
            quantity: line.quantity,
            unitCost: Number(balance.averageCost),
            referenceType: "TRANSFER",
            referenceId: transferId,
            notes: `Salida transferencia ${transferNumber}`,
            createdById: membership.userId,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "CREATE",
        entity: "STOCK_TRANSFER",
        entityId: transferId,
        newValues: {
          transferNumber,
          fromWarehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          status: "IN_TRANSIT",
        },
      },
    });

    return { id: transferId, transferNumber };
  });

  refreshTransfers();
  return result;
}

export async function receiveTransferAction(transferId: string) {
  const { company, membership } = await requirePermission("inventory.transfer");

  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "stock_transfers"
      WHERE "id" = ${transferId} AND "companyId" = ${company.id}
      LIMIT 1
      FOR UPDATE
    `;
    if (!locked.length) throw new Error("La transferencia ya no existe.");

    const header = await tx.stockTransfer.findFirst({
      where: { id: transferId, companyId: company.id },
      include: { items: true },
    });
    if (!header) throw new Error("La transferencia ya no existe.");
    if (header.status !== "IN_TRANSIT") {
      throw new Error("Solo se pueden recibir transferencias en tránsito.");
    }

    for (const item of header.items) {
      const cost = Number(item.unitCost);
      if (item.productUnitId) {
        const updated = await tx.productUnit.updateMany({
          where: {
            id: item.productUnitId,
            companyId: company.id,
            status: "IN_TRANSFER",
            warehouseId: header.fromWarehouseId,
          },
          data: { warehouseId: header.toWarehouseId, status: "AVAILABLE" },
        });
        if (updated.count !== 1) throw new Error("Un IMEI ya no está en tránsito.");

        await tx.inventoryMovement.create({
          data: {
            companyId: company.id,
            warehouseId: header.toWarehouseId,
            productId: item.productId,
            variantId: item.variantId,
            productUnitId: item.productUnitId,
            movementType: "TRANSFER_IN",
            quantity: 1,
            unitCost: cost,
            referenceType: "TRANSFER",
            referenceId: header.id,
            notes: `Recepción transferencia ${header.transferNumber}`,
            createdById: membership.userId,
          },
        });
      } else {
        await lockInventoryBalance(tx, company.id, header.toWarehouseId, item.variantId);
        const balance = await tx.inventoryBalance.findUnique({
          where: {
            companyId_warehouseId_variantId: {
              companyId: company.id,
              warehouseId: header.toWarehouseId,
              variantId: item.variantId,
            },
          },
        });
        const oldQty = Number(balance?.quantity ?? 0);
        const oldAverage = Number(balance?.averageCost ?? 0);
        const newQty = oldQty + item.quantity;
        const newAverage = newQty > 0
          ? roundMoney((oldQty * oldAverage + item.quantity * cost) / newQty)
          : cost;

        await tx.inventoryBalance.upsert({
          where: {
            companyId_warehouseId_variantId: {
              companyId: company.id,
              warehouseId: header.toWarehouseId,
              variantId: item.variantId,
            },
          },
          update: { quantity: newQty, averageCost: newAverage },
          create: {
            companyId: company.id,
            warehouseId: header.toWarehouseId,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            averageCost: cost,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            companyId: company.id,
            warehouseId: header.toWarehouseId,
            productId: item.productId,
            variantId: item.variantId,
            movementType: "TRANSFER_IN",
            quantity: item.quantity,
            unitCost: cost,
            referenceType: "TRANSFER",
            referenceId: header.id,
            notes: `Recepción transferencia ${header.transferNumber}`,
            createdById: membership.userId,
          },
        });
      }
    }

    const changed = await tx.stockTransfer.updateMany({
      where: { id: header.id, companyId: company.id, status: "IN_TRANSIT" },
      data: {
        status: "RECEIVED",
        receivedById: membership.userId,
        receivedAt: new Date(),
      },
    });
    if (changed.count !== 1) {
      throw new Error("La transferencia fue recibida por otro usuario.");
    }

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "UPDATE",
        entity: "STOCK_TRANSFER",
        entityId: header.id,
        oldValues: { status: "IN_TRANSIT" },
        newValues: { status: "RECEIVED" },
      },
    });

    return { id: header.id };
  });

  refreshTransfers();
  return result;
}

export async function cancelTransferAction(transferId: string) {
  const { company, membership } = await requirePermission("inventory.transfer");

  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "stock_transfers"
      WHERE "id" = ${transferId} AND "companyId" = ${company.id}
      LIMIT 1
      FOR UPDATE
    `;
    if (!locked.length) {
      throw new Error("Solo se puede cancelar una transferencia en tránsito.");
    }

    const header = await tx.stockTransfer.findFirst({
      where: { id: transferId, companyId: company.id },
      include: { items: true },
    });
    if (!header || header.status !== "IN_TRANSIT") {
      throw new Error("Solo se puede cancelar una transferencia en tránsito.");
    }

    for (const item of header.items) {
      const cost = Number(item.unitCost);
      if (item.productUnitId) {
        const updated = await tx.productUnit.updateMany({
          where: {
            id: item.productUnitId,
            companyId: company.id,
            status: "IN_TRANSFER",
            warehouseId: header.fromWarehouseId,
          },
          data: { status: "AVAILABLE" },
        });
        if (updated.count !== 1) {
          throw new Error("Un IMEI ya no se encuentra en tránsito.");
        }
      } else {
        await lockInventoryBalance(tx, company.id, header.fromWarehouseId, item.variantId);
        const balance = await tx.inventoryBalance.findUnique({
          where: {
            companyId_warehouseId_variantId: {
              companyId: company.id,
              warehouseId: header.fromWarehouseId,
              variantId: item.variantId,
            },
          },
        });
        const oldQty = Number(balance?.quantity ?? 0);
        const oldAverage = Number(balance?.averageCost ?? 0);
        const newQty = oldQty + item.quantity;
        const newAverage = newQty > 0
          ? roundMoney((oldQty * oldAverage + item.quantity * cost) / newQty)
          : cost;

        await tx.inventoryBalance.upsert({
          where: {
            companyId_warehouseId_variantId: {
              companyId: company.id,
              warehouseId: header.fromWarehouseId,
              variantId: item.variantId,
            },
          },
          update: { quantity: newQty, averageCost: newAverage },
          create: {
            companyId: company.id,
            warehouseId: header.fromWarehouseId,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            averageCost: cost,
          },
        });
      }

      await tx.inventoryMovement.create({
        data: {
          companyId: company.id,
          warehouseId: header.fromWarehouseId,
          productId: item.productId,
          variantId: item.variantId,
          productUnitId: item.productUnitId,
          movementType: "TRANSFER_IN",
          quantity: item.quantity,
          unitCost: cost,
          referenceType: "TRANSFER_CANCEL",
          referenceId: header.id,
          notes: `Anulación transferencia ${header.transferNumber}`,
          createdById: membership.userId,
        },
      });
    }

    const changed = await tx.stockTransfer.updateMany({
      where: { id: header.id, companyId: company.id, status: "IN_TRANSIT" },
      data: { status: "CANCELLED" },
    });
    if (changed.count !== 1) {
      throw new Error("La transferencia cambió de estado durante la cancelación.");
    }

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "CANCEL",
        entity: "STOCK_TRANSFER",
        entityId: header.id,
        oldValues: { status: "IN_TRANSIT" },
        newValues: { status: "CANCELLED" },
      },
    });

    return { id: header.id };
  });

  refreshTransfers();
  return result;
}
