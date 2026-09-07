"use server";

import { requirePermission } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";
import { revalidatePaths } from "@/lib/revalidation";

const PERU_IGV_RATE = 18;
const ENTITY_STATUSES = new Set(["ACTIVE", "INACTIVE"] as const);
const TAX_CONDITIONS = new Set(["TAXED", "EXEMPT", "UNAFFECTED"] as const);
const SETTINGS_PATHS = [
  "/configuracion",
  "/pos",
  "/ventas",
  "/productos",
  "/compras",
  "/caja",
  "/reportes",
] as const;

type EntityStatusInput = "ACTIVE" | "INACTIVE";
type TaxConditionInput = "TAXED" | "EXEMPT" | "UNAFFECTED";

type CompanyInput = {
  businessName: string;
  tradeName?: string;
  ruc?: string;
  email?: string;
  phone?: string;
  address?: string;
  logoUrl?: string;
  currency: string;
  timezone: string;
};

type CompanySettingsInput = {
  taxRate: number;
  defaultTaxCondition: TaxConditionInput;
  receiptSeries: string;
  invoiceSeries: string;
  salesNoteSeries: string;
  ticketFooter?: string;
  defaultWarrantyDays: number;
  requireCashSession: boolean;
};

type BranchInput = {
  id?: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  status: EntityStatusInput;
};

type WarehouseInput = {
  id?: string;
  branchId: string;
  name: string;
  code: string;
  description?: string;
  isSaleable: boolean;
  status: EntityStatusInput;
};

function cleanCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

function cleanRuc(value: string) {
  return value.replace(/\D/g, "");
}

function nullableText(value?: string) {
  return value?.trim() || null;
}

function refreshSettings() {
  revalidatePaths(SETTINGS_PATHS);
}

export async function updateCompanyAction(input: CompanyInput) {
  const { company, membership } = await requirePermission("settings.manage");
  const businessName = input.businessName.trim();
  const ruc = cleanRuc(input.ruc || "");

  if (businessName.length < 3) throw new Error("Ingresa la razón social.");
  if (ruc && ruc.length !== 11) throw new Error("El RUC debe tener 11 dígitos.");

  const companyData = {
    businessName,
    tradeName: nullableText(input.tradeName),
    ruc: ruc || null,
    email: nullableText(input.email),
    phone: nullableText(input.phone),
    address: nullableText(input.address),
    logoUrl: nullableText(input.logoUrl),
    currency: input.currency?.trim() || "PEN",
    timezone: input.timezone?.trim() || "America/Lima",
  };

  await prisma.$transaction(async (tx) => {
    await tx.company.update({ where: { id: company.id }, data: companyData });
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "UPDATE",
        entity: "COMPANY",
        entityId: company.id,
        newValues: {
          businessName: companyData.businessName,
          tradeName: companyData.tradeName,
          ruc: companyData.ruc,
        },
      },
    });
  });

  refreshSettings();
}

