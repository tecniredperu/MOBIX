import assert from "node:assert/strict";
import test from "node:test";
import { testDb, unique } from "../helpers/db";

test("la garantía del IMEI queda congelada al momento de la venta", async () => {
  const company = await testDb.company.create({
    data: {
      businessName: unique("Warranty Company"),
      tradeName: "MOBIX Warranty",
      currency: "PEN",
      timezone: "America/Lima",
    },
  });

  await testDb.companySettings.create({
    data: {
      companyId: company.id,
      taxRate: 18,
      defaultTaxCondition: "TAXED",
      requireCashSession: false,
    },
  });

  const branch = await testDb.branch.create({
    data: {
      companyId: company.id,
      name: "Principal",
      code: unique("BRW").slice(-20),
    },
  });

  const warehouse = await testDb.warehouse.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      name: "Almacén Garantía",
      code: unique("WHW").slice(-20),
      isSaleable: true,
    },
  });

  const user = await testDb.user.create({
    data: {
      name: "Vendedor Garantía",
      email: unique("warranty") + "@example.test",
      passwordHash: "TEST_ONLY",
    },
  });

  const customer = await testDb.customer.create({
    data: {
      companyId: company.id,
      firstName: "Cliente Garantía",
    },
  });

  const product = await testDb.product.create({
    data: {
      companyId: company.id,
      type: "PHONE",
      name: "Teléfono Garantía",
      sku: unique("PHONE"),
      controlsStock: true,
      requiresImei: true,
      warrantyDays: 365,
      variants: {
        create: {
          companyId: company.id,
          sku: unique("PHONE-VAR"),
          purchasePrice: 400,
          salePrice: 700,
          minimumSalePrice: 650,
        },
      },
    },
    include: { variants: true },
  });

  const unit = await testDb.productUnit.create({
    data: {
      companyId: company.id,
      productId: product.id,
      variantId: product.variants[0].id,
      warehouseId: warehouse.id,
      purchaseCost: 400,
      status: "SOLD",
    },
  });

  const soldAt = new Date("2026-09-18T15:00:00.000Z");
  const expiresAt = new Date(soldAt.getTime() + 365 * 86_400_000);

  const sale = await testDb.sale.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      warehouseId: warehouse.id,
      customerId: customer.id,
      saleNumber: unique("V001"),
      documentType: "RECEIPT",
      taxCondition: "TAXED",
      currency: "PEN",
      subtotal: 593.22,
      tax: 106.78,
      total: 700,
      status: "COMPLETED",
      sellerId: user.id,
      createdById: user.id,
      createdAt: soldAt,
    },
  });

  const saleItem = await testDb.saleItem.create({
    data: {
      saleId: sale.id,
      productId: product.id,
      variantId: product.variants[0].id,
      quantity: 1,
      unitPrice: 700,
      unitCost: 400,
      subtotal: 593.22,
      tax: 106.78,
      total: 700,
    },
  });

  const link = await testDb.saleItemUnit.create({
    data: {
      saleItemId: saleItem.id,
      productUnitId: unit.id,
      warrantyDays: 365,
      warrantyStartsAt: soldAt,
      warrantyExpiresAt: expiresAt,
    },
  });

  await testDb.product.update({
    where: { id: product.id },
    data: { warrantyDays: 30 },
  });

  const stored = await testDb.saleItemUnit.findUniqueOrThrow({
    where: { id: link.id },
  });

  assert.equal(stored.warrantyDays, 365);
  assert.equal(stored.warrantyStartsAt?.toISOString(), soldAt.toISOString());
  assert.equal(stored.warrantyExpiresAt?.toISOString(), expiresAt.toISOString());
});

test.after(async () => {
  await testDb.$disconnect();
});
