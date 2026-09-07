import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL no está configurada.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  let company = await prisma.company.findFirst({ where: { ruc: "20123456789" } });
  if (!company) {
    company = await prisma.company.create({
      data: {
        businessName: "MOBIX DEMO S.A.C.",
        tradeName: "MOBIX Store",
        ruc: "20123456789",
        email: "demo@mobix.pe",
        phone: "999 999 999",
        address: "Moyobamba, San Martín",
      },
    });
  }

  const branch = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: "CENTRO" } },
    update: {},
    create: {
      companyId: company.id,
      name: "Tienda principal",
      code: "CENTRO",
      address: "Moyobamba, San Martín",
    },
  });

  const warehouse = await prisma.warehouse.upsert({
    where: { companyId_code: { companyId: company.id, code: "ALM-01" } },
    update: {},
    create: {
      companyId: company.id,
      branchId: branch.id,
      name: "Almacén principal",
      code: "ALM-01",
      isSaleable: true,
    },
  });

  const role = await prisma.role.upsert({
    where: { companyId_name: { companyId: company.id, name: "Administrador" } },
    update: {},
    create: {
      companyId: company.id,
      name: "Administrador",
      description: "Acceso administrativo de demostración",
      isSystem: true,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "admin@mobix.pe" },
    update: {},
    create: {
      name: "Administrador MOBIX",
      email: "admin@mobix.pe",
      passwordHash: "LOGIN_NOT_ENABLED_YET",
    },
  });

  await prisma.companyUser.upsert({
    where: { companyId_userId: { companyId: company.id, userId: user.id } },
    update: { roleId: role.id, defaultBranchId: branch.id },
    create: {
      companyId: company.id,
      userId: user.id,
      roleId: role.id,
      defaultBranchId: branch.id,
    },
  });

  const categoryNames = [
    "Celulares",
    "Tablets",
    "Smartwatch",
    "Cargadores",
    "Cables",
    "Audífonos",
    "Fundas",
    "Micas",
    "Servicios",
  ];
  const categories = new Map<string, { id: string; name: string }>();
  for (const name of categoryNames) {
    const category = await prisma.category.upsert({
      where: { companyId_slug: { companyId: company.id, slug: slugify(name) } },
      update: {},
      create: { companyId: company.id, name, slug: slugify(name) },
      select: { id: true, name: true },
    });
    categories.set(name, category);
  }

  const brandNames = ["Apple", "Samsung", "Xiaomi", "Motorola", "Honor", "Genérico"];
  const brands = new Map<string, { id: string; name: string }>();
  for (const name of brandNames) {
    const brand = await prisma.brand.upsert({
      where: { companyId_slug: { companyId: company.id, slug: slugify(name) } },
      update: {},
      create: { companyId: company.id, name, slug: slugify(name) },
      select: { id: true, name: true },
    });
    brands.set(name, brand);
  }

  async function ensureProduct(input: {
    sku: string;
    name: string;
    model?: string;
    type: "PHONE" | "SERIALIZED" | "ACCESSORY" | "SERVICE";
    category: string;
    brand: string;
    minimumStock: number;
    warrantyDays: number;
    variant: {
      sku: string;
      color?: string;
      ram?: string;
      storage?: string;
      purchasePrice: number;
      salePrice: number;
      minimumSalePrice: number;
    };
  }) {
    const category = categories.get(input.category);
    const brand = brands.get(input.brand);
    if (!category || !brand) throw new Error(`Catálogo incompleto para ${input.name}`);

    const rules =
      input.type === "PHONE"
        ? { controlsStock: true, requiresSerial: true, requiresImei: true }
        : input.type === "SERIALIZED"
          ? { controlsStock: true, requiresSerial: true, requiresImei: false }
          : input.type === "ACCESSORY"
            ? { controlsStock: true, requiresSerial: false, requiresImei: false }
            : { controlsStock: false, requiresSerial: false, requiresImei: false };

    let product = await prisma.product.findUnique({
      where: { companyId_sku: { companyId: company.id, sku: input.sku } },
      include: { variants: true },
    });

    if (!product) {
      product = await prisma.product.create({
        data: {
          companyId: company.id,
          categoryId: category.id,
          brandId: brand.id,
          type: input.type,
          name: input.name,
          model: input.model,
          sku: input.sku,
          minimumStock: input.minimumStock,
          warrantyDays: input.warrantyDays,
          ...rules,
          variants: {
            create: {
              companyId: company.id,
              sku: input.variant.sku,
              color: input.variant.color,
              ram: input.variant.ram,
              storage: input.variant.storage,
              purchasePrice: input.variant.purchasePrice,
              salePrice: input.variant.salePrice,
              minimumSalePrice: input.variant.minimumSalePrice,
            },
          },
        },
        include: { variants: true },
      });
    }

    return { product, variant: product.variants[0] };
  }

  const galaxy = await ensureProduct({
    sku: "SAM-A56",
    name: "Samsung Galaxy A56 5G",
    model: "SM-A566E",
    type: "PHONE",
    category: "Celulares",
    brand: "Samsung",
    minimumStock: 2,
    warrantyDays: 365,
    variant: {
      sku: "SAM-A56-8256-BLK",
      color: "Negro",
      ram: "8 GB",
      storage: "256 GB",
      purchasePrice: 720,
      salePrice: 899,
      minimumSalePrice: 849,
    },
  });

  const iphone = await ensureProduct({
    sku: "APL-IP16",
    name: "iPhone 16",
    model: "A3287",
    type: "PHONE",
    category: "Celulares",
    brand: "Apple",
    minimumStock: 2,
    warrantyDays: 365,
    variant: {
      sku: "APL-IP16-128-BLK",
      color: "Negro",
      storage: "128 GB",
      purchasePrice: 2850,
      salePrice: 3299,
      minimumSalePrice: 3150,
    },
  });

  const redmi = await ensureProduct({
    sku: "XIA-RN15",
    name: "Redmi Note 15",
    model: "Note 15",
    type: "PHONE",
    category: "Celulares",
    brand: "Xiaomi",
    minimumStock: 2,
    warrantyDays: 365,
    variant: {
      sku: "XIA-RN15-8256-BLK",
      color: "Negro",
      ram: "8 GB",
      storage: "256 GB",
      purchasePrice: 610,
      salePrice: 799,
      minimumSalePrice: 749,
    },
  });

  const charger = await ensureProduct({
    sku: "SAM-CH25",
    name: "Cargador Samsung 25W USB-C",
    type: "ACCESSORY",
    category: "Cargadores",
    brand: "Samsung",
    minimumStock: 10,
    warrantyDays: 180,
    variant: {
      sku: "SAM-CH25-WHT",
      color: "Blanco",
      purchasePrice: 48,
      salePrice: 89,
      minimumSalePrice: 75,
    },
  });

  const hydrogel = await ensureProduct({
    sku: "GEN-HYDRO",
    name: "Mica hidrogel",
    type: "ACCESSORY",
    category: "Micas",
    brand: "Genérico",
    minimumStock: 15,
    warrantyDays: 0,
    variant: {
      sku: "GEN-HYDRO-UNI",
      purchasePrice: 6,
      salePrice: 25,
      minimumSalePrice: 18,
    },
  });

  async function seedUnits(
    productId: string,
    variantId: string,
    prefix: string,
    count: number,
    cost: number,
  ) {
    const existing = await prisma.productUnit.count({ where: { productId, variantId } });
    if (existing > 0) return;

    for (let index = 1; index <= count; index += 1) {
      const suffix = String(index).padStart(2, "0");
      const base = `${prefix}${String(index).padStart(6, "0")}`;
      await prisma.productUnit.create({
        data: {
          companyId: company.id,
          productId,
          variantId,
          warehouseId: warehouse.id,
          purchaseCost: cost,
          identifiers: {
            create: [
              { companyId: company.id, type: "IMEI_1", value: `${base}1` },
              { companyId: company.id, type: "IMEI_2", value: `${base}2` },
              { companyId: company.id, type: "SERIAL", value: `${prefix}-SER-${suffix}` },
            ],
          },
        },
      });
    }
  }

  await seedUnits(galaxy.product.id, galaxy.variant.id, "35670000", 5, 720);
  await seedUnits(iphone.product.id, iphone.variant.id, "35780000", 3, 2850);
  await seedUnits(redmi.product.id, redmi.variant.id, "35890000", 6, 610);

  async function setAccessoryBalance(
    productId: string,
    variantId: string,
    quantity: number,
    averageCost: number,
  ) {
    await prisma.inventoryBalance.upsert({
      where: {
        companyId_warehouseId_variantId: {
          companyId: company.id,
          warehouseId: warehouse.id,
          variantId,
        },
      },
      update: { quantity, averageCost },
      create: {
        companyId: company.id,
        warehouseId: warehouse.id,
        productId,
        variantId,
        quantity,
        averageCost,
      },
    });
  }

  await setAccessoryBalance(charger.product.id, charger.variant.id, 34, 48);
  await setAccessoryBalance(hydrogel.product.id, hydrogel.variant.id, 52, 6);

  console.log("✓ MOBIX seed completado");
  console.log(`  Empresa: ${company.tradeName ?? company.businessName}`);
  console.log(`  Sucursal: ${branch.name}`);
  console.log(`  Almacén: ${warehouse.name}`);
  console.log("  Productos demo: 5");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
