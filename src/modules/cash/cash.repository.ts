import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";
import type {
  CashActivityItem,
  CashBranchOption,
  CashMovementKind,
  CashOpenSession,
  CashPaymentMethod,
  CashPaymentTotals,
  CashSessionHistoryItem,
} from "./cash-types";

const PAYMENT_METHODS: CashPaymentMethod[] = [
  "CASH",
  "YAPE",
  "PLIN",
  "CARD",
  "TRANSFER",
  "CREDIT",
  "OTHER",
];

const PAYMENT_LABELS: Record<CashPaymentMethod, string> = {
  CASH: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Crédito",
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

function emptyPaymentTotals(): CashPaymentTotals {
  return {
    CASH: 0,
    YAPE: 0,
    PLIN: 0,
    CARD: 0,
    TRANSFER: 0,
    CREDIT: 0,
    OTHER: 0,
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function getMembership(companyId: string) {
  const membership = await prisma.companyUser.findFirst({
    where: { companyId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true } },
      defaultBranch: { select: { id: true } },
    },
  });

  if (!membership) {
    throw new Error("No existe un usuario activo para operar la caja.");
  }

  return membership;
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

  const saleDateFilter = {
    gte: session.openedAt,
    ...(session.closedAt ? { lte: session.closedAt } : {}),
  };

  const [payments, saleAggregate, collections] = await Promise.all([
    prisma.salePayment.findMany({
      where: {
        sale: {
          companyId: company.id,
          branchId: session.branchId,
          sellerId: session.userId,
          status: "COMPLETED",
          createdAt: saleDateFilter,
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
        branchId: session.branchId,
        sellerId: session.userId,
        status: "COMPLETED",
        createdAt: saleDateFilter,
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
      WHERE rp."companyId" = ${company.id} AND rp."cashSessionId" = ${session.id}
      ORDER BY rp."paidAt" DESC
    `,
  ]);

  const paymentTotals = emptyPaymentTotals();
  for (const payment of payments) {
    const method = payment.paymentMethod as CashPaymentMethod;
    if (PAYMENT_METHODS.includes(method)) {
      paymentTotals[method] = roundMoney(paymentTotals[method] + Number(payment.amount));
    }
  }
  for (const collection of collections) {
    const method = collection.paymentMethod as CashPaymentMethod;
    if (PAYMENT_METHODS.includes(method) && method !== "CREDIT") {
      paymentTotals[method] = roundMoney(paymentTotals[method] + Number(collection.amount));
    }
  }

  let manualIncome = 0;
  let manualOut = 0;
  for (const movement of session.movements) {
    const amount = Number(movement.amount);
    if (movement.type === "INCOME" || movement.type === "ADJUSTMENT_IN") {
      manualIncome += amount;
    } else {
      manualOut += amount;
    }
  }
  manualIncome = roundMoney(manualIncome);
  manualOut = roundMoney(manualOut);

  const expectedCash = roundMoney(
    Number(session.openingAmount) + paymentTotals.CASH + manualIncome - manualOut,
  );

  const saleActivity: CashActivityItem[] = payments.map((payment) => ({
    id: `sale-${payment.id}`,
    source: "SALE",
    direction: "IN",
    label: `Venta ${payment.sale.saleNumber}`,
    detail: PAYMENT_LABELS[payment.paymentMethod as CashPaymentMethod] ?? "Pago",
    amount: Number(payment.amount),
    paymentMethod: payment.paymentMethod as CashPaymentMethod,
    createdAt: payment.createdAt.toISOString(),
  }));

  const collectionActivity: CashActivityItem[] = collections.map((collection) => ({
    id: `collection-${collection.id}`,
    source: "SALE",
    direction: "IN",
    label: `Cobranza ${collection.saleNumber}`,
    detail: `${collection.customerName} · ${PAYMENT_LABELS[collection.paymentMethod as CashPaymentMethod] ?? "Cobro"}`,
    amount: Number(collection.amount),
    paymentMethod: collection.paymentMethod as CashPaymentMethod,
    createdAt: collection.paidAt.toISOString(),
  }));

  const manualActivity: CashActivityItem[] = session.movements.map((movement) => {
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

  const activity = [...saleActivity, ...collectionActivity, ...manualActivity]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 40);

  return {
    id: session.id,
    branchId: session.branch.id,
    branchName: session.branch.name,
    userId: session.user.id,
    userName: session.user.name,
    openedAt: session.openedAt.toISOString(),
    openingAmount: Number(session.openingAmount),
    openingNotes: session.openingNotes,
    paymentTotals,
    salesCount: saleAggregate._count.id,
    salesTotal: Number(saleAggregate._sum.total ?? 0),
    manualIncome,
    manualOut,
    expectedCash,
    activity,
  };
}

export async function getCashDeskContext() {
  const company = await getActiveCompany();
  const membership = await getMembership(company.id);

  const [branchesRaw, openSessionRaw, historyRaw] = await Promise.all([
    prisma.branch.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.cashSession.findFirst({
      where: { companyId: company.id, userId: membership.userId, status: "OPEN" },
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
      id: membership.user.id,
      name: membership.user.name,
      defaultBranchId: membership.defaultBranchId,
    },
    branches,
    openSession,
    history,
  };
}
