import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePaymentCoverage,
  calculateSaleTotals,
  calculateWeightedAverageCost,
} from "../../src/modules/sales/sales-calculations";

test("venta gravada desglosa IGV incluido sin alterar el total", () => {
  const result = calculateSaleTotals({
    lines: [{ quantity: 1, unitPrice: 118 }],
    taxCondition: "TAXED",
    taxRatePercent: 18,
  });

  assert.equal(result.gross, 118);
  assert.equal(result.subtotal, 100);
  assert.equal(result.tax, 18);
  assert.equal(result.total, 118);
});

test("operación exonerada no genera IGV", () => {
  const result = calculateSaleTotals({
    lines: [{ quantity: 2, unitPrice: 50 }],
    discount: 10,
    taxCondition: "EXEMPT",
  });

  assert.equal(result.gross, 100);
  assert.equal(result.discount, 10);
  assert.equal(result.subtotal, 90);
  assert.equal(result.tax, 0);
  assert.equal(result.total, 90);
});

test("pago mixto cubre exactamente una venta", () => {
  const result = calculatePaymentCoverage({
    total: 100,
    payments: [
      { method: "CASH", amount: 40 },
      { method: "YAPE", amount: 60 },
    ],
  });

  assert.equal(result.tendered, 100);
  assert.equal(result.pendingAmount, 0);
  assert.equal(result.change, 0);
  assert.equal(result.paymentComplete, true);
});

test("vuelto solo puede provenir de efectivo", () => {
  const invalid = calculatePaymentCoverage({
    total: 100,
    payments: [{ method: "YAPE", amount: 120 }],
  });
  const valid = calculatePaymentCoverage({
    total: 100,
    payments: [{ method: "CASH", amount: 120 }],
  });

  assert.equal(invalid.invalidOverpayment, true);
  assert.equal(invalid.paymentComplete, false);
  assert.equal(valid.change, 20);
  assert.equal(valid.invalidOverpayment, false);
  assert.equal(valid.paymentComplete, true);
});

test("crédito no puede superar el disponible", () => {
  const insufficient = calculatePaymentCoverage({
    total: 150,
    payments: [
      { method: "CASH", amount: 50 },
      { method: "CREDIT", amount: 100 },
    ],
    creditEnabled: true,
    availableCredit: 80,
  });
  const sufficient = calculatePaymentCoverage({
    total: 150,
    payments: [
      { method: "CASH", amount: 50 },
      { method: "CREDIT", amount: 100 },
    ],
    creditEnabled: true,
    availableCredit: 100,
  });

  assert.equal(insufficient.creditReady, false);
  assert.equal(insufficient.paymentComplete, false);
  assert.equal(sufficient.creditReady, true);
  assert.equal(sufficient.paymentComplete, true);
});

test("costo promedio ponderado conserva precisión monetaria", () => {
  const average = calculateWeightedAverageCost({
    currentQuantity: 10,
    currentAverageCost: 20,
    incomingQuantity: 5,
    incomingUnitCost: 26,
  });

  assert.equal(average, 22);
});
