import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

export type CompanySettings = {
  taxRate: number;
  defaultTaxCondition: "TAXED" | "EXEMPT" | "UNAFFECTED";
  receiptSeries: string;
  invoiceSeries: string;
  salesNoteSeries: string;
  ticketFooter: string | null;
  defaultWarrantyDays: number;
  requireCashSession: boolean;
};

type SettingsRow = {
  taxRate: unknown;
  defaultTaxCondition: string;
  receiptSeries: string;
  invoiceSeries: string;
  salesNoteSeries: string;
  ticketFooter: string | null;
  defaultWarrantyDays: number;
  requireCashSession: boolean;
};

export async function getOperationalContext() {
  const company = await getActiveCompany();
  const membership = await prisma.companyUser.findFirst({
    where: { companyId: company.id, status: "ACTIVE", user: { status: "ACTIVE" } },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  });
  if (!membership) throw new Error("No existe un usuario activo para operar MOBIX.");

  const rows = await prisma.$queryRaw<SettingsRow[]>`
    SELECT "taxRate", "defaultTaxCondition", "receiptSeries", "invoiceSeries", "salesNoteSeries",
           "ticketFooter", "defaultWarrantyDays", "requireCashSession"
    FROM "company_settings" WHERE "companyId" = ${company.id} LIMIT 1
  `;
  const row = rows[0];
  const settings: CompanySettings = row
    ? {
        taxRate: Number(row.taxRate ?? 18),
        defaultTaxCondition: row.defaultTaxCondition as CompanySettings["defaultTaxCondition"],
        receiptSeries: row.receiptSeries,
        invoiceSeries: row.invoiceSeries,
        salesNoteSeries: row.salesNoteSeries,
        ticketFooter: row.ticketFooter,
        defaultWarrantyDays: Number(row.defaultWarrantyDays ?? 0),
        requireCashSession: Boolean(row.requireCashSession),
      }
    : {
        taxRate: 18,
        defaultTaxCondition: "TAXED",
        receiptSeries: "B001",
        invoiceSeries: "F001",
        salesNoteSeries: "NV01",
        ticketFooter: null,
        defaultWarrantyDays: 0,
        requireCashSession: true,
      };

  return {
    company,
    membership,
    settings,
    permissions: new Set(membership.role.permissions.map((item) => item.permission.code)),
  };
}

export async function requirePermission(code: string) {
  const context = await getOperationalContext();
  if (!context.membership.role.isSystem && !context.permissions.has(code)) {
    throw new Error("No tienes permisos para realizar esta operación.");
  }
  return context;
}
