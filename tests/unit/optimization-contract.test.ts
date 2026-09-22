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
