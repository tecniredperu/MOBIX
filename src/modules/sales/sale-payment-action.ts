"use server";

import { requirePermission } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";
import { createSaleAction } from "./sale-actions";
import type { CreateSaleInput } from "./sale-types";

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function assertCashPolicyForSale(warehouseId: string) {
  const { company, membership, settings } = await requirePermission("sales.create");

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, companyId: company.id, status: "ACTIVE", isSaleable: true },
    select: { branchId: true, branch: { select: { name: true } } },
  });
  if (!warehouse) throw new Error("El almacén seleccionado no está disponible para ventas.");

  if (!settings.requireCashSession) return null;

  const session = await prisma.cashSession.findFirst({
    where: {
      companyId: company.id,
      userId: membership.userId,
      status: "OPEN",
    },
    orderBy: { openedAt: "desc" },
    include: { branch: { select: { id: true, name: true } } },
  });

  if (!session) {
    throw new Error("Debes abrir Caja antes de confirmar una venta. Ve a Finanzas > Caja e inicia tu turno.");
  }
  if (session.branchId !== warehouse.branchId) {
    throw new Error(
      `Tu caja está abierta en ${session.branch.name}, pero la venta intenta salir de ${warehouse.branch.name}. Selecciona un almacén de la sucursal correcta o cierra y abre caja en la otra sucursal.`,
    );
  }

  return session.id;
}

/**
 * Adaptador de pago del POS.
 * El efectivo digitado representa el dinero recibido del cliente. Si supera el
 * total, MOBIX calcula el vuelto y registra como ingreso solamente el efectivo
 * neto que permanece en caja. La exigencia de turno de caja se rige por la
 * configuración empresarial y siempre usa al usuario autenticado.
 */
export async function createSaleWithChangeAction(input: CreateSaleInput) {
  await assertCashPolicyForSale(input.warehouseId);

  const gross = money(
    input.lines.reduce(
      (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0),
      0,
    ),
  );
  const discount = money(Number(input.discount || 0));
  const total = money(Math.max(0, gross - discount));

  const tendered = money(
    input.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  );

  if (tendered < total - 0.01) {
    throw new Error(`Falta cobrar S/ ${money(total - tendered).toFixed(2)} para completar la venta.`);
  }

  const change = money(Math.max(0, tendered - total));
  const cashReceived = money(
    input.payments
      .filter((payment) => payment.method === "CASH")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  );

  if (change > cashReceived + 0.01) {
    throw new Error(
      "El exceso de pago solo puede entregarse como vuelto cuando proviene de efectivo. Revisa los importes de Yape, Plin, tarjeta o transferencia.",
    );
  }

  let remainingChange = change;
  const normalizedReversed = [...input.payments]
    .reverse()
    .map((payment) => {
      const received = money(Number(payment.amount || 0));
      if (payment.method !== "CASH" || remainingChange <= 0) {
        return { ...payment, amount: received };
      }

      const changeFromThisPayment = Math.min(received, remainingChange);
      remainingChange = money(remainingChange - changeFromThisPayment);
      return { ...payment, amount: money(received - changeFromThisPayment) };
    })
    .reverse()
    .filter((payment) => payment.amount > 0.009);

  const normalizedTotal = money(
    normalizedReversed.reduce((sum, payment) => sum + payment.amount, 0),
  );

  const roundingDifference = money(total - normalizedTotal);
  if (Math.abs(roundingDifference) > 0 && Math.abs(roundingDifference) <= 0.01) {
    const cashIndex = normalizedReversed.findIndex((payment) => payment.method === "CASH");
    if (cashIndex >= 0) {
      normalizedReversed[cashIndex] = {
        ...normalizedReversed[cashIndex],
        amount: money(normalizedReversed[cashIndex].amount + roundingDifference),
      };
    }
  }

  const normalizedCheck = money(
    normalizedReversed.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  );
  if (Math.abs(normalizedCheck - total) > 0.01) {
    throw new Error("No se pudo cuadrar el pago con el total de la venta. Revisa los importes ingresados.");
  }

  const result = await createSaleAction({ ...input, payments: normalizedReversed });
  return { ...result, tendered, change };
}
