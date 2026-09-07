"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";
import type { CashMovementKind } from "./cash-types";

const MOVEMENT_TYPES = new Set<CashMovementKind>([
  "INCOME",
  "EXPENSE",
  "WITHDRAWAL",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
]);

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validMoney(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 999999999;
}

async function getMembership(companyId: string) {
  const membership = await prisma.companyUser.findFirst({
    where: { companyId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!membership) throw new Error("No existe un usuario activo para operar la caja.");
  return membership;
}

export async function openCashSessionAction(input: {
  branchId: string;
  openingAmount: number;
  notes?: string;
}) {
  const company = await getActiveCompany();
  const membership = await getMembership(company.id);
  const openingAmount = roundMoney(Number(input.openingAmount || 0));

  if (!input.branchId) throw new Error("Selecciona la sucursal donde abrirás caja.");
  if (!validMoney(openingAmount)) throw new Error("El monto inicial de caja no es válido.");

  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, companyId: company.id, status: "ACTIVE" },
    select: { id: true, name: true },
  });
  if (!branch) throw new Error("La sucursal seleccionada no está disponible.");

  try {
    const session = await prisma.$transaction(async (tx) => {
      const existing = await tx.cashSession.findFirst({
        where: { companyId: company.id, userId: membership.userId, status: "OPEN" },
        select: { id: true },
      });
      if (existing) throw new Error("Ya tienes una caja abierta. Ciérrala antes de iniciar otra.");

      const created = await tx.cashSession.create({
        data: {
          companyId: company.id,
          branchId: branch.id,
          userId: membership.userId,
          openingAmount,
          openingNotes: input.notes?.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: company.id,
          userId: membership.userId,
          action: "CREATE",
          entity: "CASH_SESSION",
          entityId: created.id,
          newValues: {
            branchId: branch.id,
            branchName: branch.name,
            openingAmount,
            status: "OPEN",
          },
        },
      });

      return created;
    });

    revalidatePath("/caja");
    revalidatePath("/");
    return { id: session.id };
  } catch (cause) {
    if (cause instanceof Error) throw cause;
    throw new Error("No se pudo abrir la caja.");
  }
}

export async function addCashMovementAction(input: {
  sessionId: string;
  type: CashMovementKind;
  amount: number;
  concept: string;
  reference?: string;
}) {
  const company = await getActiveCompany();
  const membership = await getMembership(company.id);
  const amount = roundMoney(Number(input.amount || 0));
  const concept = input.concept?.trim();

  if (!MOVEMENT_TYPES.has(input.type)) throw new Error("Selecciona un tipo de movimiento válido.");
  if (!validMoney(amount) || amount <= 0) throw new Error("El importe debe ser mayor a cero.");
  if (!concept || concept.length < 3) throw new Error("Describe el motivo del movimiento de caja.");

  const movement = await prisma.$transaction(async (tx) => {
    const session = await tx.cashSession.findFirst({
      where: {
        id: input.sessionId,
        companyId: company.id,
        userId: membership.userId,
        status: "OPEN",
      },
      select: { id: true },
    });
    if (!session) throw new Error("La caja ya no está abierta o pertenece a otro usuario.");

    const created = await tx.cashMovement.create({
      data: {
        companyId: company.id,
        cashSessionId: session.id,
        type: input.type,
        amount,
        concept,
        reference: input.reference?.trim() || null,
        createdById: membership.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "CREATE",
        entity: "CASH_MOVEMENT",
        entityId: created.id,
        newValues: {
          cashSessionId: session.id,
          type: input.type,
          amount,
          concept,
        },
      },
    });

    return created;
  });

  revalidatePath("/caja");
  return { id: movement.id };
}

export async function closeCashSessionAction(input: {
  sessionId: string;
  actualAmount: number;
  notes?: string;
}) {
  const company = await getActiveCompany();
  const membership = await getMembership(company.id);
  const actualAmount = roundMoney(Number(input.actualAmount));

  if (!validMoney(actualAmount)) throw new Error("El efectivo contado no es válido.");

  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.cashSession.findFirst({
      where: {
        id: input.sessionId,
        companyId: company.id,
        userId: membership.userId,
        status: "OPEN",
      },
      select: {
        id: true,
        branchId: true,
        userId: true,
        openingAmount: true,
        openedAt: true,
      },
    });
    if (!session) throw new Error("La caja ya fue cerrada o pertenece a otro usuario.");

    const [cashPayments, movements] = await Promise.all([
      tx.salePayment.findMany({
        where: {
          paymentMethod: "CASH",
          sale: {
            companyId: company.id,
            branchId: session.branchId,
            sellerId: session.userId,
            status: "COMPLETED",
            createdAt: { gte: session.openedAt },
          },
        },
        select: { amount: true },
      }),
      tx.cashMovement.findMany({
        where: { companyId: company.id, cashSessionId: session.id },
        select: { type: true, amount: true },
      }),
    ]);

    const cashSales = roundMoney(
      cashPayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    );
    let manualIn = 0;
    let manualOut = 0;
    for (const movement of movements) {
      const amount = Number(movement.amount);
      if (movement.type === "INCOME" || movement.type === "ADJUSTMENT_IN") manualIn += amount;
      else manualOut += amount;
    }

    const expectedAmount = roundMoney(
      Number(session.openingAmount) + cashSales + manualIn - manualOut,
    );
    const difference = roundMoney(actualAmount - expectedAmount);
    const closedAt = new Date();

    const updated = await tx.cashSession.updateMany({
      where: { id: session.id, status: "OPEN" },
      data: {
        status: "CLOSED",
        expectedAmount,
        closingAmount: actualAmount,
        difference,
        closingNotes: input.notes?.trim() || null,
        closedAt,
      },
    });
    if (updated.count !== 1) throw new Error("La caja fue cerrada por otra operación.");

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "UPDATE",
        entity: "CASH_SESSION",
        entityId: session.id,
        newValues: {
          status: "CLOSED",
          expectedAmount,
          closingAmount: actualAmount,
          difference,
          cashSales,
          manualIn: roundMoney(manualIn),
          manualOut: roundMoney(manualOut),
        },
      },
    });

    return { expectedAmount, actualAmount, difference };
  });

  revalidatePath("/caja");
  revalidatePath("/");
  return result;
}
