"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";
import type { CreatePurchaseInput } from "./purchase-types";

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeIdentifier(value?: string) {
  return value?.trim().toUpperCase() ?? "";
}

function validateSupplier(documentType: string, documentNumber: string) {
  const clean = documentNumber.replace(/\D/g, "");
  if (documentType === "RUC" && clean.length !== 11) throw new Error("El RUC del proveedor debe tener 11 dígitos.");
  if (documentType === "DNI" && clean.length !== 8) throw new Error("El DNI del proveedor debe tener 8 dígitos.");
}

export async function createPurchaseAction(input: CreatePurchaseInput) {
  const { company, membership, settings } = await requirePermission("purchases.create");
  const TAX_RATE = Math.max(0, Number(settings.taxRate || 0)) / 100;
  const businessName = input.supplier.businessName.trim();
  const documentNumber = input.supplier.documentNumber.trim();

  if (!businessName) throw new Error("Ingresa el nombre o razón social del proveedor.");
  if (!documentNumber) throw new Error("Ingresa el documento del proveedor.");
  validateSupplier(input.supplier.documentType, documentNumber);
  if (!input.warehouseId) throw new Error("Selecciona el almacén de destino.");
  if (!input.lines.length) throw new Error("Agrega al menos un producto a la compra.");

  const issueDate = new Date(`${input.issueDate}T12:00:00`);
  if (Number.isNaN(issueDate.getTime())) throw new Error("La fecha de emisión no es válida.");

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: input.warehouseId, companyId: company.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (!warehouse) throw new Error("El almacén seleccionado no pertenece a la empresa activa.");

  const variantIds = [...new Set(input.lines.map((line) => line.variantId))];
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, companyId: company.id, status: "ACTIVE" },
    include: { product: true },
  });
  if (variants.length !== variantIds.length) throw new Error("Uno o más productos ya no están disponibles.");
  const variantMap = new Map(variants.map((variant) => [variant.id, variant]));

  const allIdentifiers: string[] = [];
  for (const line of input.lines) {
    const variant = variantMap.get(line.variantId);
    if (!variant) throw new Error("Producto inválido.");
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error(`La cantidad de ${variant.product.name} debe ser un entero mayor a cero.`);
    if (!Number.isFinite(line.unitCost) || line.unitCost < 0) throw new Error(`El costo de ${variant.product.name} no es válido.`);

    const serialized = variant.product.type === "PHONE" || variant.product.type === "SERIALIZED";
    if (serialized) {
      if ((line.units?.length ?? 0) !== line.quantity) throw new Error(`Debes registrar ${line.quantity} unidad(es) serializada(s) para ${variant.product.name}.`);
      for (const unit of line.units ?? []) {
        const imei1 = normalizeIdentifier(unit.imei1);
        const imei2 = normalizeIdentifier(unit.imei2);
        const serial = normalizeIdentifier(unit.serial);
        if (variant.product.requiresImei) {
          if (!/^\d{15}$/.test(imei1)) throw new Error(`El IMEI 1 de ${variant.product.name} debe tener 15 dígitos.`);
          if (imei2 && !/^\d{15}$/.test(imei2)) throw new Error(`El IMEI 2 de ${variant.product.name} debe tener 15 dígitos.`);
        }
        if (variant.product.requiresSerial && !serial) throw new Error(`Registra el número de serie de ${variant.product.name}.`);
        if (imei1) allIdentifiers.push(imei1);
        if (imei2) allIdentifiers.push(imei2);
        if (serial) allIdentifiers.push(serial);
      }
    }
  }

  const repeatedInPayload = allIdentifiers.find((value, index) => allIdentifiers.indexOf(value) !== index);
  if (repeatedInPayload) throw new Error(`El identificador ${repeatedInPayload} está repetido en la compra.`);
  if (allIdentifiers.length) {
    const duplicate = await prisma.productUnitIdentifier.findFirst({
      where: { companyId: company.id, value: { in: allIdentifiers } },
      select: { value: true },
    });
    if (duplicate) throw new Error(`El IMEI/serie ${duplicate.value} ya está registrado en MOBIX.`);
  }

  const subtotal = money(input.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
  const tax = input.taxCondition === "TAXED" ? money(subtotal * TAX_RATE) : 0;
  const total = money(subtotal + tax);
  const taxLabel = input.taxCondition === "TAXED" ? "Gravado" : input.taxCondition === "EXEMPT" ? "Exonerado" : "Inafecto";
  const documentTypeLabel = input.documentType === "FACTURA" ? "01 - Factura" : input.documentType === "BOLETA" ? "03 - Boleta de venta" : input.documentType === "GUIA" ? "Guía / documento de ingreso" : "Otro";

  const result = await prisma.$transaction(async (tx) => {
    let supplier = await tx.supplier.findFirst({ where: { companyId: company.id, documentNumber } });
    if (supplier) {
      supplier = await tx.supplier.update({ where: { id: supplier.id }, data: { documentType: input.supplier.documentType, businessName, phone: input.supplier.phone?.trim() || null } });
    } else {
      supplier = await tx.supplier.create({ data: { companyId: company.id, documentType: input.supplier.documentType, documentNumber, businessName, phone: input.supplier.phone?.trim() || null } });
    }

    await tx.$queryRaw<Array<{ locked: number }>>`WITH l AS (SELECT pg_advisory_xact_lock(hashtext(${`${company.id}:purchase-number`}))) SELECT 1::int AS "locked" FROM l`;
    const seq = await tx.$queryRaw<Array<{ next: unknown }>>`
      SELECT COALESCE(MAX(CASE WHEN "number" ~ '^C001-[0-9]+$' THEN CAST(SPLIT_PART("number", '-', 2) AS BIGINT) END), 0) + 1 AS "next"
      FROM "purchases" WHERE "companyId" = ${company.id}
    `;
    const number = `C001-${String(Number(seq[0]?.next ?? 1)).padStart(6, "0")}`;
    const notes = [`Condición tributaria: ${taxLabel}`, input.notes?.trim() ? input.notes.trim() : null].filter(Boolean).join(" | ");

    const purchase = await tx.purchase.create({
      data: {
        companyId: company.id,
        supplierId: supplier.id,
        warehouseId: input.warehouseId,
        number,
        documentType: documentTypeLabel,
        documentSeries: input.documentSeries?.trim().toUpperCase() || null,
        documentNumber: input.documentNumber?.trim() || null,
        issueDate,
        currency: company.currency,
        subtotal,
        tax,
        total,
        status: "RECEIVED",
        notes,
        createdById: membership.userId,
      },
    });

    for (const line of input.lines) {
      const variant = variantMap.get(line.variantId)!;
      const lineSubtotal = money(line.quantity * line.unitCost);
      const lineTax = input.taxCondition === "TAXED" ? money(lineSubtotal * TAX_RATE) : 0;
      const purchaseItem = await tx.purchaseItem.create({
        data: { purchaseId: purchase.id, productId: variant.productId, variantId: variant.id, quantity: line.quantity, unitCost: line.unitCost, subtotal: lineSubtotal, tax: lineTax, total: money(lineSubtotal + lineTax) },
      });

      const serialized = variant.product.type === "PHONE" || variant.product.type === "SERIALIZED";
      if (serialized) {
        for (const unit of line.units ?? []) {
          const identifiers = [
            normalizeIdentifier(unit.imei1) ? { companyId: company.id, type: "IMEI_1" as const, value: normalizeIdentifier(unit.imei1) } : null,
            normalizeIdentifier(unit.imei2) ? { companyId: company.id, type: "IMEI_2" as const, value: normalizeIdentifier(unit.imei2) } : null,
            normalizeIdentifier(unit.serial) ? { companyId: company.id, type: "SERIAL" as const, value: normalizeIdentifier(unit.serial) } : null,
          ].filter((item): item is NonNullable<typeof item> => Boolean(item));

          const productUnit = await tx.productUnit.create({
            data: { companyId: company.id, productId: variant.productId, variantId: variant.id, warehouseId: input.warehouseId, purchaseId: purchase.id, purchaseItemId: purchaseItem.id, purchaseCost: line.unitCost, status: "AVAILABLE", identifiers: { create: identifiers } },
          });
          await tx.inventoryMovement.create({
            data: { companyId: company.id, warehouseId: input.warehouseId, productId: variant.productId, variantId: variant.id, productUnitId: productUnit.id, movementType: "PURCHASE", quantity: 1, unitCost: line.unitCost, referenceType: "PURCHASE", referenceId: purchase.id, notes: `Ingreso por compra ${number}`, createdById: membership.userId },
          });
        }
      } else {
        const balance = await tx.inventoryBalance.findUnique({ where: { companyId_warehouseId_variantId: { companyId: company.id, warehouseId: input.warehouseId, variantId: variant.id } } });
        const previousQty = Number(balance?.quantity ?? 0);
        const previousCost = Number(balance?.averageCost ?? 0);
        const newQty = previousQty + line.quantity;
        const averageCost = newQty > 0 ? money(((previousQty * previousCost) + (line.quantity * line.unitCost)) / newQty) : line.unitCost;

        await tx.inventoryBalance.upsert({
          where: { companyId_warehouseId_variantId: { companyId: company.id, warehouseId: input.warehouseId, variantId: variant.id } },
          update: { quantity: newQty, averageCost },
          create: { companyId: company.id, warehouseId: input.warehouseId, productId: variant.productId, variantId: variant.id, quantity: line.quantity, averageCost: line.unitCost },
        });
        await tx.inventoryMovement.create({
          data: { companyId: company.id, warehouseId: input.warehouseId, productId: variant.productId, variantId: variant.id, movementType: "PURCHASE", quantity: line.quantity, unitCost: line.unitCost, referenceType: "PURCHASE", referenceId: purchase.id, notes: `Ingreso por compra ${number}`, createdById: membership.userId },
        });
      }
      await tx.productVariant.update({ where: { id: variant.id }, data: { purchasePrice: line.unitCost } });
    }

    await tx.auditLog.create({
      data: { companyId: company.id, userId: membership.userId, action: "CREATE", entity: "PURCHASE", entityId: purchase.id, newValues: { number, supplier: businessName, subtotal, tax, total, taxCondition: input.taxCondition, taxRate: settings.taxRate, documentType: input.documentType } },
    });
    return { id: purchase.id, number };
  });

  revalidatePath("/compras");
  revalidatePath("/equipos");
  revalidatePath("/productos");
  revalidatePath("/kardex");
  revalidatePath("/reportes");
  return result;
}
