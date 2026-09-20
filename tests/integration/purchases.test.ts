import assert from "node:assert/strict";
import test from "node:test";
import { testDb, unique } from "../helpers/db";

test("el esquema de Compras mantiene relaciones, conteos y trazabilidad de equipos", async () => {
  const company = await testDb.company.create({
    data: {
      businessName: unique("Compra Company"),
      tradeName: "Compra UAT",
      currency: "PEN",
      timezone: "America/Lima",
    },
  });

  const branch = await testDb.branch.create({
    data: { companyId: company.id, name: "Principal", code: unique("BR").slice(-20) },
  });

  const warehouse = await testDb.warehouse.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      name: "Almacén Compras",
      code: unique("WH").slice(-20),
      isSaleable: true,
    },
  });

  const user = await testDb.user.create({
    data: {
      name: "Comprador UAT",
      email: `${unique("compras")}@example.test`,
      passwordHash: "TEST_ONLY",
    },
  });

  const supplier = await testDb.supplier.create({
    data: {
      companyId: company.id,
      documentType: "RUC",
      documentNumber: unique("20").replace(/\D/g, "").padEnd(11, "0").slice(0, 11),
      businessName: "Proveedor UAT",
    },
  });

  const product = await testDb.product.create({
    data: {
      companyId: company.id,
      type: "PHONE",
      name: "Equipo Compra UAT",
      sku: unique("SKU"),
      controlsStock: true,
      requiresImei: true,
      variants: {
        create: {
          companyId: company.id,
          sku: unique("VAR"),
          purchasePrice: 500,
          salePrice: 800,
          minimumSalePrice: 700,
        },
      },
    },
    include: { variants: true },
  });
  const variant = product.variants[0];

  const purchase = await testDb.purchase.create({
    data: {
      companyId: company.id,
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      number: unique("C001"),
      documentType: "01 - Factura",
      documentSeries: "F001",
      documentNumber: unique("DOC").slice(-8),
      issueDate: new Date(),
      subtotal: 500,
      tax: 90,
      total: 590,
      status: "RECEIVED",
      createdById: user.id,
    },
  });

  const item = await testDb.purchaseItem.create({
    data: {
      purchaseId: purchase.id,
      productId: product.id,
      variantId: variant.id,
      quantity: 1,
      unitCost: 500,
      subtotal: 500,
      tax: 90,
      total: 590,
    },
  });

  const unit = await testDb.productUnit.create({
    data: {
      companyId: company.id,
      productId: product.id,
      variantId: variant.id,
      warehouseId: warehouse.id,
      purchaseId: purchase.id,
      purchaseItemId: item.id,
      purchaseCost: 500,
      status: "AVAILABLE",
      identifiers: {
        create: {
          companyId: company.id,
          type: "IMEI_1",
          value: `35${String(Date.now()).slice(-13).padStart(13, "0")}`,
        },
      },
    },
  });

  const listed = await testDb.purchase.findFirstOrThrow({
    where: { id: purchase.id },
    include: {
      supplier: true,
      warehouse: { include: { branch: true } },
      _count: { select: { items: true, productUnits: true } },
    },
  });

  assert.equal(listed.supplier.id, supplier.id);
  assert.equal(listed.warehouse.id, warehouse.id);
  assert.equal(listed.warehouse.branch.id, branch.id);
  assert.equal(listed._count.items, 1);
  assert.equal(listed._count.productUnits, 1);

  const traced = await testDb.productUnit.findUniqueOrThrow({
    where: { id: unit.id },
    include: { purchase: true, purchaseItem: true, identifiers: true },
  });
  assert.equal(traced.purchaseId, purchase.id);
  assert.equal(traced.purchaseItemId, item.id);
  assert.equal(traced.identifiers.length, 1);
});

test("las columnas críticas de Compras existen después de migraciones", async () => {
  const rows = await testDb.$queryRaw<Array<{
    suppliers: boolean;
    purchases: boolean;
    purchaseItems: boolean;
    purchaseId: boolean;
    purchaseItemId: boolean;
  }>>`
    SELECT
      to_regclass('public.suppliers') IS NOT NULL AS "suppliers",
      to_regclass('public.purchases') IS NOT NULL AS "purchases",
      to_regclass('public.purchase_items') IS NOT NULL AS "purchaseItems",
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_units' AND column_name = 'purchaseId'
      ) AS "purchaseId",
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_units' AND column_name = 'purchaseItemId'
      ) AS "purchaseItemId"
  `;

  assert.deepEqual(rows[0], {
    suppliers: true,
    purchases: true,
    purchaseItems: true,
    purchaseId: true,
    purchaseItemId: true,
  });
});

test.after(async () => {
  await testDb.$disconnect();
});
