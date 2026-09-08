import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

if (process.env.MOBIX_UAT_ALLOW !== "1") {
  throw new Error("UAT bloqueado. Define MOBIX_UAT_ALLOW=1 únicamente en un entorno de staging aislado.");
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL es obligatorio para UAT.");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const steps: Array<{ name: string; status: "PASS" | "FAIL"; detail: string }> = [];

async function check(name: string, run: () => Promise<string>) {
  try {
    const detail = await run();
    steps.push({ name, status: "PASS", detail });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    steps.push({ name, status: "FAIL", detail });
    throw error;
  }
}

async function main() {
  const company = await db.company.create({
    data: {
      businessName: `MOBIX STAGING UAT ${stamp}`,
      tradeName: "MOBIX UAT",
      currency: "PEN",
      timezone: "America/Lima",
    },
  });
  await db.companySettings.create({
    data: {
      companyId: company.id,
      taxRate: 18,
      defaultTaxCondition: "TAXED",
      receiptSeries: "B001",
      invoiceSeries: "F001",
      salesNoteSeries: "NV01",
      defaultWarrantyDays: 365,
      requireCashSession: true,
    },
  });

  const branch = await db.branch.create({
    data: { companyId: company.id, name: "Sucursal Principal", code: `UAT-${stamp}` },
  });
  const branch2 = await db.branch.create({
    data: { companyId: company.id, name: "Sucursal Secundaria", code: `UAT2-${stamp}` },
  });
  const warehouse = await db.warehouse.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      name: "Almacén Principal",
      code: `W1-${stamp}`,
      isSaleable: true,
    },
  });
  const warehouse2 = await db.warehouse.create({
    data: {
      companyId: company.id,
      branchId: branch2.id,
      name: "Almacén Secundario",
      code: `W2-${stamp}`,
      isSaleable: true,
    },
  });
  const user = await db.user.create({
    data: {
      name: "Operador UAT",
      email: `uat-${stamp}@mobix.test`,
      passwordHash: "UAT_ONLY",
    },
  });
  const customer = await db.customer.create({
    data: {
      companyId: company.id,
      documentType: "DNI",
      documentNumber: `${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      firstName: "Cliente UAT",
      phone: "999999999",
      whatsapp: "999999999",
      creditEnabled: true,
      creditLimit: 500,
      creditDays: 30,
    },
  });
  const supplier = await db.supplier.create({
    data: {
      companyId: company.id,
      documentType: "RUC",
      documentNumber: `20${String(Date.now()).slice(-9)}`,
      businessName: "Proveedor UAT SAC",
    },
  });

  const accessory = await db.product.create({
    data: {
      companyId: company.id,
      type: "ACCESSORY",
      name: "Cargador UAT",
      sku: `ACC-${stamp}`,
      controlsStock: true,
      variants: {
        create: {
          companyId: company.id,
          sku: `ACC-V-${stamp}`,
          purchasePrice: 20,
          salePrice: 40,
          minimumSalePrice: 35,
          color: "Negro",
        },
      },
    },
    include: { variants: true },
  });
  const phone = await db.product.create({
    data: {
      companyId: company.id,
      type: "PHONE",
      name: "Smartphone UAT",
      model: "UAT-1",
      sku: `PHONE-${stamp}`,
      controlsStock: true,
      requiresSerial: true,
      requiresImei: true,
      warrantyDays: 365,
      variants: {
        create: {
          companyId: company.id,
          sku: `PHONE-V-${stamp}`,
          purchasePrice: 500,
          salePrice: 800,
          minimumSalePrice: 700,
          color: "Azul",
          storage: "128 GB",
        },
      },
    },
    include: { variants: true },
  });
  const accessoryVariant = accessory.variants[0];
  const phoneVariant = phone.variants[0];

  let phoneUnitId = "";
  await check("Compra e ingreso de inventario", async () => {
    const purchase = await db.purchase.create({
      data: {
        companyId: company.id,
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        number: `C001-${stamp}`,
        issueDate: new Date(),
        subtotal: 700,
        tax: 126,
        total: 826,
        status: "RECEIVED",
        createdById: user.id,
      },
    });
    const accessoryItem = await db.purchaseItem.create({
      data: {
        purchaseId: purchase.id,
        productId: accessory.id,
        variantId: accessoryVariant.id,
        quantity: 10,
        unitCost: 20,
        subtotal: 200,
        tax: 36,
        total: 236,
      },
    });
    const phoneItem = await db.purchaseItem.create({
      data: {
        purchaseId: purchase.id,
        productId: phone.id,
        variantId: phoneVariant.id,
        quantity: 1,
        unitCost: 500,
        subtotal: 500,
        tax: 90,
        total: 590,
      },
    });
    await db.inventoryBalance.create({
      data: {
        companyId: company.id,
        warehouseId: warehouse.id,
        productId: accessory.id,
        variantId: accessoryVariant.id,
        quantity: 10,
        averageCost: 20,
      },
    });
    await db.inventoryMovement.create({
      data: {
        companyId: company.id,
        warehouseId: warehouse.id,
        productId: accessory.id,
        variantId: accessoryVariant.id,
        movementType: "PURCHASE",
        quantity: 10,
        unitCost: 20,
        referenceType: "PURCHASE",
        referenceId: purchase.id,
        createdById: user.id,
      },
    });
    const unit = await db.productUnit.create({
      data: {
        companyId: company.id,
        productId: phone.id,
        variantId: phoneVariant.id,
        warehouseId: warehouse.id,
        purchaseId: purchase.id,
        purchaseItemId: phoneItem.id,
        purchaseCost: 500,
        status: "AVAILABLE",
        identifiers: {
          create: [
            { companyId: company.id, type: "IMEI_1", value: `35${String(Date.now()).slice(-13).padStart(13, "0")}` },
            { companyId: company.id, type: "SERIAL", value: `SER-${stamp}` },
          ],
        },
      },
    });
    phoneUnitId = unit.id;
    await db.inventoryMovement.create({
      data: {
        companyId: company.id,
        warehouseId: warehouse.id,
        productId: phone.id,
        variantId: phoneVariant.id,
        productUnitId: unit.id,
        movementType: "PURCHASE",
        quantity: 1,
        unitCost: 500,
        referenceType: "PURCHASE",
        referenceId: purchase.id,
        createdById: user.id,
      },
    });
    assert.equal(Number((await db.inventoryBalance.findUniqueOrThrow({ where: { companyId_warehouseId_variantId: { companyId: company.id, warehouseId: warehouse.id, variantId: accessoryVariant.id } } })).quantity), 10);
    assert.equal((await db.productUnit.findUniqueOrThrow({ where: { id: unit.id } })).status, "AVAILABLE");
    void accessoryItem;
    return "Compra recibida: 10 accesorios + 1 equipo con IMEI/serie.";
  });

  let cashSessionId = "";
  await check("Apertura de Caja", async () => {
    const session = await db.cashSession.create({
      data: {
        companyId: company.id,
        branchId: branch.id,
        userId: user.id,
        openingAmount: 100,
        status: "OPEN",
      },
    });
    cashSessionId = session.id;
    return "Caja abierta con S/ 100.00.";
  });

  let cashSaleId = "";
  let cashSaleItemId = "";
  await check("Venta en efectivo y descuento de accesorio", async () => {
    const sale = await db.sale.create({
      data: {
        companyId: company.id,
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        saleNumber: `V-CASH-${stamp}`,
        documentType: "RECEIPT",
        documentSeries: "B001",
        documentNumber: "00000001",
        taxCondition: "TAXED",
        subtotal: 67.8,
        tax: 12.2,
        total: 80,
        status: "COMPLETED",
        sellerId: user.id,
        createdById: user.id,
      },
    });
    cashSaleId = sale.id;
    const item = await db.saleItem.create({
      data: {
        saleId: sale.id,
        productId: accessory.id,
        variantId: accessoryVariant.id,
        quantity: 2,
        unitPrice: 40,
        unitCost: 20,
        subtotal: 67.8,
        tax: 12.2,
        total: 80,
      },
    });
    cashSaleItemId = item.id;
    await db.salePayment.create({ data: { saleId: sale.id, paymentMethod: "CASH", amount: 80 } });
    await db.inventoryBalance.update({
      where: { companyId_warehouseId_variantId: { companyId: company.id, warehouseId: warehouse.id, variantId: accessoryVariant.id } },
      data: { quantity: { decrement: 2 } },
    });
    await db.inventoryMovement.create({
      data: {
        companyId: company.id,
        warehouseId: warehouse.id,
        productId: accessory.id,
        variantId: accessoryVariant.id,
        movementType: "SALE",
        quantity: 2,
        unitCost: 20,
        referenceType: "SALE",
        referenceId: sale.id,
        createdById: user.id,
      },
    });
    assert.equal(Number((await db.inventoryBalance.findUniqueOrThrow({ where: { companyId_warehouseId_variantId: { companyId: company.id, warehouseId: warehouse.id, variantId: accessoryVariant.id } } })).quantity), 8);
    return "Venta S/ 80.00 registrada; stock accesorio 10 → 8.";
  });

  let phoneSaleId = "";
  await check("Venta de equipo por IMEI", async () => {
    const sale = await db.sale.create({
      data: {
        companyId: company.id,
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        saleNumber: `V-PHONE-${stamp}`,
        documentType: "RECEIPT",
        documentSeries: "B001",
        documentNumber: "00000002",
        taxCondition: "TAXED",
        subtotal: 677.97,
        tax: 122.03,
        total: 800,
        status: "COMPLETED",
        sellerId: user.id,
        createdById: user.id,
      },
    });
    phoneSaleId = sale.id;
    const item = await db.saleItem.create({
      data: {
        saleId: sale.id,
        productId: phone.id,
        variantId: phoneVariant.id,
        quantity: 1,
        unitPrice: 800,
        unitCost: 500,
        subtotal: 677.97,
        tax: 122.03,
        total: 800,
      },
    });
    await db.saleItemUnit.create({ data: { saleItemId: item.id, productUnitId: phoneUnitId } });
    await db.salePayment.create({ data: { saleId: sale.id, paymentMethod: "CASH", amount: 800 } });
    await db.productUnit.update({ where: { id: phoneUnitId }, data: { status: "SOLD" } });
    await db.inventoryMovement.create({
      data: {
        companyId: company.id,
        warehouseId: warehouse.id,
        productId: phone.id,
        variantId: phoneVariant.id,
        productUnitId: phoneUnitId,
        movementType: "SALE",
        quantity: 1,
        unitCost: 500,
        referenceType: "SALE",
        referenceId: sale.id,
        createdById: user.id,
      },
    });
    assert.equal((await db.productUnit.findUniqueOrThrow({ where: { id: phoneUnitId } })).status, "SOLD");
    return "Equipo vendido y unidad física marcada SOLD.";
  });

  let creditSaleId = "";
  let receivableId = "";
  await check("Venta a crédito y cuenta por cobrar", async () => {
    const sale = await db.sale.create({
      data: {
        companyId: company.id,
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        saleNumber: `V-CREDIT-${stamp}`,
        documentType: "SALES_NOTE",
        documentSeries: "NV01",
        documentNumber: "00000001",
        taxCondition: "TAXED",
        subtotal: 42.37,
        tax: 7.63,
        total: 50,
        status: "COMPLETED",
        sellerId: user.id,
        createdById: user.id,
      },
    });
    creditSaleId = sale.id;
    await db.saleItem.create({
      data: {
        saleId: sale.id,
        productId: accessory.id,
        variantId: accessoryVariant.id,
        quantity: 1,
        unitPrice: 50,
        unitCost: 20,
        subtotal: 42.37,
        tax: 7.63,
        total: 50,
      },
    });
    await db.salePayment.create({ data: { saleId: sale.id, paymentMethod: "CREDIT", amount: 50 } });
    await db.inventoryBalance.update({
      where: { companyId_warehouseId_variantId: { companyId: company.id, warehouseId: warehouse.id, variantId: accessoryVariant.id } },
      data: { quantity: { decrement: 1 } },
    });
    const receivable = await db.accountReceivable.create({
      data: {
        id: randomUUID(),
        companyId: company.id,
        customerId: customer.id,
        saleId: sale.id,
        status: "OPEN",
        originalAmount: 50,
        paidAmount: 0,
        balance: 50,
        dueDate: new Date(Date.now() + 30 * 86_400_000),
        notes: "Crédito UAT",
      },
    });
    receivableId = receivable.id;
    assert.equal(Number(receivable.balance), 50);
    return "Venta crédito S/ 50.00 con cuenta por cobrar OPEN.";
  });

  await check("Cobranza parcial de crédito", async () => {
    await db.receivablePayment.create({
      data: {
        companyId: company.id,
        receivableId,
        cashSessionId,
        amount: 20,
        paymentMethod: "CASH",
        createdById: user.id,
      },
    });
    await db.accountReceivable.update({
      where: { id: receivableId },
      data: { paidAmount: 20, balance: 30, status: "PARTIAL" },
    });
    const receivable = await db.accountReceivable.findUniqueOrThrow({ where: { id: receivableId } });
    assert.equal(Number(receivable.balance), 30);
    assert.equal(receivable.status, "PARTIAL");
    return "Abono S/ 20.00; saldo crédito S/ 30.00.";
  });

  await check("Devolución parcial con reingreso y Caja", async () => {
    const order = await db.returnOrder.create({
      data: {
        id: randomUUID(),
        companyId: company.id,
        saleId: cashSaleId,
        customerId: customer.id,
        warehouseId: warehouse.id,
        returnNumber: `DV001-${stamp}`,
        type: "RETURN",
        status: "COMPLETED",
        reason: "UAT devolución parcial",
        refundMethod: "CASH",
        refundAmount: 40,
        createdById: user.id,
      },
    });
    await db.returnItem.create({
      data: {
        id: randomUUID(),
        returnOrderId: order.id,
        saleItemId: cashSaleItemId,
        productId: accessory.id,
        variantId: accessoryVariant.id,
        quantity: 1,
        unitPrice: 40,
        unitCost: 20,
        amount: 40,
      },
    });
    await db.inventoryBalance.update({
      where: { companyId_warehouseId_variantId: { companyId: company.id, warehouseId: warehouse.id, variantId: accessoryVariant.id } },
      data: { quantity: { increment: 1 } },
    });
    await db.inventoryMovement.create({
      data: {
        companyId: company.id,
        warehouseId: warehouse.id,
        productId: accessory.id,
        variantId: accessoryVariant.id,
        movementType: "RETURN_IN",
        quantity: 1,
        unitCost: 20,
        referenceType: "RETURN",
        referenceId: order.id,
        createdById: user.id,
      },
    });
    await db.cashMovement.create({
      data: {
        companyId: company.id,
        cashSessionId,
        type: "EXPENSE",
        amount: 40,
        concept: "Devolución UAT",
        reference: order.id,
        createdById: user.id,
      },
    });
    const balance = await db.inventoryBalance.findUniqueOrThrow({
      where: { companyId_warehouseId_variantId: { companyId: company.id, warehouseId: warehouse.id, variantId: accessoryVariant.id } },
    });
    assert.equal(Number(balance.quantity), 8);
    return "1 accesorio reingresado y S/ 40.00 registrado como egreso de Caja.";
  });

  await check("Transferencia entre almacenes", async () => {
    const transfer = await db.stockTransfer.create({
      data: {
        id: randomUUID(),
        companyId: company.id,
        transferNumber: `TR001-${stamp}`,
        fromWarehouseId: warehouse.id,
        toWarehouseId: warehouse2.id,
        status: "IN_TRANSIT",
        createdById: user.id,
        sentAt: new Date(),
      },
    });
    await db.stockTransferItem.create({
      data: {
        id: randomUUID(),
        transferId: transfer.id,
        productId: accessory.id,
        variantId: accessoryVariant.id,
        quantity: 2,
        unitCost: 20,
      },
    });
    await db.inventoryBalance.update({
      where: { companyId_warehouseId_variantId: { companyId: company.id, warehouseId: warehouse.id, variantId: accessoryVariant.id } },
      data: { quantity: { decrement: 2 } },
    });
    await db.inventoryMovement.create({
      data: {
        companyId: company.id,
        warehouseId: warehouse.id,
        productId: accessory.id,
        variantId: accessoryVariant.id,
        movementType: "TRANSFER_OUT",
        quantity: 2,
        unitCost: 20,
        referenceType: "TRANSFER",
        referenceId: transfer.id,
        createdById: user.id,
      },
    });
    await db.inventoryBalance.create({
      data: {
        companyId: company.id,
        warehouseId: warehouse2.id,
        productId: accessory.id,
        variantId: accessoryVariant.id,
        quantity: 2,
        averageCost: 20,
      },
    });
    await db.inventoryMovement.create({
      data: {
        companyId: company.id,
        warehouseId: warehouse2.id,
        productId: accessory.id,
        variantId: accessoryVariant.id,
        movementType: "TRANSFER_IN",
        quantity: 2,
        unitCost: 20,
        referenceType: "TRANSFER",
        referenceId: transfer.id,
        createdById: user.id,
      },
    });
    await db.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: "RECEIVED", receivedById: user.id, receivedAt: new Date() },
    });
    const destination = await db.inventoryBalance.findUniqueOrThrow({
      where: { companyId_warehouseId_variantId: { companyId: company.id, warehouseId: warehouse2.id, variantId: accessoryVariant.id } },
    });
    assert.equal(Number(destination.quantity), 2);
    return "2 accesorios transferidos y recibidos en almacén secundario.";
  });

  await check("Postventa y garantía de equipo", async () => {
    const order = await db.serviceOrder.create({
      data: {
        id: randomUUID(),
        companyId: company.id,
        customerId: customer.id,
        productUnitId: phoneUnitId,
        saleId: phoneSaleId,
        serviceNumber: `ST001-${stamp}`,
        serviceType: "WARRANTY",
        status: "RECEIVED",
        deviceName: phone.name,
        model: phone.model,
        reportedIssue: "UAT: equipo no enciende",
        warrantyCovered: true,
        warrantyExpiresAt: new Date(Date.now() + 300 * 86_400_000),
        createdById: user.id,
      },
    });
    await db.serviceOrderEvent.create({
      data: {
        id: randomUUID(),
        serviceOrderId: order.id,
        status: "RECEIVED",
        note: "Recepción UAT",
        createdById: user.id,
      },
    });
    await db.productUnit.update({ where: { id: phoneUnitId }, data: { status: "WARRANTY" } });
    await db.inventoryMovement.create({
      data: {
        companyId: company.id,
        warehouseId: warehouse.id,
        productId: phone.id,
        variantId: phoneVariant.id,
        productUnitId: phoneUnitId,
        movementType: "WARRANTY_IN",
        quantity: 1,
        unitCost: 500,
        referenceType: "SERVICE_ORDER",
        referenceId: order.id,
        createdById: user.id,
      },
    });
    for (const status of ["DIAGNOSIS", "IN_REPAIR", "READY", "DELIVERED"] as const) {
      await db.serviceOrder.update({
        where: { id: order.id },
        data: {
          status,
          ...(status === "READY" ? { readyAt: new Date() } : {}),
          ...(status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
        },
      });
      await db.serviceOrderEvent.create({
        data: { id: randomUUID(), serviceOrderId: order.id, status, note: `UAT ${status}`, createdById: user.id },
      });
    }
    await db.productUnit.update({ where: { id: phoneUnitId }, data: { status: "SOLD" } });
    await db.inventoryMovement.create({
      data: {
        companyId: company.id,
        warehouseId: warehouse.id,
        productId: phone.id,
        variantId: phoneVariant.id,
        productUnitId: phoneUnitId,
        movementType: "WARRANTY_OUT",
        quantity: 1,
        unitCost: 500,
        referenceType: "SERVICE_ORDER",
        referenceId: order.id,
        createdById: user.id,
      },
    });
    const closed = await db.serviceOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(closed.status, "DELIVERED");
    assert.equal((await db.productUnit.findUniqueOrThrow({ where: { id: phoneUnitId } })).status, "SOLD");
    return "Garantía completa: RECEIVED → DIAGNOSIS → IN_REPAIR → READY → DELIVERED.";
  });

  await check("Cierre y arqueo de Caja", async () => {
    const cashPayments = await db.salePayment.findMany({
      where: {
        paymentMethod: "CASH",
        sale: { companyId: company.id, branchId: branch.id, sellerId: user.id, status: "COMPLETED" },
      },
      select: { amount: true },
    });
    const collections = await db.receivablePayment.findMany({
      where: { companyId: company.id, cashSessionId, paymentMethod: "CASH" },
      select: { amount: true },
    });
    const movements = await db.cashMovement.findMany({
      where: { companyId: company.id, cashSessionId },
      select: { type: true, amount: true },
    });
    const cashSales = cashPayments.reduce((sum, item) => sum + Number(item.amount), 0);
    const cashCollections = collections.reduce((sum, item) => sum + Number(item.amount), 0);
    const manualIn = movements
      .filter((item) => item.type === "INCOME" || item.type === "ADJUSTMENT_IN")
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const manualOut = movements
      .filter((item) => !["INCOME", "ADJUSTMENT_IN"].includes(item.type))
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const expected = Math.round((100 + cashSales + cashCollections + manualIn - manualOut) * 100) / 100;
    assert.equal(expected, 960);
    await db.cashSession.update({
      where: { id: cashSessionId },
      data: {
        status: "CLOSED",
        expectedAmount: expected,
        closingAmount: expected,
        difference: 0,
        closedAt: new Date(),
      },
    });
    const session = await db.cashSession.findUniqueOrThrow({ where: { id: cashSessionId } });
    assert.equal(session.status, "CLOSED");
    assert.equal(Number(session.difference), 0);
    return `Caja cerrada sin diferencia. Esperado/contado: S/ ${expected.toFixed(2)}.`;
  });

  const failed = steps.filter((step) => step.status === "FAIL");
  const report = {
    generatedAt: new Date().toISOString(),
    environment: "staging-ci",
    companyId: company.id,
    scenario: stamp,
    passed: steps.length - failed.length,
    failed: failed.length,
    status: failed.length ? "FAIL" : "PASS",
    steps,
    references: { cashSaleId, phoneSaleId, creditSaleId, receivableId },
  };

  await mkdir("artifacts/uat", { recursive: true });
  await writeFile("artifacts/uat/uat-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const markdown = [
    "# MOBIX Staging UAT",
    "",
    `- Estado: **${report.status}**`,
    `- Fecha: ${report.generatedAt}`,
    `- Escenario: ${stamp}`,
    `- Pruebas aprobadas: ${report.passed}`,
    `- Pruebas fallidas: ${report.failed}`,
    "",
    "| Flujo | Resultado | Detalle |",
    "|---|---|---|",
    ...steps.map((step) => `| ${step.name} | ${step.status} | ${step.detail.replace(/\|/g, "\\|")} |`),
    "",
  ].join("\n");
  await writeFile("artifacts/uat/uat-report.md", markdown, "utf8");
  console.log(markdown);
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
