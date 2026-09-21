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
