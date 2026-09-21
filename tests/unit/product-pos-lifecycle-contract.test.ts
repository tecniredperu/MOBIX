import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("la venta exige producto padre activo y no eliminado", async () => {
  const saleActions = await source("src/modules/sales/sale-actions.ts");

  assert.match(
    saleActions,
    /product:\s*\{[\s\S]*?companyId:\s*company\.id,[\s\S]*?status:\s*"ACTIVE",[\s\S]*?deletedAt:\s*null,[\s\S]*?\}/m,
    "createSaleAction debe validar el estado del producto padre además de la variante.",
  );
});

test("catálogo y edición versionan la imagen para invalidar caché", async () => {
  const productsRepository = await source("src/modules/products/products.repository.ts");
  const posRepository = await source("src/modules/sales/pos-context.repository.ts");

  for (const code of [productsRepository, posRepository]) {
    assert.ok(
      code.includes("image?v=${updatedAt.getTime()}"),
      "Las imágenes deben incluir versión basada en updatedAt.",
    );
    assert.ok(
      code.includes("updatedAt: true"),
      "La consulta debe recuperar updatedAt de ProductImage.",
    );
  }
});

test("el POS solo consulta productos activos y no eliminados", async () => {
  const posRepository = await source("src/modules/sales/pos-context.repository.ts");

  assert.ok(posRepository.includes('status: "ACTIVE"'));
  assert.ok(posRepository.includes("deletedAt: null"));
  assert.match(
    posRepository,
    /product:\s*\{\s*status:\s*"ACTIVE",\s*deletedAt:\s*null\s*\}/m,
    "La búsqueda por IMEI/SKU debe excluir productos inactivos o eliminados.",
  );
});

test("el borrado de producto conserva trazabilidad histórica", async () => {
  const route = await source("src/app/api/products/[id]/route.ts");

  for (const relation of [
    "units",
    "purchaseItems",
    "saleItems",
    "inventoryMovements",
    "returnItems",
    "stockTransferItems",
  ]) {
    assert.ok(route.includes(`${relation}: true`), `Falta proteger historial: ${relation}`);
  }

  assert.ok(route.includes("PRODUCT_HAS_HISTORY"));
  assert.ok(route.includes('data: { status: "INACTIVE", deletedAt: new Date() }'));
});

test("acciones de producto siguen exponiendo editar, estado y eliminación", async () => {
  const actions = await source("src/modules/products/product-row-actions.tsx");

  assert.ok(actions.includes("Editar"));
  assert.ok(actions.includes("Desactivar"));
  assert.ok(actions.includes("Activar"));
  assert.ok(actions.includes("Eliminar"));
  assert.ok(actions.includes("Solo se eliminará si no tiene ventas, compras, kardex, equipos ni otros movimientos asociados."));
});
