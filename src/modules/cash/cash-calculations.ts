import { roundMoney } from "@/lib/money";
import type { CashPaymentMethod, CashPaymentTotals } from "./cash-types";

export const CASH_PAYMENT_METHODS: CashPaymentMethod[] = [
  "CASH",
  "YAPE",
  "PLIN",
  "CARD",
  "TRANSFER",
  "CREDIT",
  "EXCHANGE_CREDIT",
  "OTHER",
];

export function emptyCashPaymentTotals(): CashPaymentTotals {
  return {
    CASH: 0,
    YAPE: 0,
    PLIN: 0,
    CARD: 0,
    TRANSFER: 0,
    CREDIT: 0,
    EXCHANGE_CREDIT: 0,
    OTHER: 0,
  };
}

export function calculateNetPaymentTotals(
  collected: CashPaymentTotals,
  refunded: CashPaymentTotals,
): CashPaymentTotals {
  const result = emptyCashPaymentTotals();
  for (const method of CASH_PAYMENT_METHODS) {
    result[method] = roundMoney(
      Number(collected[method] || 0) - Number(refunded[method] || 0),
    );
  }
  return result;
}

export function calculateExpectedCash(input: {
  openingAmount: number;
  cashCollected: number;
  cashRefunded: number;
  manualIncome: number;
  manualOut: number;
}) {
  return roundMoney(
    Number(input.openingAmount || 0)
      + Number(input.cashCollected || 0)
      - Number(input.cashRefunded || 0)
      + Number(input.manualIncome || 0)
      - Number(input.manualOut || 0),
  );
}

export function sumPaymentTotals(totals: CashPaymentTotals) {
  return roundMoney(
    CASH_PAYMENT_METHODS.reduce(
      (sum, method) => sum + Number(totals[method] || 0),
      0,
    ),
  );
}


export function requiresCashDifferenceNote(difference: number) {
  return Math.abs(roundMoney(Number(difference || 0))) > 0.01;
}
