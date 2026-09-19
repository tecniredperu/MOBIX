import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { testDb, unique } from "../helpers/db";

async function createFixture() {
  const company = await testDb.company.create({
    data: {
      businessName: unique("UAT Company"),
      tradeName: "MOBIX UAT",
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
    data: { companyId: company.id, name: "Principal", code: unique("BR").slice(-20) },
  });
  const warehouse = await testDb.warehouse.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      name: "Almacén UAT",
      code: unique("WH").slice(-20),
      isSaleable: true,
    },
  });
  const user = await testDb.user.create({
    data: {
      name: "Usuario UAT",
      email: `${unique("uat")}@example.test`,
      passwordHash: "TEST_ONLY",
    },
  });
  const customer = await testDb.customer.create({
    data: {
      companyId: company.id,
      firstName: "Cliente UAT",
      creditEnabled: true,
      creditLimit: 100,
      creditDays: 30,
    },
  });
  const product = await testDb.product.create({
    data: {
      companyId: company.id,
      type: "ACCESSORY",
      name: "Accesorio UAT",
      sku: unique("SKU"),
      controlsStock: true,
      variants: {
        create: {
          companyId: company.id,
          sku: unique("VAR"),
          purchasePrice: 20,
          salePrice: 40,
          minimumSalePrice: 30,
        },
      },
    },
    include: { variants: true },
  });
  return {
    company,
    branch,
    warehouse,
    user,
    customer,
    product,
    variant: product.variants[0],
  };
}

async function createSale(fixture: Awaited<ReturnType<typeof createFixture>>, total = 60) {
  return testDb.sale.create({
    data: {
      companyId: fixture.company.id,
      branchId: fixture.branch.id,
      warehouseId: fixture.warehouse.id,
      customerId: fixture.customer.id,
      saleNumber: unique("V001"),
      documentType: "SALES_NOTE",
      taxCondition: "TAXED",
      currency: "PEN",
      subtotal: total / 1.18,
      tax: total - total / 1.18,
      total,
      status: "COMPLETED",
      sellerId: fixture.user.id,
      createdById: fixture.user.id,
    },
  });
}

test("dos créditos simultáneos no pueden superar el límite del cliente", async () => {
  const fixture = await createFixture();
  const [saleA, saleB] = await Promise.all([
    createSale(fixture, 60),
    createSale(fixture, 60),
  ]);

  const attempts = await Promise.allSettled([
    testDb.accountReceivable.create({
      data: {
        id: randomUUID(),
        companyId: fixture.company.id,
        customerId: fixture.customer.id,
        saleId: saleA.id,
        originalAmount: 60,
        paidAmount: 0,
        balance: 60,
        dueDate: new Date(Date.now() + 30 * 86_400_000),
      },
    }),
    testDb.accountReceivable.create({
      data: {
        id: randomUUID(),
        companyId: fixture.company.id,
        customerId: fixture.customer.id,
        saleId: saleB.id,
        originalAmount: 60,
        paidAmount: 0,
        balance: 60,
        dueDate: new Date(Date.now() + 30 * 86_400_000),
      },
    }),
  ]);

  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
});

test("dos devoluciones simultáneas no pueden devolver más de lo vendido", async () => {
  const fixture = await createFixture();
  const sale = await createSale(fixture, 40);
  const item = await testDb.saleItem.create({
    data: {
      saleId: sale.id,
      productId: fixture.product.id,
      variantId: fixture.variant.id,
      quantity: 1,
      unitPrice: 40,
      unitCost: 20,
      subtotal: 33.9,
      tax: 6.1,
      total: 40,
    },
  });

  const [orderA, orderB] = await Promise.all([
    testDb.returnOrder.create({
      data: {
        id: randomUUID(),
        companyId: fixture.company.id,
        saleId: sale.id,
        customerId: fixture.customer.id,
        warehouseId: fixture.warehouse.id,
        returnNumber: unique("DV-A"),
        type: "RETURN",
        status: "COMPLETED",
        reason: "Prueba concurrente A",
        refundAmount: 40,
        createdById: fixture.user.id,
      },
    }),
    testDb.returnOrder.create({
      data: {
        id: randomUUID(),
        companyId: fixture.company.id,
        saleId: sale.id,
        customerId: fixture.customer.id,
        warehouseId: fixture.warehouse.id,
        returnNumber: unique("DV-B"),
        type: "RETURN",
        status: "COMPLETED",
        reason: "Prueba concurrente B",
        refundAmount: 40,
        createdById: fixture.user.id,
      },
    }),
  ]);

  const attempts = await Promise.allSettled([
    testDb.returnItem.create({
      data: {
        id: randomUUID(),
        returnOrderId: orderA.id,
        saleItemId: item.id,
        productId: fixture.product.id,
        variantId: fixture.variant.id,
        quantity: 1,
        unitPrice: 40,
        unitCost: 20,
        amount: 40,
      },
    }),
    testDb.returnItem.create({
      data: {
        id: randomUUID(),
        returnOrderId: orderB.id,
        saleItemId: item.id,
        productId: fixture.product.id,
        variantId: fixture.variant.id,
        quantity: 1,
        unitPrice: 40,
        unitCost: 20,
        amount: 40,
      },
    }),
  ]);

  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
});

