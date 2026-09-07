import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";
import type {
  ServiceCustomerOption,
  ServiceListItem,
  ServiceStatus,
  ServiceType,
  SoldUnitOption,
} from "./service-types";

type ServiceRow = {
  id: string;
  serviceNumber: string;
  serviceType: string;
  status: string;
  deviceName: string;
  identifier: string | null;
  warrantyCovered: boolean;
  estimatedCost: unknown;
  finalCost: unknown;
  receivedAt: Date;
  expectedAt: Date | null;
  customerName: string;
  customerPhone: string | null;
  technicianName: string | null;
};

type ServiceDetailRow = ServiceRow & {
  companyId: string;
  customerId: string;
  productUnitId: string | null;
  saleId: string | null;
  brand: string | null;
  model: string | null;
  reportedIssue: string;
  accessories: string | null;
  physicalCondition: string | null;
  warrantyExpiresAt: Date | null;
  diagnosis: string | null;
  workPerformed: string | null;
  technicianId: string | null;
  readyAt: Date | null;
  deliveredAt: Date | null;
  customerDocumentType: string | null;
  customerDocumentNumber: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  saleNumber: string | null;
};

type ServiceEventRow = {
  id: string;
  status: string;
  note: string | null;
  createdAt: Date;
  userName: string;
};

