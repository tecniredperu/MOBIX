import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

test("las páginas del grupo app usan un único AppShell desde layout", () => {
  const pages = walk("src/app/(app)").filter((path) => path.endsWith("page.tsx"));
  for (const page of pages) {
    assert.equal(
      source(page).includes("AppShell"),
      false,
      `${page} vuelve a montar AppShell aunque el layout ya lo provee`,
    );
  }

  const layout = source("src/app/(app)/layout.tsx");
  assert.ok(layout.includes("AppShell"));
});

test("las dependencias de formularios retiradas no regresan", () => {
  const pkg = JSON.parse(source("package.json"));
  const lock = JSON.parse(source("package-lock.json"));

  assert.equal(pkg.dependencies?.["react-hook-form"], undefined);
  assert.equal(pkg.dependencies?.["@hookform/resolvers"], undefined);
  assert.equal(lock.packages?.["node_modules/react-hook-form"], undefined);
  assert.equal(lock.packages?.["node_modules/@hookform/resolvers"], undefined);
});

test("repositorios legacy de ventas y proveedores permanecen eliminados", () => {
  const sales = source("src/modules/sales/sales.repository.ts");
  const suppliers = source("src/modules/suppliers/suppliers.repository.ts");

  assert.equal(sales.includes("export async function getPosContext"), false);
  assert.equal(sales.includes("export async function getSales("), false);
  assert.equal(suppliers.includes("getActiveSupplierOptions"), false);
  assert.ok(sales.includes("export async function getSaleDetail"));
});

test("CSS legacy del POS y skeletons no vuelven al bundle", () => {
  const cssFiles = readdirSync("src/app")
    .filter((name) => name.endsWith(".css"))
    .map((name) => source(join("src/app", name)))
    .join("\n");

  for (const selector of [
    ".pos-collapsible",
    ".pos-cart-controls",
    ".pos-form-grid",
    ".pos-cash-gate",
    ".mobix-skeleton",
    ".mobix-loading-screen",
  ]) {
    assert.equal(cssFiles.includes(selector), false, `Selector legacy detectado: ${selector}`);
  }

  assert.equal(existsSync("src/app/mobix-pos-cash.css"), false);
  assert.equal(source("src/app/mobix.css").includes("mobix-pos-cash.css"), false);
  assert.ok(source("src/app/mobix-pos-final.css").includes(".pos-page-shell"));
});

test("consultas críticas conservan las optimizaciones de payload", () => {
  const dashboard = source("src/modules/dashboard/dashboard.repository.ts");
  const reports = source("src/modules/reports/reports.repository.ts");
  const pos = source("src/modules/sales/pos-context.repository.ts");

  assert.ok(dashboard.includes('_count: { select: { units: { where: { status: "AVAILABLE" } } } }'));
  assert.equal(
    dashboard.includes('units: { where: { status: "AVAILABLE" }, select: { id: true } }'),
    false,
  );

  assert.equal(reports.includes("prisma.inventoryBalance.findMany"), false);
  assert.equal(reports.includes('prisma.productUnit.findMany({ where: { companyId: company.id, status: "AVAILABLE" }'), false);
  assert.ok(reports.includes('FROM "inventory_balances"'));
  assert.ok(reports.includes('FROM "product_units"'));

  assert.equal(pos.includes("identifierCatalogRaw"), false);
  assert.ok(pos.includes("missingIdentifierProductIds"));
  assert.ok(pos.includes("const catalog = await mapCatalog"));
});


test("todos los CSS globales conservan llaves balanceadas", () => {
  const files = readdirSync("src/app").filter((name) => name.endsWith(".css"));

  for (const name of files) {
    const css = source(join("src/app", name));
    let depth = 0;
    let minDepth = 0;
    let quote: string | null = null;
    let comment = false;

    for (let index = 0; index < css.length; index += 1) {
      const char = css[index];
      const next = css[index + 1];

      if (comment) {
        if (char === "*" && next === "/") {
          comment = false;
          index += 1;
        }
        continue;
      }

      if (quote) {
        if (char === "\\") {
          index += 1;
          continue;
        }
        if (char === quote) quote = null;
        continue;
      }

      if (char === "/" && next === "*") {
        comment = true;
        index += 1;
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        minDepth = Math.min(minDepth, depth);
      }
    }

    assert.equal(minDepth, 0, `${name} tiene una llave de cierre sobrante`);
    assert.equal(depth, 0, `${name} tiene llaves sin cerrar`);
  }
});

test("autorización simple no carga settings empresariales", () => {
  const context = source("src/lib/business-context.ts");

  const permissionBlock = context.slice(
    context.indexOf("export async function requirePermission(code: string)"),
    context.indexOf("export async function requirePermissionWithSettings(code: string)"),
  );
  assert.equal(permissionBlock.includes("loadCompanySettings"), false);
  assert.ok(context.includes("export async function requirePermissionWithSettings"));
  assert.ok(context.includes("loadCompanySettings(context.company.id)"));
});

test("build no ejecuta migraciones y start sí conserva migrate deploy", () => {
  const pkg = JSON.parse(source("package.json"));
  assert.equal(pkg.scripts.build.includes("migrate deploy"), false);
  assert.ok(pkg.scripts.start.includes("prisma migrate deploy"));
});


