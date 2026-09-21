import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("ventas protegen referencias de Yape, Plin, tarjeta y transferencia", async () => {
  const sale = await source("src/modules/sales/sale-actions.ts");

  assert.ok(sale.includes('["YAPE", "PLIN", "CARD", "TRANSFER"].includes(payment.method)'));
  assert.ok(sale.includes("protectedReferenceKeys"));
  assert.ok(sale.includes("está repetida dentro de la misma venta"));
  assert.ok(sale.includes('SELECT \'ABONO\'::text AS "source"'));
  assert.ok(sale.includes('FROM "receivable_payments" rp'));
});

test("cobranzas protegen tarjeta además de medios digitales", async () => {
  const customer = await source("src/modules/customers/customer-actions.ts");

  assert.ok(customer.includes('["YAPE", "PLIN", "CARD", "TRANSFER"].includes(input.method)'));
  assert.ok(customer.includes('FROM "sale_payments" sp'));
  assert.ok(customer.includes('FROM "receivable_payments" rp'));
});

test("un abono solo puede entrar en caja de la sucursal original", async () => {
  const customer = await source("src/modules/customers/customer-actions.ts");

  assert.ok(customer.includes('cs."branchId"'));
  assert.ok(customer.includes('s."branchId"'));
  assert.ok(customer.includes("openSession.branchId !== receivable.branchId"));
  assert.ok(customer.includes("Cierra y abre caja en la sucursal correcta"));
});

test("la base conserva una sola caja abierta por usuario", async () => {
  const migration = await source("prisma/migrations/20260907122500_cash_register/migration.sql");

  assert.ok(migration.includes('CREATE UNIQUE INDEX "cash_sessions_one_open_per_user_idx"'));
  assert.ok(migration.includes('WHERE "status" = \'OPEN\''));
});
