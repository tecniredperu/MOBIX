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

const loadCompanySettings = cache(async (companyId: string): Promise<CompanySettings> => {
  const row = await prisma.companySettings.findUnique({
    where: { companyId },
  });

  return row
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
});

/**
 * Contexto operativo completo. Carga settings solo cuando el módulo realmente
 * los necesita. La autorización básica no debe pagar esta consulta.
 */
const loadOperationalContext = cache(async () => {
  const auth = await requireAuthContext();
  const settings = await loadCompanySettings(auth.company.id);

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
  const auth = await requireAuthContext();

  if (!auth.role.isSystem && !auth.permissions.has(code)) {
    throw new Error("No tienes permisos para realizar esta operación.");
  }

  return {
    company: auth.company,
    membership: auth.membership,
    user: auth.user,
    permissions: auth.permissions,
  };
}

export async function requirePermissionWithSettings(code: string) {
  const context = await requirePermission(code);
  const settings = await loadCompanySettings(context.company.id);
  return { ...context, settings };
}
