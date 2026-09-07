"use server";

import { createSaleAction } from "./sale-actions";
import type { CreateSaleInput } from "./sale-types";

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Adaptador de caja para el POS.
 *
 * El importe digitado en Efectivo representa el dinero que el cliente entrega.
 * Si entrega más que el total, MOBIX calcula el vuelto y registra en la venta
 * únicamente el efectivo neto que queda en caja. Los medios electrónicos no
 * pueden generar vuelto.
 */
export async function createSaleWithChangeAction(input: CreateSaleInput) {
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
    throw new Error(
      `Falta cobrar S/ ${money(total - tendered).toFixed(2)} para completar la venta.`,
    );
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
      return {
        ...payment,
        amount: money(received - changeFromThisPayment),
      };
    })
    .reverse()
    .filter((payment) => payment.amount > 0.009);

  const normalizedTotal = money(
    normalizedReversed.reduce((sum, payment) => sum + payment.amount, 0),
  );

  // Protección frente a diferencias de redondeo de un centavo.
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

  const result = await createSaleAction({
    ...input,
    payments: normalizedReversed,
  });

  return {
    ...result,
    tendered,
    change,
  };
}
