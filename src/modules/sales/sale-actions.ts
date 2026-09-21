"use server";

import { randomUUID } from "node:crypto";
import { requirePermission, requirePermissionWithSettings } from "@/lib/business-context";
import { lockInventoryBalance } from "@/lib/inventory-lock";
import { roundMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { revalidatePaths } from "@/lib/revalidation";
import type {
  CreateSaleInput,
  SaleDocumentType,
  SalePaymentMethod,
  SaleTaxCondition,
} from "./sale-types";

const PAYMENT_METHODS = new Set<SalePaymentMethod>([
  "CASH",
  "YAPE",
  "PLIN",
  "CARD",
  "TRANSFER",
  "CREDIT",
  "EXCHANGE_CREDIT",
  "OTHER",
]);
const DOCUMENT_TYPES = new Set<SaleDocumentType>(["RECEIPT", "INVOICE", "SALES_NOTE"]);
const TAX_CONDITIONS = new Set<SaleTaxCondition>(["TAXED", "EXEMPT", "UNAFFECTED"]);
const SALE_PATHS = [
  "/pos",
  "/ventas",
  "/clientes",
  "/caja",
  "/productos",
  "/equipos",
  "/kardex",
  "/reportes",
] as const;

type CreditCustomerRow = {
  creditEnabled: boolean;
  creditLimit: unknown;
  creditDays: number;
  outstanding: unknown;
};

type NextNumberRow = { next: unknown };

type ExchangeCreditLockRow = {
  id: string;
  customerId: string | null;
  balance: unknown;
  status: string;
};

type ExistingPaymentReferenceRow = {
  source: "VENTA" | "ABONO";
  label: string;
};

type CancelSaleLockRow = {
  id: string;
  status: string;
  cashSessionId: string | null;
  warehouseId: string;
  saleNumber: string;
};

type ExchangeCreditCancelLockRow = {
  id: string;
  originalAmount: unknown;
  balance: unknown;
  status: string;
  refundedAmount: unknown;
  refundedAt: Date | null;
};

type UnitSnapshot = {
  id: string;
  variantId: string;
  warehouseId: string;
  purchaseCost: unknown;
  status: string;
};

function cleanDocument(value?: string) {
  return value?.replace(/\D/g, "") ?? "";
}

function normalizePaymentReference(value?: string | null) {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function validateCustomerDocument(documentType: string | undefined, documentNumber: string) {
  if (!documentNumber) return;
  if (documentType === "RUC" && documentNumber.length !== 11) {
    throw new Error("El RUC del cliente debe tener 11 dígitos.");
  }
  if (documentType === "DNI" && documentNumber.length !== 8) {
    throw new Error("El DNI del cliente debe tener 8 dígitos.");
  }
}

function isSerialized(type: string) {
  return type === "PHONE" || type === "SERIALIZED";
}

function documentSeriesFor(
  documentType: SaleDocumentType,
  settings: { invoiceSeries: string; receiptSeries: string; salesNoteSeries: string },
) {
  if (documentType === "INVOICE") return settings.invoiceSeries;
  if (documentType === "RECEIPT") return settings.receiptSeries;
  return settings.salesNoteSeries;
}

export async function createSaleAction(input: CreateSaleInput) {
  const { company, membership, settings } = await requirePermissionWithSettings("sales.create");
  const taxRate = Math.max(0, Number(settings.taxRate || 0)) / 100;

  if (!DOCUMENT_TYPES.has(input.documentType)) throw new Error("El tipo de comprobante no es válido.");
  if (!TAX_CONDITIONS.has(input.taxCondition)) throw new Error("La condición tributaria no es válida.");
  if (!input.warehouseId) throw new Error("Selecciona el almacén de venta.");
  if (!input.lines.length) throw new Error("Agrega al menos un producto a la venta.");

  const warehouse = await prisma.warehouse.findFirst({
    where: {
      id: input.warehouseId,
      companyId: company.id,
      status: "ACTIVE",
      isSaleable: true,
    },
    include: { branch: true },
  });
  if (!warehouse) throw new Error("El almacén seleccionado no está habilitado para ventas.");

  const customerDocument = cleanDocument(input.customer?.documentNumber);
  validateCustomerDocument(input.customer?.documentType, customerDocument);

  if (input.documentType === "INVOICE") {
    if (input.customerId) {
      const invoiceCustomer = await prisma.customer.findFirst({
        where: { id: input.customerId, companyId: company.id },
        select: { documentType: true, documentNumber: true, businessName: true },
      });
      if (
        !invoiceCustomer ||
        invoiceCustomer.documentType !== "RUC" ||
        cleanDocument(invoiceCustomer.documentNumber ?? "").length !== 11
      ) {
        throw new Error("Para emitir Factura debes seleccionar un cliente con RUC válido.");
      }
    } else if (
      input.customer?.documentType !== "RUC" ||
      customerDocument.length !== 11 ||
      !input.customer?.name?.trim()
    ) {
      throw new Error("Para emitir Factura registra RUC y razón social del cliente.");
    }
  }

  const variantIds = [...new Set(input.lines.map((line) => line.variantId))];
  const variants = await prisma.productVariant.findMany({
    where: {
      id: { in: variantIds },
      companyId: company.id,
      status: "ACTIVE",
      product: {
        companyId: company.id,
        status: "ACTIVE",
        deletedAt: null,
      },
    },
    include: { product: true },
  });
  if (variants.length !== variantIds.length) {
    throw new Error("Uno o más productos ya no están disponibles.");
  }
  const variantMap = new Map(variants.map((variant) => [variant.id, variant]));

  const unitIds = input.lines.flatMap((line) => line.selectedUnitIds ?? []);
  if (new Set(unitIds).size !== unitIds.length) {
    throw new Error("Un mismo IMEI/equipo no puede agregarse dos veces.");
  }

  const units: UnitSnapshot[] = unitIds.length
    ? await prisma.productUnit.findMany({
        where: { id: { in: unitIds }, companyId: company.id },
        select: {
          id: true,
          variantId: true,
          warehouseId: true,
          purchaseCost: true,
          status: true,
        },
      })
    : [];
  const unitMap = new Map(units.map((unit) => [unit.id, unit]));
  if (units.length !== unitIds.length) throw new Error("Uno de los equipos seleccionados ya no existe.");

  let gross = 0;
  for (const line of input.lines) {
    const variant = variantMap.get(line.variantId);
    if (!variant) throw new Error("Producto inválido.");
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error(`La cantidad de ${variant.product.name} no es válida.`);
    }
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      throw new Error(`El precio de ${variant.product.name} no es válido.`);
    }

    const minimumPrice = Number(variant.minimumSalePrice);
    if (minimumPrice > 0 && line.unitPrice < minimumPrice) {
      throw new Error(`El precio de ${variant.product.name} no puede ser menor a S/ ${minimumPrice.toFixed(2)}.`);
    }

    if (isSerialized(variant.product.type)) {
      const selected = line.selectedUnitIds ?? [];
      if (selected.length !== line.quantity) {
        throw new Error(`Selecciona ${line.quantity} IMEI/serie para ${variant.product.name}.`);
      }
      for (const id of selected) {
        const unit = unitMap.get(id);
        if (
          !unit ||
          unit.variantId !== variant.id ||
          unit.warehouseId !== input.warehouseId ||
          unit.status !== "AVAILABLE"
        ) {
          throw new Error(`Uno de los equipos de ${variant.product.name} ya no está disponible en este almacén.`);
        }
      }
    }

    gross += line.quantity * line.unitPrice;
  }

  gross = roundMoney(gross);
  const discount = roundMoney(Number(input.discount || 0));
  if (!Number.isFinite(discount) || discount < 0) throw new Error("El descuento no es válido.");
  if (discount > gross) throw new Error("El descuento no puede superar el importe de la venta.");

  const total = roundMoney(gross - discount);
  const subtotal = input.taxCondition === "TAXED" ? roundMoney(total / (1 + taxRate)) : total;
  const tax = input.taxCondition === "TAXED" ? roundMoney(total - subtotal) : 0;

  if (!input.payments.length) throw new Error("Registra al menos un medio de pago.");
  for (const payment of input.payments) {
    if (!PAYMENT_METHODS.has(payment.method)) throw new Error("Medio de pago no permitido.");
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
      throw new Error("Todos los pagos deben ser mayores a cero.");
    }
    if (payment.method === "EXCHANGE_CREDIT" && !payment.reference?.trim()) {
      throw new Error("El vale de cambio no tiene una referencia válida.");
    }
    if (
      ["YAPE", "PLIN", "CARD", "TRANSFER"].includes(payment.method)
      && !payment.reference?.trim()
    ) {
      throw new Error(
        `Ingresa el número de operación o referencia para ${payment.method === "CARD" ? "Tarjeta" : payment.method.charAt(0) + payment.method.slice(1).toLowerCase()}.`,
      );
    }
  }

  const protectedReferenceKeys = new Set<string>();
  for (const payment of input.payments) {
    if (!["YAPE", "PLIN", "CARD", "TRANSFER"].includes(payment.method)) continue;
    const normalizedReference = normalizePaymentReference(payment.reference);
    if (!normalizedReference) continue;

    const key = payment.method + ":" + normalizedReference;
    if (protectedReferenceKeys.has(key)) {
      throw new Error(
        "La referencia " + payment.reference?.trim()
        + " de " + payment.method
        + " está repetida dentro de la misma venta.",
      );
    }
    protectedReferenceKeys.add(key);
  }

  const exchangePayments = input.payments.filter((payment) => payment.method === "EXCHANGE_CREDIT");
  if (exchangePayments.length > 1) {
    throw new Error("Solo se puede aplicar un vale de cambio por venta.");
  }

  const paid = roundMoney(input.payments.reduce((sum, payment) => sum + payment.amount, 0));
  if (Math.abs(paid - total) > 0.01) {
    throw new Error(`Los pagos suman S/ ${paid.toFixed(2)} y el total de la venta es S/ ${total.toFixed(2)}.`);
  }

  const creditAmount = roundMoney(
    input.payments
      .filter((payment) => payment.method === "CREDIT")
      .reduce((sum, payment) => sum + Number(payment.amount), 0),
  );
  if (creditAmount > 0 && !input.customerId) {
    throw new Error("Para vender a crédito debes seleccionar un cliente registrado con línea de crédito habilitada.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const cashRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "cash_sessions"
      WHERE "companyId" = ${company.id}
        AND "branchId" = ${warehouse.branchId}
        AND "userId" = ${membership.userId}
        AND "status" = 'OPEN'::"CashSessionStatus"
      ORDER BY "openedAt" DESC
      LIMIT 1
      FOR UPDATE
    `;
    const saleCashSessionId = cashRows[0]?.id ?? null;
    if (settings.requireCashSession && !saleCashSessionId) {
      throw new Error("Debes abrir caja en esta sucursal antes de registrar una venta.");
    }

    const uniqueReferencePayments = input.payments.filter((payment) =>
      ["YAPE", "PLIN", "CARD", "TRANSFER"].includes(payment.method)
      && Boolean(payment.reference?.trim()),
    );

    for (const payment of uniqueReferencePayments) {
      const normalizedReference = normalizePaymentReference(payment.reference);
      if (!normalizedReference) continue;

      const lockKey = company.id + ":" + payment.method + ":" + normalizedReference;
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      `;

      const existingReference = await tx.$queryRaw<ExistingPaymentReferenceRow[]>`
        SELECT "source", "label"
        FROM (
          SELECT 'VENTA'::text AS "source", s."saleNumber"::text AS "label"
          FROM "sale_payments" sp
          INNER JOIN "sales" s ON s."id" = sp."saleId"
          WHERE s."companyId" = ${company.id}
            AND sp."paymentMethod"::text = ${payment.method}
            AND regexp_replace(upper(COALESCE(sp."reference", '')), '[^A-Z0-9]', '', 'g') = ${normalizedReference}

          UNION ALL

          SELECT 'ABONO'::text AS "source", s."saleNumber"::text AS "label"
          FROM "receivable_payments" rp
          INNER JOIN "accounts_receivable" ar ON ar."id" = rp."receivableId"
          INNER JOIN "sales" s ON s."id" = ar."saleId"
          WHERE rp."companyId" = ${company.id}
            AND rp."paymentMethod"::text = ${payment.method}
            AND regexp_replace(upper(COALESCE(rp."reference", '')), '[^A-Z0-9]', '', 'g') = ${normalizedReference}
        ) references_used
        LIMIT 1
      `;

      const duplicate = existingReference[0];
      if (duplicate) {
        throw new Error(
          "La referencia " + payment.reference?.trim()
          + " de " + payment.method
          + " ya fue utilizada en "
          + (duplicate.source === "VENTA" ? "la venta " : "un abono de la venta ")
          + duplicate.label + ".",
        );
      }
    }

    let customerId: string | null = null;
    if (input.customerId) {
      const existing = await tx.customer.findFirst({
        where: { id: input.customerId, companyId: company.id, status: "ACTIVE" },
      });
      if (!existing) throw new Error("El cliente seleccionado ya no está disponible.");
      customerId = existing.id;
    } else if (customerDocument || input.customer?.name?.trim()) {
      const name = input.customer?.name?.trim() || "Cliente";
      let customer = customerDocument
        ? await tx.customer.findFirst({ where: { companyId: company.id, documentNumber: customerDocument } })
        : null;
      const customerData = {
        documentType: input.customer?.documentType ?? null,
        documentNumber: customerDocument || null,
        businessName: input.customer?.documentType === "RUC" ? name : null,
        firstName: input.customer?.documentType === "RUC" ? null : name,
        phone: input.customer?.phone?.trim() || null,
        whatsapp: input.customer?.phone?.trim() || null,
        email: input.customer?.email?.trim() || null,
      };
      customer = customer
        ? await tx.customer.update({ where: { id: customer.id }, data: customerData })
        : await tx.customer.create({ data: { companyId: company.id, ...customerData } });
      customerId = customer.id;
    }

    let exchangeCreditLock: ExchangeCreditLockRow | null = null;
    const exchangePayment = exchangePayments[0];
    if (exchangePayment) {
      const exchangeCreditId = exchangePayment.reference!.trim();
      const rows = await tx.$queryRaw<ExchangeCreditLockRow[]>`
        SELECT "id", "customerId", "balance", "status"
        FROM "exchange_credits"
        WHERE "id" = ${exchangeCreditId}
          AND "companyId" = ${company.id}
          AND "status" IN ('OPEN','PARTIAL')
        LIMIT 1
        FOR UPDATE
      `;
      exchangeCreditLock = rows[0] ?? null;
      if (!exchangeCreditLock) {
        throw new Error("El vale de cambio ya fue utilizado, cancelado o no está disponible.");
      }

      const availableExchange = roundMoney(Number(exchangeCreditLock.balance ?? 0));
      if (exchangePayment.amount > availableExchange + 0.01) {
        throw new Error("El vale de cambio solo tiene S/ " + availableExchange.toFixed(2) + " disponibles.");
      }

      if (exchangeCreditLock.customerId) {
        if (customerId && customerId !== exchangeCreditLock.customerId) {
          throw new Error("El vale de cambio pertenece a otro cliente.");
        }
        if (!customerId) customerId = exchangeCreditLock.customerId;
      }
    }

    let creditDays = 30;
    if (creditAmount > 0) {
      if (!customerId) throw new Error("Selecciona un cliente para la venta a crédito.");

      const customerLock = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "customers"
        WHERE "id" = ${customerId} AND "companyId" = ${company.id} AND "status" = 'ACTIVE'::"EntityStatus"
        FOR UPDATE
      `;
      if (!customerLock.length) throw new Error("El cliente seleccionado ya no está disponible.");

      const profile = await tx.$queryRaw<CreditCustomerRow[]>`
        SELECT c."creditEnabled", c."creditLimit", c."creditDays",
               COALESCE(SUM(ar."balance") FILTER (WHERE ar."status" IN ('OPEN','PARTIAL')), 0) AS "outstanding"
        FROM "customers" c
        LEFT JOIN "accounts_receivable" ar
          ON ar."customerId" = c."id" AND ar."companyId" = c."companyId"
        WHERE c."id" = ${customerId} AND c."companyId" = ${company.id}
        GROUP BY c."id", c."creditEnabled", c."creditLimit", c."creditDays"
      `;
      const credit = profile[0];
      if (!credit?.creditEnabled) throw new Error("Este cliente no tiene habilitada una línea de crédito.");

      const available = roundMoney(
        Math.max(0, Number(credit.creditLimit ?? 0) - Number(credit.outstanding ?? 0)),
      );
      if (creditAmount > available + 0.01) {
        throw new Error(`Crédito insuficiente. Disponible: S/ ${available.toFixed(2)}.`);
      }
      creditDays = Math.max(0, Number(credit.creditDays ?? 30));
    }

    await tx.$queryRaw<Array<{ locked: number }>>`
      WITH lock_row AS (
        SELECT pg_advisory_xact_lock(hashtext(${`${company.id}:sale-number`}))
      )
      SELECT 1::int AS "locked" FROM lock_row
    `;

    const saleSequence = await tx.$queryRaw<NextNumberRow[]>`
      SELECT COALESCE(
        MAX(CASE WHEN "saleNumber" ~ '^V001-[0-9]+$' THEN CAST(SPLIT_PART("saleNumber", '-', 2) AS BIGINT) END),
        0
      ) + 1 AS "next"
      FROM "sales"
      WHERE "companyId" = ${company.id}
    `;
    const saleNumber = `V001-${String(Number(saleSequence[0]?.next ?? 1)).padStart(6, "0")}`;
    const documentSeries = documentSeriesFor(input.documentType, settings);

    const documentSequence = await tx.$queryRaw<NextNumberRow[]>`
      SELECT COALESCE(
        MAX(CASE WHEN "documentNumber" ~ '^[0-9]+$' THEN CAST("documentNumber" AS BIGINT) END),
        0
      ) + 1 AS "next"
      FROM "sales"
      WHERE "companyId" = ${company.id}
        AND "documentType" = ${input.documentType}::"DocumentType"
        AND "documentSeries" = ${documentSeries}
    `;
    const documentNumber = String(Number(documentSequence[0]?.next ?? 1)).padStart(8, "0");

    const sale = await tx.sale.create({
      data: {
        companyId: company.id,
        branchId: warehouse.branchId,
        warehouseId: warehouse.id,
        customerId,
        cashSessionId: saleCashSessionId,
        saleNumber,
        documentType: input.documentType,
        documentSeries,
        documentNumber,
        taxCondition: input.taxCondition,
        currency: company.currency,
        subtotal,
        discount,
        tax,
        total,
        status: "COMPLETED",
        sellerId: membership.userId,
        createdById: membership.userId,
      },
    });

    let remainingDiscount = discount;
    for (let index = 0; index < input.lines.length; index += 1) {
      const line = input.lines[index];
      const variant = variantMap.get(line.variantId)!;
      const lineGross = roundMoney(line.quantity * line.unitPrice);
      const allocatedDiscount = index === input.lines.length - 1
        ? remainingDiscount
        : roundMoney(gross > 0 ? discount * (lineGross / gross) : 0);
      remainingDiscount = roundMoney(remainingDiscount - allocatedDiscount);

      const lineNet = roundMoney(lineGross - allocatedDiscount);
      const lineSubtotal = input.taxCondition === "TAXED" ? roundMoney(lineNet / (1 + taxRate)) : lineNet;
      const lineTax = input.taxCondition === "TAXED" ? roundMoney(lineNet - lineSubtotal) : 0;
      const serialized = isSerialized(variant.product.type);
      let unitCost = Number(variant.purchasePrice);
      let balanceId: string | null = null;

      if (serialized) {
        const selectedUnits = (line.selectedUnitIds ?? []).map((id) => unitMap.get(id)!);
        unitCost = roundMoney(
          selectedUnits.reduce((sum, unit) => sum + Number(unit.purchaseCost), 0) / selectedUnits.length,
        );
      } else if (variant.product.type === "ACCESSORY") {
        await lockInventoryBalance(tx, company.id, warehouse.id, variant.id);
        const balance = await tx.inventoryBalance.findUnique({
          where: {
            companyId_warehouseId_variantId: {
              companyId: company.id,
              warehouseId: warehouse.id,
              variantId: variant.id,
            },
          },
        });
        if (!balance || Number(balance.quantity) < line.quantity) {
          throw new Error(`Stock insuficiente para ${variant.product.name}.`);
        }
        balanceId = balance.id;
        unitCost = Number(balance.averageCost);
      }

      const saleItem = await tx.saleItem.create({
        data: {
          saleId: sale.id,
          productId: variant.productId,
          variantId: variant.id,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitCost,
          discount: allocatedDiscount,
          subtotal: lineSubtotal,
          tax: lineTax,
          total: lineNet,
        },
      });

      if (serialized) {
        for (const unitId of line.selectedUnitIds ?? []) {
          const unit = unitMap.get(unitId)!;
          const updated = await tx.productUnit.updateMany({
            where: {
              id: unitId,
              companyId: company.id,
              warehouseId: warehouse.id,
              variantId: variant.id,
              status: "AVAILABLE",
            },
            data: { status: "SOLD" },
          });
          if (updated.count !== 1) {
            throw new Error(`El equipo de ${variant.product.name} acaba de ser vendido por otro usuario.`);
          }

          const warrantyDays = Math.max(
            0,
            Number(variant.product.warrantyDays || settings.defaultWarrantyDays || 0),
          );
          const warrantyStartsAt = warrantyDays > 0 ? sale.createdAt : null;
          const warrantyExpiresAt = warrantyStartsAt
            ? new Date(warrantyStartsAt.getTime() + warrantyDays * 86_400_000)
            : null;

          await tx.saleItemUnit.create({
            data: {
              saleItemId: saleItem.id,
              productUnitId: unitId,
              warrantyDays,
              warrantyStartsAt,
              warrantyExpiresAt,
            },
          });
          await tx.inventoryMovement.create({
            data: {
              companyId: company.id,
              warehouseId: warehouse.id,
              productId: variant.productId,
              variantId: variant.id,
              productUnitId: unitId,
              movementType: "SALE",
              quantity: 1,
              unitCost: Number(unit.purchaseCost),
              referenceType: "SALE",
              referenceId: sale.id,
              notes: `Salida por venta ${saleNumber}`,
              createdById: membership.userId,
            },
          });
        }
      } else if (variant.product.type === "ACCESSORY" && balanceId) {
        const updated = await tx.inventoryBalance.updateMany({
          where: { id: balanceId, quantity: { gte: line.quantity } },
          data: { quantity: { decrement: line.quantity } },
        });
        if (updated.count !== 1) throw new Error(`Stock insuficiente para ${variant.product.name}.`);

        await tx.inventoryMovement.create({
          data: {
            companyId: company.id,
            warehouseId: warehouse.id,
            productId: variant.productId,
            variantId: variant.id,
            movementType: "SALE",
            quantity: line.quantity,
            unitCost,
            referenceType: "SALE",
            referenceId: sale.id,
            notes: `Salida por venta ${saleNumber}`,
            createdById: membership.userId,
          },
        });
      }
    }

    for (const payment of input.payments) {
      await tx.salePayment.create({
        data: {
          saleId: sale.id,
          paymentMethod: payment.method,
          amount: roundMoney(payment.amount),
          reference: payment.reference?.trim() || null,
        },
      });
    }

    let exchangeCreditUsed = 0;
    let exchangeCreditBalance = 0;
    if (exchangePayment && exchangeCreditLock) {
      exchangeCreditUsed = roundMoney(exchangePayment.amount);
      exchangeCreditBalance = roundMoney(
        Math.max(0, Number(exchangeCreditLock.balance ?? 0) - exchangeCreditUsed),
      );

      const exchangeCustomerId = exchangeCreditLock.customerId ?? customerId;
      await tx.exchangeCredit.update({
        where: { id: exchangeCreditLock.id },
        data: {
          balance: exchangeCreditBalance,
          status: exchangeCreditBalance <= 0.01 ? "USED" : "PARTIAL",
          ...(exchangeCustomerId ? { customerId: exchangeCustomerId } : {}),
        },
      });

      await tx.exchangeCreditUsage.create({
        data: {
          exchangeCreditId: exchangeCreditLock.id,
          saleId: sale.id,
          amount: exchangeCreditUsed,
        },
      });
    }

    let receivableId: string | null = null;
    if (creditAmount > 0 && customerId) {
      receivableId = randomUUID();
      const dueDate = new Date(Date.now() + creditDays * 86_400_000);
      await tx.$executeRaw`
        INSERT INTO "accounts_receivable" (
          "id", "companyId", "customerId", "saleId", "status", "originalAmount",
          "paidAmount", "balance", "dueDate", "notes", "createdAt", "updatedAt"
        ) VALUES (
          ${receivableId}, ${company.id}, ${customerId}, ${sale.id}, 'OPEN'::"AccountReceivableStatus",
          ${creditAmount}, 0, ${creditAmount}, ${dueDate}, ${`Crédito originado por venta ${saleNumber}`}, NOW(), NOW()
        )
      `;
    }

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "CREATE",
        entity: "SALE",
        entityId: sale.id,
        newValues: {
          saleNumber,
          documentType: input.documentType,
          documentSeries,
          documentNumber,
          taxCondition: input.taxCondition,
          taxRate: settings.taxRate,
          subtotal,
          tax,
          discount,
          total,
          creditAmount,
          receivableId,
          exchangeCreditId: exchangeCreditLock?.id ?? null,
          exchangeCreditUsed,
          exchangeCreditBalance,
          paymentMethods: input.payments.map((payment) => payment.method),
        },
      },
    });

    return { id: sale.id, saleNumber, documentSeries, documentNumber };
  });

  revalidatePaths(SALE_PATHS);
  if (input.customerId) revalidatePaths([`/clientes/${input.customerId}`]);
  return result;
}


export async function cancelSaleAction(input: {
  saleId: string;
  reason: string;
}) {
  const { company, membership, settings } = await requirePermissionWithSettings("sales.cancel");
  const saleId = input.saleId?.trim();
  const reason = input.reason?.trim();

  if (!saleId) throw new Error("No se identificó la venta a anular.");
  if (!reason || reason.length < 5) {
    throw new Error("Describe brevemente el motivo de la anulación.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<CancelSaleLockRow[]>`
      SELECT "id", "status"::text, "cashSessionId", "warehouseId", "saleNumber"
      FROM "sales"
      WHERE "id" = ${saleId}
        AND "companyId" = ${company.id}
      LIMIT 1
      FOR UPDATE
    `;
    const locked = lockedRows[0];
    if (!locked) throw new Error("La venta ya no existe.");
    if (locked.status !== "COMPLETED") {
      throw new Error("Solo se pueden anular ventas completadas.");
    }

    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: {
        cashSession: { select: { id: true, status: true, userId: true } },
        returnOrders: {
          where: { status: "COMPLETED" },
          select: { id: true, returnNumber: true },
        },
        serviceOrders: {
          where: { status: { not: "CANCELLED" } },
          select: { id: true, serviceNumber: true },
        },
        receivable: {
          include: {
            payments: { select: { id: true, amount: true } },
          },
        },
        exchangeCreditUsages: {
          select: {
            id: true,
            exchangeCreditId: true,
            amount: true,
          },
        },
        payments: {
          select: {
            paymentMethod: true,
            amount: true,
            reference: true,
          },
        },
        items: {
          include: {
            product: { select: { name: true, type: true } },
            units: {
              include: {
                productUnit: { select: { id: true, status: true } },
              },
            },
          },
        },
      },
    });
    if (!sale) throw new Error("La venta ya no está disponible.");

    if (sale.returnOrders.length) {
      throw new Error(
        "Esta venta ya tiene una devolución o cambio registrado. Gestiona cualquier ajuste desde Postventa.",
      );
    }
    if (sale.serviceOrders.length) {
      throw new Error(
        "Esta venta tiene una atención de garantía o servicio técnico activa. Ciérrala antes de intentar anular.",
      );
    }

    if (sale.cashSessionId) {
      if (
        !sale.cashSession
        || sale.cashSession.status !== "OPEN"
        || sale.cashSession.userId !== membership.userId
      ) {
        throw new Error(
          "La caja original de esta venta ya fue cerrada o pertenece a otro usuario. Registra una devolución en lugar de anular la venta.",
        );
      }
    } else if (settings.requireCashSession) {
      throw new Error(
        "Esta venta no tiene una sesión de caja abierta asociada. Registra una devolución para mantener la conciliación.",
      );
    }

    const digitalPayments = sale.payments.filter((payment) =>
      ["YAPE", "PLIN", "CARD", "TRANSFER", "OTHER"].includes(payment.paymentMethod),
    );
    if (digitalPayments.length) {
      throw new Error(
        "Esta venta tiene un cobro digital registrado. Para mantener la conciliación y la referencia del reembolso, procesa una Devolución en lugar de anular.",
      );
    }

    if (sale.receivable) {
      const paidAmount = roundMoney(
        sale.receivable.payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
      );
      if (paidAmount > 0.01) {
        throw new Error(
          "La venta tiene cobranzas registradas sobre su crédito. Debes procesar una devolución o ajuste de cobranza.",
        );
      }
    }

    for (const usage of sale.exchangeCreditUsages) {
      const creditRows = await tx.$queryRaw<ExchangeCreditCancelLockRow[]>`
        SELECT "id", "originalAmount", "balance", "status"::text, "refundedAmount", "refundedAt"
        FROM "exchange_credits"
        WHERE "id" = ${usage.exchangeCreditId}
          AND "companyId" = ${company.id}
        LIMIT 1
        FOR UPDATE
      `;
      const credit = creditRows[0];
      if (!credit) throw new Error("El vale utilizado en esta venta ya no existe.");

      if (Number(credit.refundedAmount ?? 0) > 0.01 || credit.refundedAt) {
        throw new Error(
          "El vale utilizado en esta venta ya tuvo una devolución de saldo. No es posible anular automáticamente esta operación.",
        );
      }
      if (credit.status === "CANCELLED") {
        throw new Error("El vale utilizado en esta venta está cancelado.");
      }

      const originalAmount = roundMoney(Number(credit.originalAmount ?? 0));
      const restoredBalance = roundMoney(
        Math.min(originalAmount, Number(credit.balance ?? 0) + Number(usage.amount)),
      );

      await tx.exchangeCredit.update({
        where: { id: credit.id },
        data: {
          balance: restoredBalance,
          status: restoredBalance >= originalAmount - 0.01 ? "OPEN" : "PARTIAL",
        },
      });
      await tx.exchangeCreditUsage.delete({ where: { id: usage.id } });
    }

    for (const item of sale.items) {
      const serialized = item.product.type === "PHONE" || item.product.type === "SERIALIZED";

      if (serialized) {
        for (const link of item.units) {
          if (link.productUnit.status !== "SOLD") {
            throw new Error(
              "El equipo " + item.product.name + " ya cambió de estado. Usa el flujo de devolución/cambio.",
            );
          }

          const updated = await tx.productUnit.updateMany({
            where: {
              id: link.productUnit.id,
              companyId: company.id,
              status: "SOLD",
            },
            data: {
              status: "AVAILABLE",
              warehouseId: sale.warehouseId,
            },
          });
          if (updated.count !== 1) {
            throw new Error("El estado de uno de los IMEI cambió durante la anulación.");
          }

          await tx.inventoryMovement.create({
            data: {
              companyId: company.id,
              warehouseId: sale.warehouseId,
              productId: item.productId,
              variantId: item.variantId,
              productUnitId: link.productUnit.id,
              movementType: "RETURN_IN",
              quantity: 1,
              unitCost: Number(item.unitCost),
              referenceType: "SALE_CANCEL",
              referenceId: sale.id,
              notes: "Reingreso por anulación de venta " + sale.saleNumber,
              createdById: membership.userId,
            },
          });
        }
      } else if (item.product.type === "ACCESSORY") {
        await lockInventoryBalance(tx, company.id, sale.warehouseId, item.variantId);

        const currentBalance = await tx.inventoryBalance.findUnique({
          where: {
            companyId_warehouseId_variantId: {
              companyId: company.id,
              warehouseId: sale.warehouseId,
              variantId: item.variantId,
            },
          },
        });
        const oldQty = Number(currentBalance?.quantity ?? 0);
        const oldAverage = Number(currentBalance?.averageCost ?? 0);
        const restoredCost = Number(item.unitCost);
        const newQty = oldQty + item.quantity;
        const newAverage = newQty > 0
          ? roundMoney((oldQty * oldAverage + item.quantity * restoredCost) / newQty)
          : restoredCost;

        await tx.inventoryBalance.upsert({
          where: {
            companyId_warehouseId_variantId: {
              companyId: company.id,
              warehouseId: sale.warehouseId,
              variantId: item.variantId,
            },
          },
          create: {
            companyId: company.id,
            warehouseId: sale.warehouseId,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            averageCost: restoredCost,
          },
          update: {
            quantity: newQty,
            averageCost: newAverage,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            companyId: company.id,
            warehouseId: sale.warehouseId,
            productId: item.productId,
            variantId: item.variantId,
            movementType: "RETURN_IN",
            quantity: item.quantity,
            unitCost: Number(item.unitCost),
            referenceType: "SALE_CANCEL",
            referenceId: sale.id,
            notes: "Reingreso por anulación de venta " + sale.saleNumber,
            createdById: membership.userId,
          },
        });
      }
    }

    if (sale.receivable) {
      await tx.accountReceivable.update({
        where: { id: sale.receivable.id },
        data: {
          status: "CANCELLED",
          balance: 0,
          notes: [
            sale.receivable.notes?.trim(),
            "Cuenta anulada junto con la venta " + sale.saleNumber + ".",
          ].filter(Boolean).join(" "),
        },
      });
    }

    await tx.sale.update({
      where: { id: sale.id },
      data: { status: "CANCELLED" },
    });

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "CANCEL",
        entity: "SALE",
        entityId: sale.id,
        oldValues: {
          status: "COMPLETED",
          saleNumber: sale.saleNumber,
          total: Number(sale.total),
        },
        newValues: {
          status: "CANCELLED",
          reason,
          restoredSerializedUnits: sale.items.reduce(
            (sum, item) => sum + item.units.length,
            0,
          ),
          restoredAccessoryUnits: sale.items.reduce(
            (sum, item) => sum + (item.product.type === "ACCESSORY" ? item.quantity : 0),
            0,
          ),
          paymentMethods: sale.payments.map((payment) => payment.paymentMethod),
          restoredExchangeCredits: sale.exchangeCreditUsages.map((usage) => ({
            exchangeCreditId: usage.exchangeCreditId,
            amount: Number(usage.amount),
          })),
        },
      },
    });

    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      status: "CANCELLED" as const,
    };
  });

  revalidatePaths(SALE_PATHS);
  revalidatePaths([`/ventas/${result.id}`]);
  return result;
}
