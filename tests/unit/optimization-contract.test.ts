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

  assert.equal(dashboard.includes("stockProducts"), false);
  assert.equal(
    dashboard.includes('_count: { select: { units: { where: { status: "AVAILABLE" } } } }'),
    false,
  );
  assert.ok(dashboard.includes("WITH active_products AS"));
  assert.ok(dashboard.includes('FROM "product_units" pu'));
  assert.ok(dashboard.includes('FROM "inventory_balances" ib'));

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


test("POS limita crédito y payload a clientes realmente cargados", () => {
  const pos = source("src/modules/sales/pos-context.repository.ts");

  assert.equal(pos.includes("type CreditProfileRow"), false);
  assert.equal(pos.includes('FROM "customers" c\n      LEFT JOIN "accounts_receivable"'), false);
  assert.ok(pos.includes('customerId: { in: customerIds }'));
  assert.ok(pos.includes('select: {\n        id: true,\n        documentType: true'));
  assert.ok(pos.includes('...(warehouseId ? { id: warehouseId } : {})'));
});

test("Reportes no carga items y pagos completos por cada venta", () => {
  const reports = source("src/modules/reports/reports.repository.ts");

  const salesBlock = reports.slice(
    reports.indexOf('safe("Ventas del periodo"'),
    reports.indexOf('canSeeCosts\n      ? safe<SaleCostRow[]>'),
  );

  assert.equal(salesBlock.includes("items:"), false);
  assert.equal(salesBlock.includes("payments:"), false);
  assert.ok(reports.includes('FROM "sale_items" si'));
  assert.ok(reports.includes('FROM "sale_payments" sp'));
  assert.ok(reports.includes('GROUP BY si."productId", p."name", b."name"'));
});

test("Dashboard calcula stock bajo y devoluciones con agregación SQL", () => {
  const dashboard = source("src/modules/dashboard/dashboard.repository.ts");

  assert.equal(dashboard.includes("stockProducts"), false);
  assert.equal(dashboard.includes("inventoryBalances: { select: { quantity: true } }"), false);
  assert.ok(dashboard.includes("WITH active_products AS"));
  assert.ok(dashboard.includes('FROM "return_orders" ro'));
  assert.ok(dashboard.includes('COALESCE(SUM(ri."amount"), 0) AS "amount"'));
});

test("Detalle de cliente agrega devoluciones sin cargar historial completo", () => {
  const customers = source("src/modules/customers/customers.repository.ts");

  assert.equal(customers.includes("customerReturns.reduce"), false);
  assert.ok(customers.includes('COALESCE(SUM(ri."amount"), 0) AS "total"'));
  assert.ok(customers.includes('INNER JOIN "sales" s ON s."id" = ro."saleId"'));
});


test("índices de producción permanecen alineados con las lecturas frecuentes", () => {
  const schema = source("prisma/schema.prisma");
  const migration = source("prisma/migrations/20260922124500_query_performance_indexes/migration.sql");

  for (const indexName of [
    "products_company_status_deleted_name_idx",
    "purchases_company_status_issue_date_idx",
    "customers_company_status_updated_idx",
    "cash_sessions_company_status_closed_idx",
    "audit_logs_company_created_idx",
  ]) {
    assert.ok(schema.includes(indexName), `Índice ausente del schema: ${indexName}`);
    assert.ok(migration.includes(indexName), `Índice ausente de la migración: ${indexName}`);
  }
});


test("catálogos operativos no cargan productos borrados ni transferencias imposibles", () => {
  const purchases = source("src/modules/purchases/purchases.repository.ts");
  const transfers = source("src/modules/transfers/transfers.repository.ts");

  assert.ok(purchases.includes('deletedAt: null'));
  assert.ok(transfers.includes('deletedAt: null'));
  assert.ok(transfers.includes('{ units: { some: { status: "AVAILABLE" } } }'));
  assert.ok(transfers.includes('{ inventoryBalances: { some: { quantity: { gt: 0 } } } }'));
});