export async function updateCompanySettingsAction(input: CompanySettingsInput) {
  const { company, membership } = await requirePermission("settings.manage");

  if (!Number.isFinite(input.taxRate) || Math.abs(Number(input.taxRate) - PERU_IGV_RATE) > 0.001) {
    throw new Error("MOBIX Perú utiliza IGV general de 18%. Para operaciones sin IGV usa Exonerado o Inafecto.");
  }
  if (!TAX_CONDITIONS.has(input.defaultTaxCondition)) {
    throw new Error("La condición tributaria predeterminada no es válida.");
  }
  if (!Number.isInteger(input.defaultWarrantyDays) || input.defaultWarrantyDays < 0 || input.defaultWarrantyDays > 3650) {
    throw new Error("Los días de garantía no son válidos.");
  }

  const receiptSeries = cleanCode(input.receiptSeries);
  const invoiceSeries = cleanCode(input.invoiceSeries);
  const salesNoteSeries = cleanCode(input.salesNoteSeries);
  if (!receiptSeries || !invoiceSeries || !salesNoteSeries) {
    throw new Error("Configura las series de comprobantes.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "company_settings" (
        "companyId", "taxRate", "defaultTaxCondition", "receiptSeries", "invoiceSeries",
        "salesNoteSeries", "ticketFooter", "defaultWarrantyDays", "requireCashSession",
        "createdAt", "updatedAt"
      ) VALUES (
        ${company.id}, ${PERU_IGV_RATE}, ${input.defaultTaxCondition}, ${receiptSeries}, ${invoiceSeries},
        ${salesNoteSeries}, ${nullableText(input.ticketFooter)}, ${input.defaultWarrantyDays},
        ${input.requireCashSession}, NOW(), NOW()
      )
      ON CONFLICT ("companyId") DO UPDATE SET
        "taxRate" = EXCLUDED."taxRate",
        "defaultTaxCondition" = EXCLUDED."defaultTaxCondition",
        "receiptSeries" = EXCLUDED."receiptSeries",
        "invoiceSeries" = EXCLUDED."invoiceSeries",
        "salesNoteSeries" = EXCLUDED."salesNoteSeries",
        "ticketFooter" = EXCLUDED."ticketFooter",
        "defaultWarrantyDays" = EXCLUDED."defaultWarrantyDays",
        "requireCashSession" = EXCLUDED."requireCashSession",
        "updatedAt" = NOW()
    `;

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "UPDATE",
        entity: "COMPANY_SETTINGS",
        entityId: company.id,
        newValues: {
          taxRate: PERU_IGV_RATE,
          defaultTaxCondition: input.defaultTaxCondition,
          receiptSeries,
          invoiceSeries,
          salesNoteSeries,
          defaultWarrantyDays: input.defaultWarrantyDays,
          requireCashSession: input.requireCashSession,
        },
      },
    });
  });

  refreshSettings();
}

export async function saveBranchAction(input: BranchInput) {
  const { company, membership } = await requirePermission("settings.manage");
  const name = input.name.trim();
  const code = cleanCode(input.code);

  if (!ENTITY_STATUSES.has(input.status)) throw new Error("El estado de la sucursal no es válido.");
  if (name.length < 2 || !code) throw new Error("Nombre y código de sucursal son obligatorios.");

  const duplicate = await prisma.branch.findFirst({
    where: {
      companyId: company.id,
      code,
      id: input.id ? { not: input.id } : undefined,
    },
    select: { id: true },
  });
  if (duplicate) throw new Error("Ya existe una sucursal con ese código.");

  if (input.id) {
    const current = await prisma.branch.findFirst({
      where: { id: input.id, companyId: company.id },
      select: { id: true },
    });
    if (!current) throw new Error("La sucursal ya no existe o no pertenece a la empresa.");
  }

  const branch = await prisma.$transaction(async (tx) => {
    const saved = input.id
      ? await tx.branch.update({
          where: { id: input.id },
          data: {
            name,
            code,
            address: nullableText(input.address),
            phone: nullableText(input.phone),
            status: input.status,
          },
        })
      : await tx.branch.create({
          data: {
            companyId: company.id,
            name,
            code,
            address: nullableText(input.address),
            phone: nullableText(input.phone),
            status: input.status,
          },
        });

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: input.id ? "UPDATE" : "CREATE",
        entity: "BRANCH",
        entityId: saved.id,
        newValues: { name: saved.name, code: saved.code, status: saved.status },
      },
    });
    return saved;
  });

  refreshSettings();
  return { id: branch.id };
}

export async function saveWarehouseAction(input: WarehouseInput) {
  const { company, membership } = await requirePermission("settings.manage");
  const name = input.name.trim();
  const code = cleanCode(input.code);

  if (!ENTITY_STATUSES.has(input.status)) throw new Error("El estado del almacén no es válido.");
  if (name.length < 2 || !code) throw new Error("Nombre y código de almacén son obligatorios.");

  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, companyId: company.id },
    select: { id: true },
  });
  if (!branch) throw new Error("Sucursal inválida.");

  const duplicate = await prisma.warehouse.findFirst({
    where: {
      companyId: company.id,
      code,
      id: input.id ? { not: input.id } : undefined,
    },
    select: { id: true },
  });
  if (duplicate) throw new Error("Ya existe un almacén con ese código.");

  if (input.id) {
    const current = await prisma.warehouse.findFirst({
      where: { id: input.id, companyId: company.id },
      select: { id: true },
    });
    if (!current) throw new Error("El almacén ya no existe o no pertenece a la empresa.");
  }

  const warehouse = await prisma.$transaction(async (tx) => {
    const saved = input.id
      ? await tx.warehouse.update({
          where: { id: input.id },
          data: {
            branchId: branch.id,
            name,
            code,
            description: nullableText(input.description),
            isSaleable: input.isSaleable,
            status: input.status,
          },
        })
      : await tx.warehouse.create({
          data: {
            companyId: company.id,
            branchId: branch.id,
            name,
            code,
            description: nullableText(input.description),
            isSaleable: input.isSaleable,
            status: input.status,
          },
        });

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: input.id ? "UPDATE" : "CREATE",
        entity: "WAREHOUSE",
        entityId: saved.id,
        newValues: {
          name: saved.name,
          code: saved.code,
          branchId: saved.branchId,
          status: saved.status,
          isSaleable: saved.isSaleable,
        },
      },
    });
    return saved;
  });

  refreshSettings();
  return { id: warehouse.id };
}
