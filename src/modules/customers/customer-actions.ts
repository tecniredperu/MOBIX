"use server";

import { randomUUID } from "node:crypto";
import { requirePermission } from "@/lib/business-context";
import { roundMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { revalidatePaths } from "@/lib/revalidation";

export type CollectionMethod = "CASH" | "YAPE" | "PLIN" | "CARD" | "TRANSFER" | "OTHER";

const COLLECTION_METHODS = new Set<CollectionMethod>([
  "CASH",
  "YAPE",
  "PLIN",
  "CARD",
  "TRANSFER",
  "OTHER",
]);

type ReceivableLockRow = {
  id: string;
  customerId: string;
  balance: unknown;
  status: string;
  saleNumber: string;
};

type CashSessionRow = { id: string };

function cleanDocument(value?: string) {
  return value?.replace(/\D/g, "") ?? "";
}

function validateDocument(type: string, number: string) {
  if (!number) return;
  if (type === "DNI" && number.length !== 8) throw new Error("El DNI debe tener 8 dígitos.");
  if (type === "RUC" && number.length !== 11) throw new Error("El RUC debe tener 11 dígitos.");
}

export async function createCustomerAction(input: {
  documentType: "DNI" | "RUC" | "CE" | "OTHER";
  documentNumber?: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  creditEnabled?: boolean;
  creditLimit?: number;
  creditDays?: number;
  creditNotes?: string;
}) {
  const { company, membership } = await requirePermission("customers.manage");
  const name = input.name?.trim();
  const documentNumber = cleanDocument(input.documentNumber);
  const creditLimit = roundMoney(Number(input.creditLimit || 0));
  const creditDays = Math.max(0, Math.min(3650, Math.floor(Number(input.creditDays ?? 30))));

  if (!name || name.length < 2) throw new Error("Ingresa el nombre o razón social del cliente.");
  validateDocument(input.documentType, documentNumber);
  if (!Number.isFinite(creditLimit) || creditLimit < 0) {
    throw new Error("El límite de crédito no es válido.");
  }

  try {
    const customer = await prisma.$transaction(async (tx) => {
      if (documentNumber) {
        const duplicate = await tx.customer.findFirst({
          where: { companyId: company.id, documentNumber },
          select: { id: true },
        });
        if (duplicate) throw new Error("Ya existe un cliente con ese documento.");
      }

      const created = await tx.customer.create({
        data: {
          companyId: company.id,
          documentType: input.documentType,
          documentNumber: documentNumber || null,
          businessName: input.documentType === "RUC" ? name : null,
          firstName: input.documentType === "RUC" ? null : name,
          phone: input.phone?.trim() || null,
          whatsapp: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          address: input.address?.trim() || null,
          creditEnabled: Boolean(input.creditEnabled),
          creditLimit,
          creditDays,
          creditNotes: input.creditNotes?.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: company.id,
          userId: membership.userId,
          action: "CREATE",
          entity: "CUSTOMER",
          entityId: created.id,
          newValues: {
            documentType: input.documentType,
            documentNumber: documentNumber || null,
            name,
            creditEnabled: Boolean(input.creditEnabled),
            creditLimit,
            creditDays,
          },
        },
      });
      return created;
    });

    revalidatePaths(["/clientes", "/pos"]);
    return { id: customer.id };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : null;
    if (code === "P2002") throw new Error("Ya existe un cliente con ese documento.");
    throw error;
  }
}

export async function updateCustomerAction(input: {
  customerId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}) {
  const { company, membership } = await requirePermission("customers.manage");
  const name = input.name?.trim();
  if (!name || name.length < 2) throw new Error("Ingresa el nombre o razón social del cliente.");

  const current = await prisma.customer.findFirst({
    where: { id: input.customerId, companyId: company.id },
    select: { id: true, documentType: true },
  });
  if (!current) throw new Error("El cliente ya no existe.");

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: current.id },
      data: {
        businessName: current.documentType === "RUC" ? name : null,
        firstName: current.documentType === "RUC" ? null : name,
        phone: input.phone?.trim() || null,
        whatsapp: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "UPDATE",
        entity: "CUSTOMER",
        entityId: current.id,
        newValues: {
          name,
          phone: input.phone,
          email: input.email,
          address: input.address,
        },
      },
    });
  });

  revalidatePaths(["/clientes", `/clientes/${current.id}`, "/pos"]);
}

