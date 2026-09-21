import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

function hasRule(css: string, selector: string, fragments: string[]) {
  const start = css.lastIndexOf(selector);
  assert.notEqual(start, -1, `No se encontró el selector ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  assert.notEqual(open, -1, `No se encontró apertura de ${selector}`);
  assert.notEqual(close, -1, `No se encontró cierre de ${selector}`);
  const block = css.slice(open + 1, close);
  for (const fragment of fragments) {
    assert.ok(
      block.includes(fragment),
      `${selector} debe conservar "${fragment}" como parte del contrato visual del POS.`,
    );
  }
}

test("mobix-pos-final.css permanece como último override global", async () => {
  const cssEntry = await source("src/app/mobix.css");
  const imports = [...cssEntry.matchAll(/@import\s+["']([^"']+)["'];/g)].map((match) => match[1]);

  assert.ok(imports.length > 0, "mobix.css debe importar hojas de estilo.");
  assert.equal(
    imports.at(-1),
    "./mobix-pos-final.css",
    "El POS final debe ser la última hoja importada para evitar regresiones por cascada.",
  );
});

test("el POS conserva la estructura aprobada del workspace", async () => {
  const pos = await source("src/modules/sales/pos-form-v4.tsx");

  assert.ok(pos.includes('className="pos-page pos-v5 page-stack"'));
  assert.ok(pos.includes('className="pos-layout"'));
  assert.ok(pos.includes('className="pos-checkout"'));
  assert.ok(pos.includes("<PosCartCard"));
  assert.ok(pos.includes("<PosCustomerCard"));
  assert.ok(pos.includes("<PosPaymentCard"));
  assert.ok(pos.includes("<PosTotalCard"));

  const cartIndex = pos.indexOf("<PosCartCard");
  const customerIndex = pos.indexOf("<PosCustomerCard");
  const paymentIndex = pos.indexOf("<PosPaymentCard");
  const totalIndex = pos.indexOf("<PosTotalCard");

  assert.ok(
    cartIndex < customerIndex && customerIndex < paymentIndex && paymentIndex < totalIndex,
    "El checkout debe mantener el orden Venta actual → Cliente → Pago → Total.",
  );
});

test("Venta actual conserva el layout premium aprobado", async () => {
  const cart = await source("src/modules/sales/pos/pos-cart-card.tsx");
  const css = await source("src/app/mobix-pos-final.css");

  for (const className of [
    "pos-cart-premium-line",
    "pos-cart-product-info",
    "pos-cart-premium-actions",
    "pos-cart-qty-control",
    "pos-cart-line-price",
    "pos-cart-remove",
  ]) {
    assert.ok(cart.includes(className), `Falta la clase estable ${className} en Venta actual.`);
  }

  assert.ok(
    cart.indexOf("pos-cart-product-info") < cart.indexOf("pos-cart-premium-actions"),
    "La descripción del producto debe conservar prioridad horizontal frente a controles.",
  );
  assert.ok(cart.includes("title={line.name}"), "El nombre completo debe seguir disponible por tooltip.");
  assert.ok(cart.includes("aria-label={`Quitar ${line.name}`}"), "Eliminar debe conservar etiqueta accesible.");

  assert.ok(
    css.includes("CURRENT SALE — reference layout"),
    "Debe conservarse el bloque identificado como referencia aprobada de Venta actual.",
  );

  assert.equal(
    css.includes(".pos-v5 .pos-cart-line-head"),
    false,
    "No deben regresar selectores legacy de cabecera de línea.",
  );
  assert.equal(
    css.includes(".pos-v5 .pos-cart-controls"),
    false,
    "No deben regresar controles legacy que compitan con el layout premium.",
  );

  hasRule(css, ".pos-v5 .pos-v5-cart-card .pos-cart-premium-line", [
    "min-height: 58px !important",
    "grid-template-columns: minmax(0, 1fr) auto !important",
  ]);
  hasRule(css, ".pos-v5 .pos-cart-premium-actions", [
    "grid-template-columns: 88px 94px 34px",
  ]);
  hasRule(css, ".pos-v5 .pos-cart-qty-control", [
    "width: 88px",
    "height: 32px !important",
  ]);
  hasRule(css, ".pos-v5 .pos-cart-line-price", [
    "width: 94px",
    "height: 32px",
  ]);
  hasRule(css, ".pos-v5 .pos-cart-remove", [
    "width: 34px",
    "height: 34px",
  ]);
});

test("el total permanece visible y jerarquizado en escritorio", async () => {
  const css = await source("src/app/mobix-pos-final.css");
  const total = await source("src/modules/sales/pos/pos-total-card.tsx");

  assert.ok(total.includes("pos-v5-grand-total"));
  assert.ok(total.includes("pos-v5-confirm"));
  assert.ok(total.includes('id="pos-confirm-sale"'));

  hasRule(css, ".pos-v5 .pos-v5-grand-total", [
    "min-height: 56px",
  ]);
  hasRule(css, ".pos-v5 .pos-v5-grand-total strong", [
    "font-size: 29px",
  ]);
  hasRule(css, ".pos-v5 .pos-v5-total-card .pos-v5-confirm", [
    "min-height: 50px",
    "height: 50px",
  ]);
});

test("tablet y móvil no heredan altura fija del checkout de escritorio", async () => {
  const css = await source("src/app/mobix-pos-final.css");

  assert.ok(
    /@media\s*\(max-width:\s*899px\)[\s\S]*?\.pos-v5 \.pos-checkout\s*\{[\s\S]*?height:\s*auto\s*!important;[\s\S]*?max-height:\s*none\s*!important;/m.test(css),
    "En tablet/móvil el checkout debe volver a altura natural.",
  );
  assert.ok(
    /@media\s*\(max-width:\s*899px\)[\s\S]*?\.pos-v5 \.pos-cart-premium-line\s*\{[\s\S]*?grid-template-columns:\s*1fr\s*!important;/m.test(css),
    "En tablet/móvil cada línea del carrito debe apilarse sin recortes.",
  );
});
