import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL no está configurada.");

const bootstrapPassword = process.env.MOBIX_BOOTSTRAP_PASSWORD?.trim();
if (!bootstrapPassword || bootstrapPassword.length < 10) {
  throw new Error("MOBIX_BOOTSTRAP_PASSWORD debe tener al menos 10 caracteres.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const existingMembership = await prisma.companyUser.findFirst({ select: { id: true } });
  if (existingMembership) {
    console.log("✓ MOBIX bootstrap omitido: la base ya tiene usuarios configurados.");
    return;
  }

  let company = await prisma.company.findFirst({ orderBy: { createdAt: "asc" } });
  if (!company) {
    company = await prisma.company.create({
      data: {
        businessName: process.env.MOBIX_COMPANY_NAME?.trim() || "MOBIX",
        tradeName: process.env.MOBIX_COMPANY_TRADE_NAME?.trim() || "MOBIX",
        currency: "PEN",
        timezone: "America/Lima",
      },
    });
  }

  let branch = await prisma.branch.findFirst({
    where: { companyId: company.id },
    orderBy: { createdAt: "asc" },
  });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        companyId: company.id,
        name: "Tienda principal",
        code: "PRINCIPAL",
      },
    });
  }

  const existingWarehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id },
    orderBy: { createdAt: "asc" },
  });
  if (!existingWarehouse) {
    await prisma.warehouse.create({
      data: {
        companyId: company.id,
        branchId: branch.id,
        name: "Almacén principal",
        code: "ALM-01",
        isSaleable: true,
      },
    });
  }

  const role = await prisma.role.upsert({
    where: { companyId_name: { companyId: company.id, name: "Administrador" } },
    update: { isSystem: true, status: "ACTIVE" },
    create: {
      companyId: company.id,
      name: "Administrador",
      description: "Acceso administrativo completo",
      isSystem: true,
    },
  });

  const adminEmail = (process.env.MOBIX_ADMIN_EMAIL?.trim() || "admin@mobix.pe").toLowerCase();
  const adminName = process.env.MOBIX_ADMIN_NAME?.trim() || "Administrador MOBIX";
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { status: "ACTIVE" },
    create: {
      name: adminName,
      email: adminEmail,
      passwordHash: "LOGIN_NOT_ENABLED_YET",
    },
  });

  await prisma.companyUser.upsert({
    where: { companyId_userId: { companyId: company.id, userId: user.id } },
    update: { roleId: role.id, defaultBranchId: branch.id, status: "ACTIVE" },
    create: {
      companyId: company.id,
      userId: user.id,
      roleId: role.id,
      defaultBranchId: branch.id,
    },
  });

  await prisma.companySettings.upsert({
    where: { companyId: company.id },
    update: {},
    create: {
      companyId: company.id,
      taxRate: 18,
      defaultTaxCondition: "TAXED",
      receiptSeries: "B001",
      invoiceSeries: "F001",
      salesNoteSeries: "NV01",
      defaultWarrantyDays: 0,
      requireCashSession: true,
    },
  });

  console.log("✓ MOBIX bootstrap completado");
  console.log(`  Empresa: ${company.tradeName ?? company.businessName}`);
  console.log(`  Administrador: ${adminEmail}`);
  console.log("  Sin productos demo: catálogo listo para configurar.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
