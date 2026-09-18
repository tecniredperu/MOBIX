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
} | null | undefined) {
  if (!customer) return "Consumidor final";
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

async function loadServiceCustomers(companyId: string, q = "", take = 20): Promise<ServiceCustomerOption[]> {
  const query = q.trim();
  const rows = await prisma.customer.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      ...(query ? {
        OR: [
          { documentNumber: { contains: query, mode: "insensitive" } },
          { businessName: { contains: query, mode: "insensitive" } },
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
          { whatsapp: { contains: query, mode: "insensitive" } },
        ],
      } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take,
  });
  return rows.map((customer) => ({
    id: customer.id,
    name: displayCustomer(customer),
    document: customer.documentNumber ? `${customer.documentType ?? "Doc."} ${customer.documentNumber}` : null,
    phone: customer.whatsapp ?? customer.phone,
  }));
}

async function loadSoldUnits(companyId: string, q = "", take = 20): Promise<SoldUnitOption[]> {
  const query = q.trim();
  const rows = await prisma.productUnit.findMany({
    where: {
      companyId,
      status: "SOLD",
      serviceOrders: { none: { companyId, status: { notIn: ["DELIVERED", "CANCELLED"] } } },
      ...(query ? {
        OR: [
          { product: { name: { contains: query, mode: "insensitive" } } },
          { product: { model: { contains: query, mode: "insensitive" } } },
          { variant: { sku: { contains: query, mode: "insensitive" } } },
          { identifiers: { some: { value: { contains: query, mode: "insensitive" } } } },
        ],
      } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take,
    include: {
      product: { include: { brand: true } },
      variant: true,
      identifiers: true,
      saleLinks: {
        include: {
          saleItem: { include: { sale: { include: { customer: true } } } },
        },
      },
    },
  });

  return rows.flatMap((unit) => {
    const links = [...unit.saleLinks].sort((a, b) => +b.saleItem.sale.createdAt - +a.saleItem.sale.createdAt);
    const latestLink = links[0];
    const latest = latestLink?.saleItem.sale;
    if (!latest) return [];

    const legacyWarrantyDays = unit.product.warrantyDays ?? 0;
    const warrantyDays = latestLink.warrantyDays || legacyWarrantyDays;
    const warrantyStartsAt = latestLink.warrantyStartsAt ?? latest.createdAt;
    const expires = latestLink.warrantyExpiresAt
      ?? warrantyExpiry(warrantyStartsAt, warrantyDays);

    return [{
      id: unit.id,
      saleId: latest.id,
      saleNumber: latest.saleNumber,
      soldAt: latest.createdAt.toISOString(),
      customerId: latest.customerId ?? "",
      customerName: displayCustomer(latest.customer),
      customerPhone: latest.customer?.whatsapp ?? latest.customer?.phone ?? null,
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
}

export async function searchServiceCustomers(q = "") {
  const company = await getActiveCompany();
  return loadServiceCustomers(company.id, q, 20);
}

export async function searchServiceSoldUnits(q = "") {
  const company = await getActiveCompany();
  return loadSoldUnits(company.id, q, 20);
}

export async function getServiceTechnicians() {
  const company = await getActiveCompany();
  const rows = await prisma.companyUser.findMany({
    where: { companyId: company.id, status: "ACTIVE", user: { status: "ACTIVE" } },
    orderBy: { createdAt: "asc" },
    select: { user: { select: { id: true, name: true } } },
  });
  return rows.map((membership) => membership.user);
}

export async function getServiceContext() {
  const company = await getActiveCompany();
  const [customers, soldUnits] = await Promise.all([
    loadServiceCustomers(company.id, "", 20),
    loadSoldUnits(company.id, "", 20),
  ]);
  return { companyName: company.tradeName ?? company.businessName, customers, soldUnits };
}

export async function getServiceOrders(filters: {
  q?: string;
  status?: string;
  type?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const company = await getActiveCompany();
  const q = filters.q?.trim();
  const status = SERVICE_STATUSES.has(filters.status as ServiceStatus) ? filters.status : undefined;
  const serviceType = SERVICE_TYPES.has(filters.type as ServiceType) ? filters.type : undefined;
  const pageSize = Math.min(100, Math.max(20, filters.pageSize ?? 50));
  const page = Math.max(1, filters.page ?? 1);

  const where = {
    companyId: company.id,
    ...(status ? { status } : {}),
    ...(serviceType ? { serviceType } : {}),
    ...(q ? {
      OR: [
        { serviceNumber: { contains: q, mode: "insensitive" as const } },
        { deviceName: { contains: q, mode: "insensitive" as const } },
        { identifier: { contains: q, mode: "insensitive" as const } },
        { customer: { is: { businessName: { contains: q, mode: "insensitive" as const } } } },
        { customer: { is: { firstName: { contains: q, mode: "insensitive" as const } } } },
        { customer: { is: { lastName: { contains: q, mode: "insensitive" as const } } } },
      ],
    } : {}),
  };

  const [rows, total, grouped] = await Promise.all([
    prisma.serviceOrder.findMany({
      where,
      include: { customer: true, technician: { select: { name: true } } },
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.serviceOrder.count({ where }),
    prisma.serviceOrder.groupBy({
      by: ["status", "serviceType"],
      where: { companyId: company.id, status: { notIn: ["DELIVERED", "CANCELLED"] } },
      _count: { _all: true },
    }),
  ]);

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

  const countBy = (predicate: (row: (typeof grouped)[number]) => boolean) => grouped.filter(predicate).reduce((sum, row) => sum + row._count._all, 0);
  return {
    items,
    summary: {
      active: countBy(() => true),
      warranty: countBy((row) => row.serviceType === "WARRANTY"),
      repairing: countBy((row) => row.status === "IN_REPAIR"),
      ready: countBy((row) => row.status === "READY"),
    },
    pagination: { page, pageSize, total },
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