test("un equipo solo puede tener una atención activa de postventa", async () => {
  const fixture = await createFixture();
  const unit = await testDb.productUnit.create({
    data: {
      companyId: fixture.company.id,
      productId: fixture.product.id,
      variantId: fixture.variant.id,
      warehouseId: fixture.warehouse.id,
      purchaseCost: 20,
      status: "SOLD",
    },
  });

  const createOrder = (suffix: string) => testDb.serviceOrder.create({
    data: {
      id: randomUUID(),
      companyId: fixture.company.id,
      customerId: fixture.customer.id,
      productUnitId: unit.id,
      serviceNumber: unique(`ST-${suffix}`),
      serviceType: "TECHNICAL_SERVICE",
      status: "RECEIVED",
      deviceName: "Equipo UAT",
      reportedIssue: "No enciende durante prueba",
      createdById: fixture.user.id,
    },
  });

  const attempts = await Promise.allSettled([createOrder("A"), createOrder("B")]);
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
});

test("inventario nunca puede quedar con cantidad negativa", async () => {
  const fixture = await createFixture();
  const balance = await testDb.inventoryBalance.create({
    data: {
      companyId: fixture.company.id,
      warehouseId: fixture.warehouse.id,
      productId: fixture.product.id,
      variantId: fixture.variant.id,
      quantity: 1,
      averageCost: 20,
    },
  });

  await assert.rejects(() =>
    testDb.inventoryBalance.update({
      where: { id: balance.id },
      data: { quantity: { decrement: 2 } },
    }),
  );

  const current = await testDb.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } });
  assert.equal(Number(current.quantity), 1);
});

test("una caja cerrada rechaza movimientos posteriores", async () => {
  const fixture = await createFixture();
  const session = await testDb.cashSession.create({
    data: {
      companyId: fixture.company.id,
      branchId: fixture.branch.id,
      userId: fixture.user.id,
      status: "OPEN",
      openingAmount: 0,
    },
  });
  await testDb.cashSession.update({
    where: { id: session.id },
    data: { status: "CLOSED", closedAt: new Date(), closingAmount: 0, expectedAmount: 0, difference: 0 },
  });

  await assert.rejects(() =>
    testDb.cashMovement.create({
      data: {
        companyId: fixture.company.id,
        cashSessionId: session.id,
        type: "INCOME",
        amount: 10,
        concept: "Movimiento tardío UAT",
        createdById: fixture.user.id,
      },
    }),
  );
});

test("postventa respeta la máquina de estados", async () => {
  const fixture = await createFixture();
  const order = await testDb.serviceOrder.create({
    data: {
      id: randomUUID(),
      companyId: fixture.company.id,
      customerId: fixture.customer.id,
      serviceNumber: unique("ST-FLOW"),
      serviceType: "TECHNICAL_SERVICE",
      status: "RECEIVED",
      deviceName: "Equipo externo",
      reportedIssue: "Pantalla sin imagen",
      createdById: fixture.user.id,
    },
  });

  await assert.rejects(() =>
    testDb.serviceOrder.update({ where: { id: order.id }, data: { status: "DELIVERED" } }),
  );

  for (const status of ["DIAGNOSIS", "IN_REPAIR", "READY", "DELIVERED"] as const) {
    await testDb.serviceOrder.update({ where: { id: order.id }, data: { status } });
  }

  const closed = await testDb.serviceOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(closed.status, "DELIVERED");
});


