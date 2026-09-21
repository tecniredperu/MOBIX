import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

const ACTIONS = ["CREATE", "UPDATE", "CANCEL", "ACTIVATE", "DEACTIVATE", "LOGIN", "LOGOUT"] as const;

type AuditFilters = {
  q?: string;
  action?: string;
  entity?: string;
  userId?: string;
  page?: number;
  pageSize?: number;
};

const SENSITIVE_KEYS = /(password|passwordhash|secret|token|cookie|authorization|credential|session)/i;

function redactValue(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEYS.test(key)) return "[REDACTADO]";
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        redactValue(childValue, childKey),
      ]),
    );
  }
  return value;
}

function normalizePage(value: number | undefined) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 1;
}

export async function getAuditPage(filters: AuditFilters = {}) {
  const company = await getActiveCompany();
  const page = normalizePage(filters.page);
  const pageSize = Math.min(100, Math.max(20, Number(filters.pageSize || 50)));
  const q = filters.q?.trim() || undefined;
  const action = ACTIONS.includes(filters.action as typeof ACTIONS[number])
    ? filters.action as typeof ACTIONS[number]
    : undefined;
  const entity = filters.entity?.trim() || undefined;
  const userId = filters.userId?.trim() || undefined;

  const where = {
    companyId: company.id,
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
    ...(userId ? { userId } : {}),
    ...(q ? {
      OR: [
        { entity: { contains: q, mode: "insensitive" as const } },
        { entityId: { contains: q, mode: "insensitive" as const } },
        { user: { is: { name: { contains: q, mode: "insensitive" as const } } } },
        { user: { is: { email: { contains: q, mode: "insensitive" as const } } } },
      ],
    } : {}),
  };

  const [rows, total, users, entities] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
    prisma.companyUser.findMany({
      where: { companyId: company.id },
      orderBy: { user: { name: "asc" } },
      select: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: { companyId: company.id },
      distinct: ["entity"],
      select: { entity: true },
      orderBy: { entity: "asc" },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      oldValues: redactValue(row.oldValues),
      newValues: redactValue(row.newValues),
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
      user: row.user ? {
        id: row.user.id,
        name: row.user.name,
        email: row.user.email,
      } : null,
    })),
    filters: {
      q: q ?? "",
      action: action ?? "",
      entity: entity ?? "",
      userId: userId ?? "",
    },
    options: {
      actions: [...ACTIONS],
      entities: entities.map((item) => item.entity),
      users: users.map((item) => item.user),
    },
    pagination: {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}
