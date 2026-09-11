import { cache } from "react";
import { requireAuthContext } from "@/lib/auth-context";
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

const DEFAULT_SETTINGS: CompanySettings = {
  taxRate: 18,
  defaultTaxCondition: "TAXED",
  receiptSeries: "B001",
  invoiceSeries: "F001",
  salesNoteSeries: "NV01",
  ticketFooter: null,
  defaultWarrantyDays: 0,
  requireCashSession: true,
};

/**
 * El contexto operativo se comparte entre todas las capas de una misma petición.
 * Así permisos, configuración y módulos no repiten consultas idénticas a Supabase.
 */
const loadOperationalContext = cache(async () => {
  const auth = await requireAuthContext();
  const row = await prisma.companySettings.findUnique({
    where: { companyId: auth.company.id },
  });

  const settings: CompanySettings = row
    ? {
        taxRate: Number(row.taxRate),
        defaultTaxCondition: row.defaultTaxCondition,
        receiptSeries: row.receiptSeries,
        invoiceSeries: row.invoiceSeries,
        salesNoteSeries: row.salesNoteSeries,
        ticketFooter: row.ticketFooter,
        defaultWarrantyDays: row.defaultWarrantyDays,
        requireCashSession: row.requireCashSession,
      }
    : DEFAULT_SETTINGS;

  return {
    company: auth.company,
    membership: auth.membership,
    user: auth.user,
    settings,
    permissions: auth.permissions,
  };
});

export async function getOperationalContext() {
  return loadOperationalContext();
}

export async function requirePermission(code: string) {
  const context = await getOperationalContext();
  if (!context.membership.role.isSystem && !context.permissions.has(code)) {
    throw new Error("No tienes permisos para realizar esta operación.");
  }
  return context;
}
