import { getOperationalContext } from "@/lib/business-context";
import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";
import {
  CASH_PAYMENT_METHODS,
  calculateExpectedCash,
  calculateNetPaymentTotals,
  emptyCashPaymentTotals,
  sumPaymentTotals,
} from "./cash-calculations";
import type {
  CashActivityItem,
  CashBranchOption,
  CashMovementKind,
  CashOpenSession,
  CashPaymentMethod,
  CashPaymentTotals,
  CashSessionHistoryItem,
} from "./cash-types";

const PAYMENT_LABELS: Record<CashPaymentMethod, string> = {
  CASH: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Crédito",
  EXCHANGE_CREDIT: "Vale de cambio",
  OTHER: "Otro",
};

const MOVEMENT_LABELS: Record<CashMovementKind, string> = {
  INCOME: "Ingreso manual",
  EXPENSE: "Egreso",
  WITHDRAWAL: "Retiro de caja",
  ADJUSTMENT_IN: "Ajuste de entrada",
  ADJUSTMENT_OUT: "Ajuste de salida",
};

type ReceivableCollectionRow = {
  id: string;
  amount: unknown;
  paymentMethod: string;
  paidAt: Date;
  saleNumber: string;
  customerName: string;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function paymentMethod(value: string | null | undefined): CashPaymentMethod | null {
  if (!value) return null;
  return CASH_PAYMENT_METHODS.includes(value as CashPaymentMethod)
    ? value as CashPaymentMethod
    : null;
}

function customerName(customer: {
  businessName: string | null;
  firstName: string | null;
  lastName: string | null;
} | null | undefined) {
  if (!customer) return "Consumidor final";
  if (customer.businessName?.trim()) return customer.businessName;
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || "Cliente";
}


export async function getCashSessionSummary(sessionId: string): Promise<CashOpenSession> {
  const company = await getActiveCompany();
  const session = await prisma.cashSession.findFirst({
    where: { id: sessionId, companyId: company.id },
    include: {
      branch: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
      movements: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!session) throw new Error("La sesión de caja ya no existe.");

  const [payments, saleAggregate, collections, directRefunds, exchangeRefunds] = await Promise.all([
    prisma.salePayment.findMany({
      where: {
        sale: {
          companyId: company.id,
          cashSessionId: session.id,
          status: { in: ["COMPLETED", "REFUNDED"] },
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        sale: { select: { id: true, saleNumber: true, createdAt: true } },
      },
    }),
    prisma.sale.aggregate({
      where: {
        companyId: company.id,
        cashSessionId: session.id,
        status: { in: ["COMPLETED", "REFUNDED"] },
      },
      _sum: { total: true },
      _count: { id: true },
    }),
    prisma.$queryRaw<ReceivableCollectionRow[]>`
      SELECT
        rp."id",
        rp."amount",
        rp."paymentMethod"::text AS "paymentMethod",
        rp."paidAt",
        s."saleNumber",
        COALESCE(c."businessName", NULLIF(TRIM(CONCAT(COALESCE(c."firstName", ''), ' ', COALESCE(c."lastName", ''))), ''), 'Cliente') AS "customerName"
      FROM "receivable_payments" rp
      INNER JOIN "accounts_receivable" ar ON ar."id" = rp."receivableId"
      INNER JOIN "sales" s ON s."id" = ar."saleId"
      INNER JOIN "customers" c ON c."id" = ar."customerId"
      WHERE rp."companyId" = ${company.id}
        AND rp."cashSessionId" = ${session.id}
      ORDER BY rp."paidAt" DESC
    `,
    prisma.returnOrder.findMany({
      where: {
        companyId: company.id,
        refundCashSessionId: session.id,
        type: "RETURN",
        status: "COMPLETED",
        refundAmount: { gt: 0 },
      },
      orderBy: { createdAt: "desc" },
      include: {
        sale: { select: { saleNumber: true } },
        customer: {
          select: {
            businessName: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
    prisma.exchangeCredit.findMany({
      where: {
        companyId: company.id,
        refundCashSessionId: session.id,
        refundedAmount: { gt: 0 },
        refundedAt: { not: null },
      },
      orderBy: { refundedAt: "desc" },
      include: {
        customer: {
          select: {
            businessName: true,
            firstName: true,
            lastName: true,
          },
        },
        returnOrder: {
          select: {
            returnNumber: true,
            sale: { select: { saleNumber: true } },
          },
        },
      },
    }),
  ]);

  const paymentTotals = emptyCashPaymentTotals();
  for (const payment of payments) {
    const method = paymentMethod(payment.paymentMethod);
    if (method) {
      paymentTotals[method] = roundMoney(paymentTotals[method] + Number(payment.amount));
    }
  }

  for (const collection of collections) {
    const method = paymentMethod(collection.paymentMethod);
    if (method && method !== "CREDIT" && method !== "EXCHANGE_CREDIT") {
      paymentTotals[method] = roundMoney(paymentTotals[method] + Number(collection.amount));
    }
  }

  const refundTotals = emptyCashPaymentTotals();
  for (const refund of directRefunds) {
    const method = paymentMethod(refund.refundMethod);
    if (method) {
      refundTotals[method] = roundMoney(refundTotals[method] + Number(refund.refundAmount));
    }
  }
  for (const refund of exchangeRefunds) {
    const method = paymentMethod(refund.refundMethod);
    if (method) {
      refundTotals[method] = roundMoney(refundTotals[method] + Number(refund.refundedAmount));
    }
  }

  const netPaymentTotals = calculateNetPaymentTotals(paymentTotals, refundTotals);

  const automaticRefundReferences = new Set<string>([
    ...directRefunds
      .filter((refund) => refund.refundMethod === "CASH")
      .map((refund) => refund.id),
    ...exchangeRefunds
      .filter((refund) => refund.refundMethod === "CASH")
      .map((refund) => refund.id),
  ]);

  const manualMovements = session.movements.filter(
    (movement) => !movement.reference || !automaticRefundReferences.has(movement.reference),
  );

  let manualIncome = 0;
  let manualOut = 0;
  for (const movement of manualMovements) {
    const amount = Number(movement.amount);
    if (movement.type === "INCOME" || movement.type === "ADJUSTMENT_IN") {
      manualIncome += amount;
    } else {
      manualOut += amount;
    }
  }
  manualIncome = roundMoney(manualIncome);
  manualOut = roundMoney(manualOut);

  const refundTotal = sumPaymentTotals(refundTotals);

  const expectedCash = calculateExpectedCash({
    openingAmount: Number(session.openingAmount),
    cashCollected: paymentTotals.CASH,
    cashRefunded: refundTotals.CASH,
    manualIncome,
    manualOut,
  });

  const saleActivity: CashActivityItem[] = payments.map((payment) => {
    const method = paymentMethod(payment.paymentMethod) ?? "OTHER";
    const neutral = method === "CREDIT" || method === "EXCHANGE_CREDIT";
    return {
      id: `sale-${payment.id}`,
      source: "SALE",
      direction: neutral ? "NEUTRAL" : "IN",
      label: `Venta ${payment.sale.saleNumber}`,
      detail: PAYMENT_LABELS[method] ?? "Pago",
      amount: Number(payment.amount),
      paymentMethod: method,
      createdAt: payment.createdAt.toISOString(),
    };
  });

  const collectionActivity: CashActivityItem[] = collections.map((collection) => {
    const method = paymentMethod(collection.paymentMethod) ?? "OTHER";
    return {
      id: `collection-${collection.id}`,
      source: "COLLECTION",
      direction: "IN",
      label: `Cobranza ${collection.saleNumber}`,
      detail: `${collection.customerName} · ${PAYMENT_LABELS[method] ?? "Cobro"}`,
      amount: Number(collection.amount),
      paymentMethod: method,
      createdAt: collection.paidAt.toISOString(),
    };
  });

  const directRefundActivity: CashActivityItem[] = directRefunds.map((refund) => {
    const method = paymentMethod(refund.refundMethod) ?? "OTHER";
    return {
      id: `return-${refund.id}`,
      source: "REFUND",
      direction: method === "CREDIT" ? "NEUTRAL" : "OUT",
      label: `Devolución ${refund.returnNumber}`,
      detail: [
        customerName(refund.customer),
        PAYMENT_LABELS[method] ?? "Reembolso",
        refund.refundReference ? "Ref. " + refund.refundReference : null,
        "Venta " + refund.sale.saleNumber,
      ].filter(Boolean).join(" · "),
      amount: Number(refund.refundAmount),
      paymentMethod: method,
      createdAt: refund.createdAt.toISOString(),
    };
  });

  const exchangeRefundActivity: CashActivityItem[] = exchangeRefunds.map((refund) => {
    const method = paymentMethod(refund.refundMethod) ?? "OTHER";
    return {
      id: `exchange-refund-${refund.id}`,
      source: "REFUND",
      direction: "OUT",
      label: `Saldo devuelto ${refund.returnOrder.returnNumber}`,
      detail: [
        customerName(refund.customer),
        PAYMENT_LABELS[method] ?? "Reembolso",
        refund.refundReference ? "Ref. " + refund.refundReference : null,
        "Venta " + refund.returnOrder.sale.saleNumber,
      ].filter(Boolean).join(" · "),
      amount: Number(refund.refundedAmount),
      paymentMethod: method,
      createdAt: (refund.refundedAt ?? refund.updatedAt).toISOString(),
    };
  });

  const manualActivity: CashActivityItem[] = manualMovements.map((movement) => {
    const incoming = movement.type === "INCOME" || movement.type === "ADJUSTMENT_IN";
    return {
      id: `manual-${movement.id}`,
      source: "MANUAL",
      direction: incoming ? "IN" : "OUT",
      label: MOVEMENT_LABELS[movement.type as CashMovementKind] ?? "Movimiento",
      detail: [movement.concept, movement.reference].filter(Boolean).join(" · "),
      amount: Number(movement.amount),
      paymentMethod: "CASH",
      createdAt: movement.createdAt.toISOString(),
    };
  });

  const activity = [
    ...saleActivity,
    ...collectionActivity,
    ...directRefundActivity,
    ...exchangeRefundActivity,
    ...manualActivity,
  ]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 60);

  return {
    id: session.id,
    branchId: session.branch.id,
    branchName: session.branch.name,
    userId: session.user.id,
    userName: session.user.name,
    openedAt: session.openedAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? null,
    openingAmount: Number(session.openingAmount),
    openingNotes: session.openingNotes,
    closingNotes: session.closingNotes,
    expectedAmount: session.expectedAmount == null ? null : Number(session.expectedAmount),
    closingAmount: session.closingAmount == null ? null : Number(session.closingAmount),
    difference: session.difference == null ? null : Number(session.difference),
    paymentTotals,
    refundTotals,
    netPaymentTotals,
    salesCount: saleAggregate._count.id,
    salesTotal: Number(saleAggregate._sum.total ?? 0),
    manualIncome,
    manualOut,
    refundTotal,
    expectedCash,
    activity,
  };
}

export async function getCashDeskContext() {
  const { company, membership, user } = await getOperationalContext();

  const [branchesRaw, openSessionRaw, historyRaw] = await Promise.all([
    prisma.branch.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.cashSession.findFirst({
      where: { companyId: company.id, userId: user.id, status: "OPEN" },
      orderBy: { openedAt: "desc" },
      select: { id: true },
    }),
    prisma.cashSession.findMany({
      where: { companyId: company.id, status: "CLOSED" },
      orderBy: { closedAt: "desc" },
      take: 12,
      include: {
        branch: { select: { name: true } },
        user: { select: { name: true } },
      },
    }),
  ]);

  const branches: CashBranchOption[] = branchesRaw.map((branch) => ({
    id: branch.id,
    name: branch.name,
    code: branch.code,
  }));

  const openSession = openSessionRaw
    ? await getCashSessionSummary(openSessionRaw.id)
    : null;

  const history: CashSessionHistoryItem[] = historyRaw.map((session) => ({
    id: session.id,
    branchName: session.branch.name,
    userName: session.user.name,
    openedAt: session.openedAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? null,
    openingAmount: Number(session.openingAmount),
    expectedAmount: Number(session.expectedAmount ?? 0),
    closingAmount: Number(session.closingAmount ?? 0),
    difference: Number(session.difference ?? 0),
  }));

  return {
    companyName: company.tradeName ?? company.businessName,
    currentUser: {
      id: user.id,
      name: user.name,
      defaultBranchId: membership.defaultBranchId,
    },
    branches,
    openSession,
    history,
  };
}
