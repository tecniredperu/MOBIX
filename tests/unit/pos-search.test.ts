import assert from "node:assert/strict";
import test from "node:test";
import type { PosCatalogItem } from "../../src/modules/sales/sale-types";
import {
  itemMatchesPosSearch,
  posSearchTokens,
  stockFor,
} from "../../src/modules/sales/pos/pos-shared";

const phone: PosCatalogItem = {
  productId: "product-1",
  variantId: "variant-1",
  type: "PHONE",
  name: "Samsung Galaxy S25",
  brand: "Samsung",
  category: "Celulares",
  sku: "SAM-S25-256-BLU",
  variant: "12 GB / 256 GB / Azul",
  salePrice: 3899,
  minimumSalePrice: 3600,
  units: [
    {
      id: "unit-1",
      warehouseId: "warehouse-1",
      imei1: "358771234567821",
      imei2: null,
      serial: "S25ABC001",
    },
  ],
  balances: [
    { warehouseId: "warehouse-1", quantity: 5 },
    { warehouseId: "warehouse-2", quantity: 2 },
  ],
};

test("buscador POS combina palabras de producto y variante", () => {
  assert.equal(itemMatchesPosSearch(phone, "samsung 256 azul"), true);
  assert.equal(itemMatchesPosSearch(phone, "xiaomi 256 azul"), false);
});

test("buscador POS reconoce prefijos escritos para IMEI", () => {
  assert.deepEqual(posSearchTokens("IMEI: 358771234567821"), ["358771234567821"]);
  assert.equal(itemMatchesPosSearch(phone, "imei 358771234567821"), true);
});

test("stock serializado usa el saldo del almacén aunque los IMEI no estén precargados", () => {
  const withoutLoadedUnits = { ...phone, units: [] };
  assert.equal(stockFor(withoutLoadedUnits, "warehouse-1"), 5);
  assert.equal(stockFor(withoutLoadedUnits, "warehouse-2"), 2);
});
