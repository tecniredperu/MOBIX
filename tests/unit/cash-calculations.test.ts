import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateExpectedCash,
  calculateNetPaymentTotals,
  emptyCashPaymentTotals,
  requiresCashDifferenceNote,
  sumPaymentTotals,
} from "../../src/modules/cash/cash-calculations";

test("caja descuenta devoluciones de efectivo sin duplicar egresos", () => {
  const expected = calculateExpectedCash({
    openingAmount: 100,
    cashCollected: 700,
    cashRefunded: 120,
    manualIncome: 50,
    manualOut: 30,
  });

  assert.equal(expected, 700);
});

test("conciliación por medio muestra cobrado menos devuelto", () => {
  const collected = emptyCashPaymentTotals();
  collected.CASH = 300;
  collected.YAPE = 500;
  collected.CARD = 200;
  collected.EXCHANGE_CREDIT = 150;

  const refunded = emptyCashPaymentTotals();
  refunded.CASH = 50;
  refunded.YAPE = 80;
  refunded.CARD = 20;

  const net = calculateNetPaymentTotals(collected, refunded);

  assert.equal(net.CASH, 250);
  assert.equal(net.YAPE, 420);
  assert.equal(net.CARD, 180);
  assert.equal(net.EXCHANGE_CREDIT, 150);
  assert.equal(sumPaymentTotals(refunded), 150);
});

test("la conciliación conserva centavos correctamente", () => {
  const expected = calculateExpectedCash({
    openingAmount: 10.1,
    cashCollected: 19.95,
    cashRefunded: 4.05,
    manualIncome: 0,
    manualOut: 1.01,
  });

  assert.equal(expected, 24.99);
});


test("cierre con sobrante o faltante exige una explicación", () => {
  assert.equal(requiresCashDifferenceNote(0), false);
  assert.equal(requiresCashDifferenceNote(0.01), false);
  assert.equal(requiresCashDifferenceNote(-0.01), false);
  assert.equal(requiresCashDifferenceNote(0.02), true);
  assert.equal(requiresCashDifferenceNote(-5.5), true);
});
