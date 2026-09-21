import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL no está configurada.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

type Fixture = {
  companyId: string;
  userId: string;
  branchId: string;
  warehouseId: string;
  cashSessionId: string;
  productId: string;
  variantId: string;
  initialStock: number;
  unitPrice: number;
  tendered: number;
};

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function prepare(outputPath: string) {
  const company = await prisma.company.findFirst({
    where: { ruc: "20123456789", status: "ACTIVE" },
  });
  if (!company) throw new Error("No se encontró la empresa demo sembrada por CI.");

  const membership = await prisma.companyUser.findFirst({
    where: {
      companyId: company.id,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
    },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!membership) throw new Error("No existe un usuario activo para la prueba POS.");

  const warehouse = await prisma.warehouse.findFirst({
    where: {
      companyId: company.id,
      code: "ALM-01",
      status: "ACTIVE",
      isSaleable: true,
    },
    select: { id: true, branchId: true },
  });
  if (!warehouse) throw new Error("No se encontró el almacén ALM-01 para la prueba POS.");

  await prisma.companySettings.upsert({
    where: { companyId: company.id },
    update: { requireCashSession: true, receiptSeries: "B001", taxRate: 18 },
    create: {
      companyId: company.id,
      requireCashSession: true,
      receiptSeries: "B001",
      invoiceSeries: "F001",
      salesNoteSeries: "NV01",
      taxRate: 18,
    },
  });

  const cashSession = await prisma.cashSession.create({
    data: {
      companyId: company.id,
      branchId: warehouse.branchId,
      userId: membership.userId,
      openingAmount: 100,
      status: "OPEN",
      openingNotes: "CI E2E venta POS real",
    },
  });

  const stamp = Date.now().toString(36).toUpperCase();
  const product = await prisma.product.create({
    data: {
      companyId: company.id,
      type: "ACCESSORY",
      name: "CI POS REAL SALE",
      sku: `CI-POS-${stamp}`,
      controlsStock: true,
      minimumStock: 1,
      warrantyDays: 30,
      variants: {
        create: {
          companyId: company.id,
          sku: `CI-POS-V-${stamp}`,
          color: "Negro",
          purchasePrice: 10,
          salePrice: 59.9,
          minimumSalePrice: 49.9,
        },
      },
    },
    include: { variants: true },
  });
  const variant = product.variants[0];
  if (!variant) throw new Error("No se creó la variante E2E.");

  const initialStock = 5;
  await prisma.inventoryBalance.create({
    data: {
      companyId: company.id,
      warehouseId: warehouse.id,
      productId: product.id,
      variantId: variant.id,
      quantity: initialStock,
      averageCost: 10,
    },
  });

  const fixture: Fixture = {
    companyId: company.id,
    userId: membership.userId,
    branchId: warehouse.branchId,
    warehouseId: warehouse.id,
    cashSessionId: cashSession.id,
    productId: product.id,
    variantId: variant.id,
    initialStock,
    unitPrice: 59.9,
    tendered: 60,
  };

  await writeJson(outputPath, fixture);
  process.stdout.write(JSON.stringify(fixture));
}

async function verify(fixturePath: string, responsePath: string) {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Fixture;
  const response = JSON.parse(await readFile(responsePath, "utf8")) as {
    sale?: {
      id?: string;
      saleNumber?: string;
      documentSeries?: string | null;
      documentNumber?: string | null;
      tendered?: number;
      change?: number;
    };
    error?: string;
  };

  assert.ok(response.sale?.id, response.error || "La API no devolvió el ID de la venta.");

  const sale = await prisma.sale.findUnique({
    where: { id: response.sale.id },
    include: {
      payments: true,
      items: true,
    },
  });
  assert.ok(sale, "La venta creada por la API no existe en PostgreSQL.");
  assert.equal(sale.companyId, fixture.companyId);
  assert.equal(sale.warehouseId, fixture.warehouseId);
  assert.equal(sale.cashSessionId, fixture.cashSessionId);
  assert.equal(sale.status, "COMPLETED");
  assert.equal(sale.documentType, "RECEIPT");
  assert.equal(sale.documentSeries, "B001");
  assert.ok(sale.documentNumber, "La boleta interna no recibió correlativo.");
  assert.equal(Number(sale.total), fixture.unitPrice);
  assert.equal(sale.items.length, 1);
  assert.equal(Number(sale.items[0]?.quantity), 1);

  assert.equal(response.sale.tendered, fixture.tendered);
  assert.equal(response.sale.change, 0.1);
  assert.equal(sale.payments.length, 1);
  assert.equal(sale.payments[0]?.paymentMethod, "CASH");
  assert.equal(Number(sale.payments[0]?.amount), fixture.unitPrice);

  const balance = await prisma.inventoryBalance.findUniqueOrThrow({
    where: {
      companyId_warehouseId_variantId: {
        companyId: fixture.companyId,
        warehouseId: fixture.warehouseId,
        variantId: fixture.variantId,
      },
    },
  });
  assert.equal(Number(balance.quantity), fixture.initialStock - 1);

  const movement = await prisma.inventoryMovement.findFirst({
    where: {
      companyId: fixture.companyId,
      warehouseId: fixture.warehouseId,
      variantId: fixture.variantId,
      referenceType: "SALE",
      referenceId: sale.id,
      movementType: "SALE",
    },
  });
  assert.ok(movement, "La venta no generó movimiento de inventario.");

  const audit = await prisma.auditLog.findFirst({
    where: {
      companyId: fixture.companyId,
      entity: "SALE",
      entityId: sale.id,
      action: "CREATE",
    },
  });
  assert.ok(audit, "La venta no quedó registrada en auditoría.");

  const cashSession = await prisma.cashSession.findUniqueOrThrow({
    where: { id: fixture.cashSessionId },
  });
  assert.equal(cashSession.status, "OPEN");

  process.stdout.write(
    [
      "POS E2E real OK",
      `Venta: ${sale.saleNumber}`,
      `Total: S/ ${Number(sale.total).toFixed(2)}`,
      `Vuelto: S/ ${Number(response.sale.change ?? 0).toFixed(2)}`,
      `Stock: ${fixture.initialStock} -> ${Number(balance.quantity)}`,
      `Caja: ${cashSession.id}`,
    ].join("\n") + "\n",
  );
}

async function main() {
  const [mode, firstPath, secondPath] = process.argv.slice(2);
  if (mode === "prepare") {
    await prepare(firstPath || "/tmp/mobix-pos-sale-fixture.json");
    return;
  }
  if (mode === "verify") {
    await verify(
      firstPath || "/tmp/mobix-pos-sale-fixture.json",
      secondPath || "/tmp/mobix-pos-sale-response.json",
    );
    return;
  }
  throw new Error("Uso: tsx scripts/ci-pos-sale-e2e.ts prepare|verify [fixture] [response]");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