test("selectores huérfanos finales no regresan al CSS global", () => {
  const cssFiles = readdirSync("src/app")
    .filter((name) => name.endsWith(".css"))
    .map((name) => source(join("src/app", name)))
    .join("\n");

  for (const selector of [
    ".chart-bars",
    ".check-row",
    ".checklist",
    ".empty-chart",
    ".filter-button",
    ".login-hero-copy",
    ".pos-heading",
    ".field-help",
    ".help-text",
    ".pos-credit-profile",
    ".main-shell",
  ]) {
    assert.equal(cssFiles.includes(selector), false, `Selector huérfano detectado: ${selector}`);
  }
});


test("POS inicial calcula crédito solo para los clientes realmente cargados", () => {
  const pos = source("src/modules/sales/pos-context.repository.ts");

  assert.ok(pos.includes("take: 100"));
  assert.ok(pos.includes("customerIds = customers.map"));
  assert.ok(pos.includes("prisma.accountReceivable.groupBy"));
  assert.ok(pos.includes("customerId: { in: customerIds }"));
  assert.equal(pos.includes("type CreditProfileRow"), false);
  assert.equal(pos.includes('FROM "customers" c'), false);
});

test("detalles de venta y equipo usan selects acotados", () => {
  const sales = source("src/modules/sales/sales.repository.ts");
  const devices = source("src/modules/devices/devices.repository.ts");

  assert.ok(sales.includes("export async function getSaleDetail"));
  assert.equal(sales.includes("createdBy: true"), false);
  assert.ok(sales.includes("customer: {"));
  assert.ok(sales.includes("documentNumber: true"));
  assert.ok(sales.includes("serviceOrders: {"));

  assert.ok(devices.includes("export async function getDeviceDetail"));
  assert.equal(devices.includes("product: { include:"), false);
  assert.equal(devices.includes("variant: true"), false);
  assert.ok(devices.includes("purchaseCost: true"));
  assert.ok(devices.includes("returnItems: {"));
});

test("devoluciones de ventas y clientes se resumen en la base de datos", () => {
  const sales = source("src/modules/sales/sales-list.repository.ts");
  const customers = source("src/modules/customers/customers.repository.ts");

  assert.ok(sales.includes("prisma.returnItem.aggregate"));
  assert.ok(sales.includes("prisma.returnOrder.count"));
  assert.equal(sales.includes("todayReturns.reduce"), false);

  assert.ok(customers.includes("prisma.returnItem.aggregate"));
  assert.equal(customers.includes("customerReturns.reduce"), false);
});

test("reportes agregan ventas en PostgreSQL en lugar de cargar todas las filas", () => {
  const reports = source("src/modules/reports/reports.repository.ts");

  assert.equal(reports.includes('safe("Ventas del periodo", [], () => prisma.sale.findMany'), false);
  assert.ok(reports.includes('TO_CHAR(fs."createdAt" AT TIME ZONE \'America/Lima\''));
  assert.ok(reports.includes('FROM "sale_items" si'));
  assert.ok(reports.includes('FROM "sale_payments" sp'));
  assert.ok(reports.includes('INNER JOIN "users" u'));
  assert.ok(reports.includes('INNER JOIN "branches" b'));
  assert.ok(reports.includes("const transactionCount = Number"));
});

test("transferencias cargan IMEI bajo demanda", () => {
  const repository = source("src/modules/transfers/transfers.repository.ts");
  const form = source("src/modules/transfers/transfer-form.tsx");
  const route = source("src/app/api/transfers/units/route.ts");

  assert.ok(repository.includes("prisma.productUnit.groupBy"));
  assert.ok(repository.includes("export async function getTransferUnits"));
  assert.equal(repository.includes("units: {"), false);
  assert.ok(form.includes("/api/transfers/units"));
  assert.ok(form.includes("loadUnits(product.variantId)"));
  assert.ok(route.includes('requirePermission("inventory.transfer")'));
});

test("caja consulta solo campos utilizados en el resumen", () => {
  const cash = source("src/modules/cash/cash.repository.ts");

  assert.ok(cash.includes("openingAmount: true"));
  assert.ok(cash.includes("movements: {"));
  assert.ok(cash.includes("paymentMethod: true"));
  assert.equal(cash.includes("include: {\n      branch:"), false);
});

test("redondeo monetario usa una sola implementación compartida", () => {
  const money = source("src/lib/money.ts");
  const cash = source("src/modules/cash/cash.repository.ts");
  const payments = source("src/modules/sales/sale-payment-service.ts");
  const purchases = source("src/modules/purchases/purchase-actions.ts");

  assert.ok(money.includes("export function roundMoney"));
  for (const module of [cash, payments, purchases]) {
    assert.ok(module.includes('import { roundMoney } from "@/lib/money"'));
    assert.equal(module.includes("function money(value: number)"), false);
    assert.equal(module.includes("function roundMoney(value: number)"), false);
  }
});

test("selectores residuales retirados no regresan", () => {
  const cssFiles = readdirSync("src/app")
    .filter((name) => name.endsWith(".css"))
    .map((name) => source(join("src/app", name)))
    .join("\n");

  for (const selector of [".dashboard-grid", ".fixed-qty"]) {
    assert.equal(cssFiles.includes(selector), false, `Selector residual detectado: ${selector}`);
  }
});
