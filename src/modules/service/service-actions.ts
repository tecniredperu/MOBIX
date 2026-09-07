"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";
import type { ServiceStatus, ServiceType } from "./service-types";

const SERVICE_TYPES = new Set<ServiceType>(["WARRANTY", "TECHNICAL_SERVICE"]);
const SERVICE_STATUSES = new Set<ServiceStatus>(["RECEIVED", "DIAGNOSIS", "WAITING_APPROVAL", "IN_REPAIR", "READY", "DELIVERED", "CANCELLED"]);

type ExistingOrderRow = { id: string; serviceNumber: string; serviceType: string; status: string; productUnitId: string | null };
type SequenceRow = { next: unknown };

function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function parseExpectedDate(value?: string) {
  if (!value?.trim()) return null;
  const date = new Date(`${value}T12:00:00-05:00`);
  if (Number.isNaN(date.getTime())) throw new Error("La fecha estimada de entrega no es válida.");
  return date;
}
function identifierLabel(identifiers: Array<{ type: string; value: string }>) {
  const imei = identifiers.find((item) => item.type === "IMEI_1")?.value;
  const serial = identifiers.find((item) => item.type === "SERIAL")?.value;
  return imei ? `IMEI ${imei}` : serial ? `Serie ${serial}` : null;
}