function displayCustomer(customer: {
  businessName: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  if (customer.businessName?.trim()) return customer.businessName;
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || "Cliente";
}

function variantLabel(variant: { ram: string | null; storage: string | null; color: string | null }) {
  return [variant.ram, variant.storage, variant.color].filter(Boolean).join(" / ") || "Variante base";
}

function unitIdentifier(identifiers: Array<{ type: string; value: string }>) {
  const imei1 = identifiers.find((item) => item.type === "IMEI_1")?.value;
  const serial = identifiers.find((item) => item.type === "SERIAL")?.value;
  return imei1 ? `IMEI ${imei1}` : serial ? `Serie ${serial}` : "Sin identificador";
}

function warrantyExpiry(soldAt: Date, days: number) {
  if (days <= 0) return null;
  return new Date(soldAt.getTime() + days * 86_400_000);
}

export async function getServiceContext() {
  const company = await getActiveCompany();
  const [customersRaw, unitsRaw, activeRows, usersRaw] = await Promise.all([
    prisma.customer.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
    prisma.productUnit.findMany({
      where: { companyId: company.id, status: "SOLD" },
      orderBy: { updatedAt: "desc" },
      take: 300,
      include: {
        product: { include: { brand: true } },
        variant: true,
        identifiers: true,
        saleLinks: {
          include: {
            saleItem: {
              include: { sale: { include: { customer: true } } },
            },
          },
        },
      },
    }),
    prisma.$queryRaw<Array<{ productUnitId: string | null }>>`
      SELECT "productUnitId"
      FROM "service_orders"
      WHERE "companyId" = ${company.id}
        AND "productUnitId" IS NOT NULL
        AND "status" NOT IN ('DELIVERED','CANCELLED')
    `,
    prisma.companyUser.findMany({
      where: { companyId: company.id, status: "ACTIVE", user: { status: "ACTIVE" } },
      orderBy: { createdAt: "asc" },
      select: { user: { select: { id: true, name: true } } },
    }),
  ]);

  const activeUnitIds = new Set(activeRows.map((row) => row.productUnitId).filter(Boolean));

  const customers: ServiceCustomerOption[] = customersRaw.map((customer) => ({
    id: customer.id,
    name: displayCustomer(customer),
    document: customer.documentNumber
      ? `${customer.documentType ?? "Doc."} ${customer.documentNumber}`
      : null,
    phone: customer.whatsapp ?? customer.phone,
  }));

  const soldUnits: SoldUnitOption[] = unitsRaw.flatMap((unit) => {
    if (activeUnitIds.has(unit.id)) return [];
    const links = [...unit.saleLinks].sort(
      (a, b) => +b.saleItem.sale.createdAt - +a.saleItem.sale.createdAt,
    );
    const latest = links[0]?.saleItem.sale;
    if (!latest?.customerId || !latest.customer) return [];
    const warrantyDays = unit.product.warrantyDays ?? 0;
    const expires = warrantyExpiry(latest.createdAt, warrantyDays);
    return [{
      id: unit.id,
      saleId: latest.id,
      saleNumber: latest.saleNumber,
      soldAt: latest.createdAt.toISOString(),
      customerId: latest.customerId,
      customerName: displayCustomer(latest.customer),
      customerPhone: latest.customer.whatsapp ?? latest.customer.phone,
      productName: unit.product.name,
      brand: unit.product.brand?.name ?? "Sin marca",
      model: unit.product.model,
      variant: variantLabel(unit.variant),
      identifier: unitIdentifier(unit.identifiers),
      warrantyDays,
      warrantyExpiresAt: expires?.toISOString() ?? null,
      withinWarranty: Boolean(expires && expires.getTime() >= Date.now()),
    }];
  });

  return {
    companyName: company.tradeName ?? company.businessName,
    customers,
    soldUnits,
    technicians: usersRaw.map((membership) => membership.user),
  };
}

export async function getServiceOrders(filters: {
  q?: string;
  status?: string;
  type?: string;
} = {}) {
  const company = await getActiveCompany();
  const rows = await prisma.$queryRaw<ServiceRow[]>`
    SELECT
      so."id", so."serviceNumber", so."serviceType", so."status", so."deviceName",
      so."identifier", so."warrantyCovered", so."estimatedCost", so."finalCost",
      so."receivedAt", so."expectedAt",
      COALESCE(c."businessName", NULLIF(TRIM(CONCAT(COALESCE(c."firstName", ''), ' ', COALESCE(c."lastName", ''))), ''), 'Cliente') AS "customerName",
      COALESCE(c."whatsapp", c."phone") AS "customerPhone",
      u."name" AS "technicianName"
    FROM "service_orders" so
    INNER JOIN "customers" c ON c."id" = so."customerId"
    LEFT JOIN "users" u ON u."id" = so."technicianId"
    WHERE so."companyId" = ${company.id}
    ORDER BY so."receivedAt" DESC
    LIMIT 250
  `;

  const q = filters.q?.trim().toLowerCase();
  const allowedStatuses = new Set(["RECEIVED","DIAGNOSIS","WAITING_APPROVAL","IN_REPAIR","READY","DELIVERED","CANCELLED"]);
  const allowedTypes = new Set(["WARRANTY","TECHNICAL_SERVICE"]);
  const items: ServiceListItem[] = rows
    .filter((row) => !filters.status || !allowedStatuses.has(filters.status) || row.status === filters.status)
    .filter((row) => !filters.type || !allowedTypes.has(filters.type) || row.serviceType === filters.type)
    .filter((row) => !q || [row.serviceNumber, row.customerName, row.deviceName, row.identifier ?? ""].join(" ").toLowerCase().includes(q))
    .map((row) => ({
      id: row.id,
      serviceNumber: row.serviceNumber,
      serviceType: row.serviceType as ServiceType,
      status: row.status as ServiceStatus,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      deviceName: row.deviceName,
      identifier: row.identifier,
      warrantyCovered: row.warrantyCovered,
      technicianName: row.technicianName,
      estimatedCost: Number(row.estimatedCost ?? 0),
      finalCost: Number(row.finalCost ?? 0),
      receivedAt: row.receivedAt.toISOString(),
      expectedAt: row.expectedAt?.toISOString() ?? null,
    }));

  const open = items.filter((item) => !["DELIVERED","CANCELLED"].includes(item.status));
  return {
    items,
    summary: {
      active: open.length,
      warranty: open.filter((item) => item.serviceType === "WARRANTY").length,
      repairing: open.filter((item) => item.status === "IN_REPAIR").length,
      ready: open.filter((item) => item.status === "READY").length,
    },
  };
}

export async function getServiceOrderDetail(id: string) {
  const company = await getActiveCompany();
  const rows = await prisma.$queryRaw<ServiceDetailRow[]>`
    SELECT
      so.*,
      COALESCE(c."businessName", NULLIF(TRIM(CONCAT(COALESCE(c."firstName", ''), ' ', COALESCE(c."lastName", ''))), ''), 'Cliente') AS "customerName",
      COALESCE(c."whatsapp", c."phone") AS "customerPhone",
      c."documentType" AS "customerDocumentType", c."documentNumber" AS "customerDocumentNumber",
      c."email" AS "customerEmail", c."address" AS "customerAddress",
      u."name" AS "technicianName", s."saleNumber"
    FROM "service_orders" so
    INNER JOIN "customers" c ON c."id" = so."customerId"
    LEFT JOIN "users" u ON u."id" = so."technicianId"
    LEFT JOIN "sales" s ON s."id" = so."saleId"
    WHERE so."id" = ${id} AND so."companyId" = ${company.id}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;

  const events = await prisma.$queryRaw<ServiceEventRow[]>`
    SELECT e."id", e."status", e."note", e."createdAt", u."name" AS "userName"
    FROM "service_order_events" e
    INNER JOIN "users" u ON u."id" = e."createdById"
    WHERE e."serviceOrderId" = ${id}
    ORDER BY e."createdAt" DESC
  `;

  return {
    id: row.id,
    serviceNumber: row.serviceNumber,
    serviceType: row.serviceType as ServiceType,
    status: row.status as ServiceStatus,
    productUnitId: row.productUnitId,
    saleId: row.saleId,
    saleNumber: row.saleNumber,
    deviceName: row.deviceName,
    brand: row.brand,
    model: row.model,
    identifier: row.identifier,
    reportedIssue: row.reportedIssue,
    accessories: row.accessories,
    physicalCondition: row.physicalCondition,
    warrantyCovered: row.warrantyCovered,
    warrantyExpiresAt: row.warrantyExpiresAt?.toISOString() ?? null,
    diagnosis: row.diagnosis,
    workPerformed: row.workPerformed,
    technicianId: row.technicianId,
    technicianName: row.technicianName,
    estimatedCost: Number(row.estimatedCost ?? 0),
    finalCost: Number(row.finalCost ?? 0),
    receivedAt: row.receivedAt.toISOString(),
    expectedAt: row.expectedAt?.toISOString() ?? null,
    readyAt: row.readyAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    customer: {
      id: row.customerId,
      name: row.customerName,
      phone: row.customerPhone,
      documentType: row.customerDocumentType,
      documentNumber: row.customerDocumentNumber,
      email: row.customerEmail,
      address: row.customerAddress,
    },
    events: events.map((event) => ({
      id: event.id,
      status: event.status as ServiceStatus,
      note: event.note,
      createdAt: event.createdAt.toISOString(),
      userName: event.userName,
    })),
  };
}
