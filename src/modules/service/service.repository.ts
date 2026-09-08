import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";
import type {
  ServiceCustomerOption,
  ServiceListItem,
  ServiceStatus,
  ServiceType,
  SoldUnitOption,
} from "./service-types";

const SERVICE_STATUSES = new Set<ServiceStatus>([
  "RECEIVED",
  "DIAGNOSIS",
  "WAITING_APPROVAL",
  "IN_REPAIR",
  "READY",
  "DELIVERED",
  "CANCELLED",
]);
const SERVICE_TYPES = new Set<ServiceType>(["WARRANTY", "TECHNICAL_SERVICE"]);

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

function asServiceStatus(value: string): ServiceStatus {
  return SERVICE_STATUSES.has(value as ServiceStatus) ? (value as ServiceStatus) : "RECEIVED";
}

function asServiceType(value: string): ServiceType {
  return SERVICE_TYPES.has(value as ServiceType) ? (value as ServiceType) : "TECHNICAL_SERVICE";
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
    prisma.serviceOrder.findMany({
      where: {
        companyId: company.id,
        productUnitId: { not: null },
        status: { notIn: ["DELIVERED", "CANCELLED"] },
      },
      select: { productUnitId: true },
    }),
    prisma.companyUser.findMany({
      where: { companyId: company.id, status: "ACTIVE", user: { status: "ACTIVE" } },
      orderBy: { createdAt: "asc" },
      select: { user: { select: { id: true, name: true } } },
    }),
  ]);

  const activeUnitIds = new Set(activeRows.flatMap((row) => row.productUnitId ? [row.productUnitId] : []));

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
  const q = filters.q?.trim();
  const status = SERVICE_STATUSES.has(filters.status as ServiceStatus) ? filters.status : undefined;
  const serviceType = SERVICE_TYPES.has(filters.type as ServiceType) ? filters.type : undefined;

  const rows = await prisma.serviceOrder.findMany({
    where: {
      companyId: company.id,
      ...(status ? { status } : {}),
      ...(serviceType ? { serviceType } : {}),
      ...(q ? {
        OR: [
          { serviceNumber: { contains: q, mode: "insensitive" } },
          { deviceName: { contains: q, mode: "insensitive" } },
          { identifier: { contains: q, mode: "insensitive" } },
          { customer: { is: { businessName: { contains: q, mode: "insensitive" } } } },
          { customer: { is: { firstName: { contains: q, mode: "insensitive" } } } },
          { customer: { is: { lastName: { contains: q, mode: "insensitive" } } } },
        ],
      } : {}),
    },
    include: {
      customer: true,
      technician: { select: { name: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: 250,
  });

  const items: ServiceListItem[] = rows.map((row) => ({
    id: row.id,
    serviceNumber: row.serviceNumber,
    serviceType: asServiceType(row.serviceType),
    status: asServiceStatus(row.status),
    customerName: displayCustomer(row.customer),
    customerPhone: row.customer.whatsapp ?? row.customer.phone,
    deviceName: row.deviceName,
    identifier: row.identifier,
    warrantyCovered: row.warrantyCovered,
    technicianName: row.technician?.name ?? null,
    estimatedCost: Number(row.estimatedCost),
    finalCost: Number(row.finalCost),
    receivedAt: row.receivedAt.toISOString(),
    expectedAt: row.expectedAt?.toISOString() ?? null,
  }));

  const open = items.filter((item) => !["DELIVERED", "CANCELLED"].includes(item.status));
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
  const row = await prisma.serviceOrder.findFirst({
    where: { id, companyId: company.id },
    include: {
      customer: true,
      technician: { select: { name: true } },
      sale: { select: { saleNumber: true } },
      events: {
        include: { createdBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    serviceNumber: row.serviceNumber,
    serviceType: asServiceType(row.serviceType),
    status: asServiceStatus(row.status),
    productUnitId: row.productUnitId,
    saleId: row.saleId,
    saleNumber: row.sale?.saleNumber ?? null,
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
    technicianName: row.technician?.name ?? null,
    estimatedCost: Number(row.estimatedCost),
    finalCost: Number(row.finalCost),
    receivedAt: row.receivedAt.toISOString(),
    expectedAt: row.expectedAt?.toISOString() ?? null,
    readyAt: row.readyAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    customer: {
      id: row.customerId,
      name: displayCustomer(row.customer),
      phone: row.customer.whatsapp ?? row.customer.phone,
      documentType: row.customer.documentType,
      documentNumber: row.customer.documentNumber,
      email: row.customer.email,
      address: row.customer.address,
    },
    events: row.events.map((event) => ({
      id: event.id,
      status: asServiceStatus(event.status),
      note: event.note,
      createdAt: event.createdAt.toISOString(),
      userName: event.createdBy.name,
    })),
  };
}