export async function createServiceOrderAction(input: {
  customerId?: string;
  productUnitId?: string;
  serviceType: ServiceType;
  deviceName?: string;
  brand?: string;
  model?: string;
  identifier?: string;
  reportedIssue: string;
  accessories?: string;
  physicalCondition?: string;
  estimatedCost?: number;
  expectedAt?: string;
}) {
  const { company, membership, settings } = await requirePermission("service.manage");
  if (!SERVICE_TYPES.has(input.serviceType)) throw new Error("Selecciona un tipo de atención válido.");

  const issue = input.reportedIssue?.trim();
  if (!issue || issue.length < 5) throw new Error("Describe con mayor detalle la falla reportada por el cliente.");
  const estimatedCost = money(Number(input.estimatedCost || 0));
  if (!Number.isFinite(estimatedCost) || estimatedCost < 0) throw new Error("El costo estimado no es válido.");
  const expectedAt = parseExpectedDate(input.expectedAt);

  let customerId = input.customerId?.trim() || "";
  let productUnitId: string | null = null;
  let saleId: string | null = null;
  let deviceName = input.deviceName?.trim() || "";
  let brand = input.brand?.trim() || null;
  let model = input.model?.trim() || null;
  let identifier = input.identifier?.trim() || null;
  let warrantyCovered = false;
  let warrantyExpiresAt: Date | null = null;
  let warehouseId: string | null = null;
  let productId: string | null = null;
  let variantId: string | null = null;
  let purchaseCost = 0;

  if (input.productUnitId) {
    const unit = await prisma.productUnit.findFirst({
      where: { id: input.productUnitId, companyId: company.id },
      include: {
        product: { include: { brand: true } },
        variant: true,
        identifiers: true,
        saleLinks: { include: { saleItem: { include: { sale: { include: { customer: true } } } } } },
      },
    });
    if (!unit) throw new Error("El equipo seleccionado ya no existe.");
    if (unit.status !== "SOLD") throw new Error("El equipo ya se encuentra en otro proceso o no está vendido.");

    const activeRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "service_orders"
      WHERE "companyId" = ${company.id} AND "productUnitId" = ${unit.id} AND "status" NOT IN ('DELIVERED','CANCELLED')
      LIMIT 1
    `;
    if (activeRows.length) throw new Error("Este IMEI ya tiene una atención de postventa abierta.");

    const latestLink = [...unit.saleLinks].sort((a, b) => +b.saleItem.sale.createdAt - +a.saleItem.sale.createdAt)[0];
    const sale = latestLink?.saleItem.sale;
    if (!sale?.customerId || !sale.customer) throw new Error("No se encontró el cliente asociado a la venta de este equipo.");

    productUnitId = unit.id;
    customerId = sale.customerId;
    saleId = sale.id;
    deviceName = unit.product.name;
    brand = unit.product.brand?.name ?? null;
    model = unit.product.model;
    identifier = identifierLabel(unit.identifiers);
    warehouseId = unit.warehouseId;
    productId = unit.productId;
    variantId = unit.variantId;
    purchaseCost = Number(unit.purchaseCost);

    const warrantyDays = unit.product.warrantyDays > 0 ? unit.product.warrantyDays : settings.defaultWarrantyDays;
    if (warrantyDays > 0) {
      warrantyExpiresAt = new Date(sale.createdAt.getTime() + warrantyDays * 86_400_000);
      warrantyCovered = warrantyExpiresAt.getTime() >= Date.now();
    }
    if (input.serviceType === "WARRANTY" && !warrantyCovered) throw new Error("La garantía configurada para este equipo ya venció o el producto no tiene días de garantía definidos.");
  } else {
    if (input.serviceType === "WARRANTY") throw new Error("Una garantía debe vincularse a un equipo vendido por la tienda.");
    if (!customerId) throw new Error("Selecciona el cliente que entrega el equipo.");
    const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId: company.id, status: "ACTIVE" }, select: { id: true } });
    if (!customer) throw new Error("El cliente seleccionado ya no está disponible.");
    if (!deviceName || deviceName.length < 2) throw new Error("Ingresa el equipo que se recibe para servicio técnico.");
  }

  const id = randomUUID();
  const eventId = randomUUID();
  const serviceNumber = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ locked: number }>>`WITH l AS (SELECT pg_advisory_xact_lock(hashtext(${`${company.id}:service-order`}))) SELECT 1::int AS "locked" FROM l`;
    const sequence = await tx.$queryRaw<SequenceRow[]>`
      SELECT COALESCE(MAX(CASE WHEN "serviceNumber" ~ '^ST001-[0-9]+$' THEN CAST(SPLIT_PART("serviceNumber", '-', 2) AS BIGINT) END), 0) + 1 AS "next"
      FROM "service_orders" WHERE "companyId" = ${company.id}
    `;
    const number = `ST001-${String(Number(sequence[0]?.next ?? 1)).padStart(6, "0")}`;

    await tx.$executeRaw`
      INSERT INTO "service_orders" (
        "id", "companyId", "customerId", "productUnitId", "saleId", "serviceNumber",
        "serviceType", "status", "deviceName", "brand", "model", "identifier",
        "reportedIssue", "accessories", "physicalCondition", "warrantyCovered",
        "warrantyExpiresAt", "estimatedCost", "expectedAt", "createdById", "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${company.id}, ${customerId}, ${productUnitId}, ${saleId}, ${number},
        ${input.serviceType}, 'RECEIVED', ${deviceName}, ${brand}, ${model}, ${identifier},
        ${issue}, ${input.accessories?.trim() || null}, ${input.physicalCondition?.trim() || null},
        ${warrantyCovered}, ${warrantyExpiresAt}, ${estimatedCost}, ${expectedAt},
        ${membership.userId}, NOW(), NOW()
      )
    `;
    await tx.$executeRaw`
      INSERT INTO "service_order_events" ("id", "serviceOrderId", "status", "note", "createdById", "createdAt")
      VALUES (${eventId}, ${id}, 'RECEIVED', ${input.serviceType === "WARRANTY" ? "Equipo recibido por garantía" : "Equipo recibido para servicio técnico"}, ${membership.userId}, NOW())
    `;

    if (productUnitId) {
      const newStatus = input.serviceType === "WARRANTY" ? "WARRANTY" : "TECHNICAL_SERVICE";
      const updated = await tx.productUnit.updateMany({ where: { id: productUnitId, companyId: company.id, status: "SOLD" }, data: { status: newStatus } });
      if (updated.count !== 1) throw new Error("El equipo cambió de estado mientras se registraba la recepción.");
      if (input.serviceType === "WARRANTY" && warehouseId && productId && variantId) {
        await tx.inventoryMovement.create({ data: { companyId: company.id, warehouseId, productId, variantId, productUnitId, movementType: "WARRANTY_IN", quantity: 1, unitCost: purchaseCost, referenceType: "SERVICE_ORDER", referenceId: id, notes: `Ingreso por garantía ${number}`, createdById: membership.userId } });
      }
    }

    await tx.auditLog.create({ data: { companyId: company.id, userId: membership.userId, action: "CREATE", entity: "SERVICE_ORDER", entityId: id, newValues: { serviceNumber: number, serviceType: input.serviceType, customerId, productUnitId, saleId, warrantyCovered, estimatedCost } } });
    return number;
  });

  revalidatePath("/servicio-tecnico");
  revalidatePath("/equipos");
  revalidatePath("/kardex");
  return { id, serviceNumber };
}

export async function updateServiceOrderAction(input: {
  orderId: string;
  status: ServiceStatus;
  technicianId?: string;
  diagnosis?: string;
  workPerformed?: string;
  estimatedCost?: number;
  finalCost?: number;
  note?: string;
}) {
  const { company, membership } = await requirePermission("service.manage");
  if (!SERVICE_STATUSES.has(input.status)) throw new Error("El estado seleccionado no es válido.");
  const estimatedCost = money(Number(input.estimatedCost || 0));
  const finalCost = money(Number(input.finalCost || 0));
  if (![estimatedCost, finalCost].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("Los importes del servicio no son válidos.");

  if (input.technicianId) {
    const technician = await prisma.companyUser.findFirst({ where: { companyId: company.id, userId: input.technicianId, status: "ACTIVE", user: { status: "ACTIVE" } }, select: { userId: true } });
    if (!technician) throw new Error("El técnico seleccionado no pertenece a la empresa o está inactivo.");
  }

  const rows = await prisma.$queryRaw<ExistingOrderRow[]>`
    SELECT "id", "serviceNumber", "serviceType", "status", "productUnitId"
    FROM "service_orders" WHERE "id" = ${input.orderId} AND "companyId" = ${company.id} LIMIT 1
  `;
  const order = rows[0];
  if (!order) throw new Error("La orden de servicio ya no existe.");
  if (["DELIVERED", "CANCELLED"].includes(order.status)) throw new Error("Una atención cerrada ya no puede modificarse.");

  await prisma.$transaction(async (tx) => {
    const readyAt = input.status === "READY" ? new Date() : null;
    const deliveredAt = input.status === "DELIVERED" ? new Date() : null;
    const changed = await tx.$executeRaw`
      UPDATE "service_orders"
      SET "status" = ${input.status}, "technicianId" = ${input.technicianId?.trim() || null},
          "diagnosis" = ${input.diagnosis?.trim() || null}, "workPerformed" = ${input.workPerformed?.trim() || null},
          "estimatedCost" = ${estimatedCost}, "finalCost" = ${finalCost},
          "readyAt" = COALESCE(${readyAt}, "readyAt"), "deliveredAt" = COALESCE(${deliveredAt}, "deliveredAt"), "updatedAt" = NOW()
      WHERE "id" = ${order.id} AND "companyId" = ${company.id} AND "status" NOT IN ('DELIVERED','CANCELLED')
    `;
    if (!changed) throw new Error("La orden cambió de estado durante la actualización. Actualiza la pantalla e inténtalo nuevamente.");

    if (order.status !== input.status || input.note?.trim()) {
      await tx.$executeRaw`INSERT INTO "service_order_events" ("id", "serviceOrderId", "status", "note", "createdById", "createdAt") VALUES (${randomUUID()}, ${order.id}, ${input.status}, ${input.note?.trim() || null}, ${membership.userId}, NOW())`;
    }

    if (order.productUnitId && ["DELIVERED", "CANCELLED"].includes(input.status)) {
      const unit = await tx.productUnit.findFirst({ where: { id: order.productUnitId, companyId: company.id }, select: { id: true, warehouseId: true, productId: true, variantId: true, purchaseCost: true, status: true } });
      if (unit && ["WARRANTY", "TECHNICAL_SERVICE"].includes(unit.status)) {
        await tx.productUnit.update({ where: { id: unit.id }, data: { status: "SOLD" } });
        if (order.serviceType === "WARRANTY") {
          await tx.inventoryMovement.create({ data: { companyId: company.id, warehouseId: unit.warehouseId, productId: unit.productId, variantId: unit.variantId, productUnitId: unit.id, movementType: "WARRANTY_OUT", quantity: 1, unitCost: Number(unit.purchaseCost), referenceType: "SERVICE_ORDER", referenceId: order.id, notes: `${input.status === "DELIVERED" ? "Entrega" : "Salida"} de garantía ${order.serviceNumber}`, createdById: membership.userId } });
        }
      }
    }

    await tx.auditLog.create({ data: { companyId: company.id, userId: membership.userId, action: "UPDATE", entity: "SERVICE_ORDER", entityId: order.id, oldValues: { status: order.status }, newValues: { status: input.status, technicianId: input.technicianId || null, estimatedCost, finalCost, note: input.note?.trim() || null } } });
  });

  revalidatePath("/servicio-tecnico");
  revalidatePath(`/servicio-tecnico/${order.id}`);
  revalidatePath("/equipos");
  revalidatePath("/kardex");
  return { id: order.id };
}
