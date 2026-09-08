import { roundMoney } from "@/lib/money";
import type { SalePaymentMethod, SaleTaxCondition } from "./sale-types";

export type SaleCalculationLine = {
  quantity: number;
  unitPrice: number;
};

export type PaymentCalculationLine = {
  method: SalePaymentMethod;
  amount: number;
};

export function calculateSaleTotals(input: {
  lines: SaleCalculationLine[];
  discount?: number;
  taxCondition: SaleTaxCondition;
  taxRatePercent?: number;
}) {
  const gross = roundMoney(
    input.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
  );
  const discount = roundMoney(Number(input.discount || 0));
  const total = roundMoney(Math.max(0, gross - discount));
  const rate = Math.max(0, Number(input.taxRatePercent ?? 18)) / 100;
  const subtotal = input.taxCondition === "TAXED"
    ? roundMoney(total / (1 + rate))
    : total;
  const tax = input.taxCondition === "TAXED"
    ? roundMoney(total - subtotal)
    : 0;

  return { gross, discount, subtotal, tax, total };
}

export function calculatePaymentCoverage(input: {
  total: number;
  payments: PaymentCalculationLine[];
  creditEnabled?: boolean;
  availableCredit?: number;
}) {
  const total = roundMoney(input.total);
  const tendered = roundMoney(
    input.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  );
  const cashReceived = roundMoney(
    input.payments
      .filter((payment) => payment.method === "CASH")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  );
  const creditAmount = roundMoney(
    input.payments
      .filter((payment) => payment.method === "CREDIT")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  );
  const pendingAmount = roundMoney(Math.max(0, total - tendered));
  const change = roundMoney(Math.max(0, tendered - total));
  const invalidOverpayment = change > 0.01 && change > cashReceived + 0.01;
  const creditReady = creditAmount <= 0.01 || Boolean(
    input.creditEnabled && creditAmount <= Number(input.availableCredit ?? 0) + 0.01,
  );
  const paymentComplete = pendingAmount <= 0.01 && !invalidOverpayment && creditReady;

  return {
    tendered,
    cashReceived,
    creditAmount,
    pendingAmount,
    change,
    invalidOverpayment,
    creditReady,
    paymentComplete,
  };
}

export function calculateWeightedAverageCost(input: {
  currentQuantity: number;
  currentAverageCost: number;
  incomingQuantity: number;
  incomingUnitCost: number;
}) {
  const newQuantity = input.currentQuantity + input.incomingQuantity;
  if (newQuantity <= 0) return roundMoney(input.incomingUnitCost);
  return roundMoney(
    (
      input.currentQuantity * input.currentAverageCost
      + input.incomingQuantity * input.incomingUnitCost
    ) / newQuantity,
  );
}
