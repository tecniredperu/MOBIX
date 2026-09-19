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
  | "EXCHANGE_CREDIT"
  | "OTHER";

export type CashBranchOption = {
  id: string;
  name: string;
  code: string;
};

export type CashPaymentTotals = Record<CashPaymentMethod, number>;

export type CashActivityItem = {
  id: string;
  source: "SALE" | "COLLECTION" | "REFUND" | "CANCEL" | "MANUAL";
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
  closedAt: string | null;
  openingAmount: number;
  openingNotes: string | null;
  closingNotes: string | null;
  expectedAmount: number | null;
  closingAmount: number | null;
  difference: number | null;
  paymentTotals: CashPaymentTotals;
  refundTotals: CashPaymentTotals;
  netPaymentTotals: CashPaymentTotals;
  salesCount: number;
  salesTotal: number;
  manualIncome: number;
  manualOut: number;
  refundTotal: number;
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


export type CashCloseReportData = {
  sessionId: string;
  companyName: string;
  branchName: string;
  userName: string;
  openedAt: string;
  closedAt: string;
  openingAmount: number;
  salesCount: number;
  salesTotal: number;
  paymentTotals: CashPaymentTotals;
  refundTotals: CashPaymentTotals;
  netPaymentTotals: CashPaymentTotals;
  refundTotal: number;
  manualIncome: number;
  manualOut: number;
  expectedAmount: number;
  actualAmount: number;
  difference: number;
  closingNotes?: string;
};
