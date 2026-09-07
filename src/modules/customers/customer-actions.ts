"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cleanDocument(value?: string) {
  return value?.replace(/\D/g, "") ?? "";
}

function validateDocument(type: string, number: string) {
  if (!number) return;
  if (type === "DNI" && number.length !== 8) throw new Error("El DNI debe tener 8 dígitos.");
  if (type === "RUC" && number.length !== 11) throw new Error("El RUC debe tener 11 dígitos.");
}

async function getMembership(companyId: string) {
  const membership = await prisma.companyUser.findFirst({
    where: { companyId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!membership) throw new Error("No existe un usuario activo para registrar la operación.");
  return membership;
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
  const company = await getActiveCompany();
  const membership = await getMembership(company.id);
  const name = input.name?.trim();
  const documentNumber = cleanDocument(input.documentNumber);
  const creditLimit = roundMoney(Number(input.creditLimit || 0));
  const creditDays = Math.max(0, Math.min(3650, Math.floor(Number(input.creditDays ?? 30))));

  if (!name || name.length < 2) throw new Error("Ingresa el nombre o razón social del cliente.");
  validateDocument(input.documentType, documentNumber);
  if (!Number.isFinite(creditLimit) || creditLimit < 0) throw new Error("El límite de crédito no es válido.");

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
      },
    });

    await tx.$executeRaw`
      UPDATE "customers"
      SET
        "creditEnabled" = ${Boolean(input.creditEnabled)},
        "creditLimit" = ${creditLimit},
        "creditDays" = ${creditDays},
        "creditNotes" = ${input.creditNotes?.trim() || null}
      WHERE "id" = ${created.id} AND "companyId" = ${company.id}
    `;

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

  revalidatePath("/clientes");
  revalidatePath("/pos");
  redirect(`/clientes/${customer.id}`);
}

export async function updateCustomerAction(input: {
  customerId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}) {
  const company = await getActiveCompany();
  const membership = await getMembership(company.id);
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
        newValues: { name, phone: input.phone, email: input.email, address: input.address },
      },
    });
  });

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${current.id}`);
  revalidatePath("/pos");
}

export async function updateCustomerCreditAction(input: {
  customerId: string;
  enabled: boolean;
  limit: number;
  days: number;
  notes?: string;
}) {
  const company = await getActiveCompany();
  const membership = await getMembership(company.id);
  const limit = roundMoney(Number(input.limit || 0));
  const days = Math.max(0, Math.min(3650, Math.floor(Number(input.days || 0))));

  if (!Number.isFinite(limit) || limit < 0) throw new Error("El límite de crédito no es válido.");
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, companyId: company.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (!customer) throw new Error("El cliente no está disponible.");

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "customers"
      SET
        "creditEnabled" = ${Boolean(input.enabled)},
        "creditLimit" = ${limit},
        "creditDays" = ${days},
        "creditNotes" = ${input.notes?.trim() || null},
        "updatedAt" = NOW()
      WHERE "id" = ${customer.id} AND "companyId" = ${company.id}
    `;
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "UPDATE",
        entity: "CUSTOMER_CREDIT",
        entityId: customer.id,
        newValues: { enabled: Boolean(input.enabled), limit, days, notes: input.notes?.trim() || null },
      },
    });
  });

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${customer.id}`);
  revalidatePath("/pos");
}

export async function registerReceivablePaymentAction(input: {
  receivableId: string;
  amount: number;
  method: CollectionMethod;
  reference?: string;
  notes?: string;
}) {
  const company = await getActiveCompany();
  const membership = await getMembership(company.id);
  const amount = roundMoney(Number(input.amount || 0));

  if (!COLLECTION_METHODS.has(input.method)) throw new Error("Selecciona un medio de cobro válido.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("El abono debe ser mayor a cero.");

  const result = await prisma.$transaction(async (tx) => {
    const openSession = await tx.cashSession.findFirst({
      where: { companyId: company.id, userId: membership.userId, status: "OPEN" },
      select: { id: true },
    });
    if (!openSession) {
      throw new Error("Abre Caja antes de registrar un cobro. Todo abono debe quedar asociado al turno activo.");
    }

    const rows = await tx.$queryRaw<ReceivableLockRow[]>`
      SELECT
        ar."id",
        ar."customerId",
        ar."balance",
        ar."status"::text AS "status",
        s."saleNumber"
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

    await tx.$executeRaw`
      INSERT INTO "receivable_payments" (
        "id", "companyId", "receivableId", "cashSessionId", "amount",
        "paymentMethod", "reference", "notes", "createdById", "paidAt"
      ) VALUES (
        ${paymentId}, ${company.id}, ${receivable.id}, ${openSession.id}, ${amount},
        ${input.method}::"PaymentMethod", ${input.reference?.trim() || null}, ${input.notes?.trim() || null}, ${membership.userId}, NOW()
      )
    `;

    await tx.$executeRaw`
      UPDATE "accounts_receivable"
      SET
        "paidAmount" = "paidAmount" + ${amount},
        "balance" = ${newBalance},
        "status" = ${newStatus}::"AccountReceivableStatus",
        "updatedAt" = NOW()
      WHERE "id" = ${receivable.id} AND "companyId" = ${company.id}
    `;

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

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${result.customerId}`);
  revalidatePath("/caja");
  revalidatePath("/");
  revalidatePath("/pos");
  return result;
}
