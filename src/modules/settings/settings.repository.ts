import { getOperationalContext } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";

export async function getSettingsData() {
  const { company: activeCompany, settings } = await getOperationalContext();

  const [company, branches, warehouses] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: activeCompany.id } }),
    prisma.branch.findMany({
      where: { companyId: activeCompany.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.warehouse.findMany({
      where: { companyId: activeCompany.id },
      include: { branch: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    company: {
      id: company.id,
      businessName: company.businessName,
      tradeName: company.tradeName ?? "",
      ruc: company.ruc ?? "",
      email: company.email ?? "",
      phone: company.phone ?? "",
      address: company.address ?? "",
      logoUrl: company.logoUrl ?? "",
      currency: company.currency,
      timezone: company.timezone,
    },
    settings: {
      taxRate: settings.taxRate,
      defaultTaxCondition: settings.defaultTaxCondition,
      receiptSeries: settings.receiptSeries,
      invoiceSeries: settings.invoiceSeries,
      salesNoteSeries: settings.salesNoteSeries,
      ticketFooter: settings.ticketFooter ?? "",
      defaultWarrantyDays: settings.defaultWarrantyDays,
      requireCashSession: settings.requireCashSession,
    },
    branches: branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      code: branch.code,
      address: branch.address ?? "",
      phone: branch.phone ?? "",
      status: branch.status,
    })),
    warehouses: warehouses.map((warehouse) => ({
      id: warehouse.id,
      branchId: warehouse.branchId,
      branch: warehouse.branch.name,
      name: warehouse.name,
      code: warehouse.code,
      description: warehouse.description ?? "",
      isSaleable: warehouse.isSaleable,
      status: warehouse.status,
    })),
  };
}