test("un vale de cambio no puede gastarse dos veces en cajas concurrentes", async () => {
  const fixture = await createFixture();
  const originalSale = await createSale(fixture, 100);
  const [replacementA, replacementB] = await Promise.all([
    createSale(fixture, 120),
    createSale(fixture, 130),
  ]);

  const returnOrder = await testDb.returnOrder.create({
    data: {
      id: randomUUID(),
      companyId: fixture.company.id,
      saleId: originalSale.id,
      customerId: fixture.customer.id,
      warehouseId: fixture.warehouse.id,
      returnNumber: unique("DV-X"),
      type: "EXCHANGE",
      status: "COMPLETED",
      reason: "Cambio concurrente UAT",
      refundAmount: 0,
      createdById: fixture.user.id,
    },
  });

  const credit = await testDb.exchangeCredit.create({
    data: {
      companyId: fixture.company.id,
      returnOrderId: returnOrder.id,
      customerId: fixture.customer.id,
      originalAmount: 100,
      balance: 100,
      status: "OPEN",
    },
  });

  async function consume(saleId: string, amount: number) {
    return testDb.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; balance: unknown; status: string }>>`
        SELECT "id", "balance", "status"
        FROM "exchange_credits"
        WHERE "id" = ${credit.id}
          AND "companyId" = ${fixture.company.id}
          AND "status" IN ('OPEN','PARTIAL')
        LIMIT 1
        FOR UPDATE
      `;

      const locked = rows[0];
      if (!locked) throw new Error("Vale no disponible.");

      const balance = Number(locked.balance ?? 0);
      if (amount > balance + 0.01) {
        throw new Error("Saldo insuficiente.");
      }

      const nextBalance = Math.round((balance - amount) * 100) / 100;
      await tx.exchangeCredit.update({
        where: { id: credit.id },
        data: {
          balance: nextBalance,
          status: nextBalance <= 0.01 ? "USED" : "PARTIAL",
        },
      });
      await tx.exchangeCreditUsage.create({
        data: {
          exchangeCreditId: credit.id,
          saleId,
          amount,
        },
      });
    });
  }

  const attempts = await Promise.allSettled([
    consume(replacementA.id, 80),
    consume(replacementB.id, 80),
  ]);

  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);

  const current = await testDb.exchangeCredit.findUniqueOrThrow({
    where: { id: credit.id },
    include: { usages: true },
  });
  assert.equal(Number(current.balance), 20);
  assert.equal(current.status, "PARTIAL");
  assert.equal(current.usages.length, 1);
  assert.equal(Number(current.usages[0].amount), 80);
});


test("una referencia Yape no puede registrarse dos veces en ventas concurrentes", async () => {
  const fixture = await createFixture();
  const [saleA, saleB] = await Promise.all([
    createSale(fixture, 40),
    createSale(fixture, 40),
  ]);
  const normalizedReference = "987654321";
  const lockKey = fixture.company.id + ":YAPE:" + normalizedReference;

  async function registerPayment(saleId: string) {
    return testDb.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      `;

      const existing = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT sp."id"
        FROM "sale_payments" sp
        INNER JOIN "sales" s ON s."id" = sp."saleId"
        WHERE s."companyId" = ${fixture.company.id}
          AND sp."paymentMethod"::text = 'YAPE'
          AND regexp_replace(upper(COALESCE(sp."reference", '')), '[^A-Z0-9]', '', 'g') = ${normalizedReference}
        LIMIT 1
      `;
      if (existing[0]) throw new Error("Referencia duplicada.");

      await tx.salePayment.create({
        data: {
          saleId,
          paymentMethod: "YAPE",
          amount: 40,
          reference: "987 654 321",
        },
      });
    });
  }

  const attempts = await Promise.allSettled([
    registerPayment(saleA.id),
    registerPayment(saleB.id),
  ]);

  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);

  const payments = await testDb.salePayment.findMany({
    where: {
      paymentMethod: "YAPE",
      sale: { companyId: fixture.company.id },
      reference: "987 654 321",
    },
  });
  assert.equal(payments.length, 1);
});

test.after(async () => {
  await testDb.$disconnect();
});
