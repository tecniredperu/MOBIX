export type CashMovementKind =
  | "INCOME"
  | "EXPENSE"
  | "WITHDRAWAL"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT";

export type CashPaymentMethod =
  | "CASH"
  | "YAPE"
  | "PLIN"
  | "CARD"
  | "TRANSFER"
  | "CREDIT"
  | "OTHER";

export type CashBranchOption = {
  id: string;
  name: string;
  code: string;
};

export type CashPaymentTotals = Record<CashPaymentMethod, number>;

export type CashActivityItem = {
  id: string;
  source: "SALE" | "MANUAL";
  direction: "IN" | "OUT" | "NEUTRAL";
  label: string;
  detail: string;
  amount: number;
  paymentMethod?: CashPaymentMethod;
  createdAt: string;
};

export type CashOpenSession = {
  id: string;
  branchId: string;
  branchName: string;
  userId: string;
  userName: string;
  openedAt: string;
  openingAmount: number;
  openingNotes: string | null;
  paymentTotals: CashPaymentTotals;
  salesCount: number;
  salesTotal: number;
  manualIncome: number;
  manualOut: number;
  expectedCash: number;
  activity: CashActivityItem[];
};

export type CashSessionHistoryItem = {
  id: string;
  branchName: string;
  userName: string;
  openedAt: string;
  closedAt: string | null;
  openingAmount: number;
  expectedAmount: number;
  closingAmount: number;
  difference: number;
};