export async function updateCustomerCreditAction(input: {
  customerId: string;
  enabled: boolean;
  limit: number;
  days: number;
  notes?: string;
}) {
  const { company, membership } = await requirePermission("customers.manage");
  const limit = roundMoney(Number(input.limit || 0));
  const days = Math.max(0, Math.min(3650, Math.floor(Number(input.days || 0))));
  if (!Number.isFinite(limit) || limit < 0) throw new Error("El límite de crédito no es válido.");

  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, companyId: company.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (!customer) throw new Error("El cliente no está disponible.");

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        creditEnabled: Boolean(input.enabled),
        creditLimit: limit,
        creditDays: days,
        creditNotes: input.notes?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "UPDATE",
        entity: "CUSTOMER_CREDIT",
        entityId: customer.id,
        newValues: {
          enabled: Boolean(input.enabled),
          limit,
          days,
          notes: input.notes?.trim() || null,
        },
      },
    });
  });

  revalidatePaths(["/clientes", `/clientes/${customer.id}`, "/pos"]);
}

export async function registerReceivablePaymentAction(input: {
  receivableId: string;
  amount: number;
  method: CollectionMethod;
  reference?: string;
  notes?: string;
}) {
  const { company, membership } = await requirePermission("customers.manage");
  const amount = roundMoney(Number(input.amount || 0));

  if (!COLLECTION_METHODS.has(input.method)) throw new Error("Selecciona un medio de cobro válido.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("El abono debe ser mayor a cero.");

  const result = await prisma.$transaction(async (tx) => {
    const sessions = await tx.$queryRaw<CashSessionRow[]>`
      SELECT "id"
      FROM "cash_sessions"
      WHERE "companyId" = ${company.id}
        AND "userId" = ${membership.userId}
        AND "status" = 'OPEN'::"CashSessionStatus"
      ORDER BY "openedAt" DESC
      LIMIT 1
      FOR UPDATE
    `;
    const openSession = sessions[0];
    if (!openSession) {
      throw new Error("Abre Caja antes de registrar un cobro. Todo abono debe quedar asociado al turno activo.");
    }

    const rows = await tx.$queryRaw<ReceivableLockRow[]>`
      SELECT ar."id", ar."customerId", ar."balance", ar."status"::text AS "status", s."saleNumber"
      FROM "accounts_receivable" ar
      INNER JOIN "sales" s ON s."id" = ar."saleId"
      WHERE ar."id" = ${input.receivableId} AND ar."companyId" = ${company.id}
      FOR UPDATE OF ar
    `;
    const receivable = rows[0];
    if (!receivable) throw new Error("La cuenta por cobrar ya no existe.");
    if (receivable.status === "PAID" || receivable.status === "CANCELLED") {
      throw new Error("Esta cuenta por cobrar ya no admite pagos.");
    }

    const balance = roundMoney(Number(receivable.balance));
    if (amount > balance + 0.01) {
      throw new Error(`El abono supera el saldo pendiente de S/ ${balance.toFixed(2)}.`);
    }

    const paymentId = randomUUID();
    const newBalance = roundMoney(Math.max(0, balance - amount));
    const newStatus = newBalance <= 0.009 ? "PAID" : "PARTIAL";

    await tx.receivablePayment.create({
      data: {
        id: paymentId,
        companyId: company.id,
        receivableId: receivable.id,
        cashSessionId: openSession.id,
        amount,
        paymentMethod: input.method,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        createdById: membership.userId,
      },
    });

    const updated = await tx.$executeRaw`
      UPDATE "accounts_receivable"
      SET "paidAmount" = "paidAmount" + ${amount},
          "balance" = ${newBalance},
          "status" = ${newStatus}::"AccountReceivableStatus",
          "updatedAt" = NOW()
      WHERE "id" = ${receivable.id} AND "companyId" = ${company.id}
    `;
    if (updated !== 1) throw new Error("No se pudo actualizar el saldo de la cuenta por cobrar.");

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "CREATE",
        entity: "RECEIVABLE_PAYMENT",
        entityId: paymentId,
        newValues: {
          receivableId: receivable.id,
          saleNumber: receivable.saleNumber,
          customerId: receivable.customerId,
          amount,
          method: input.method,
          previousBalance: balance,
          newBalance,
          cashSessionId: openSession.id,
        },
      },
    });

    return { customerId: receivable.customerId, newBalance, status: newStatus };
  });

  revalidatePaths([
    "/clientes",
    `/clientes/${result.customerId}`,
    "/caja",
    "/",
    "/pos",
    "/reportes",
  ]);
  return result;
}
