import type { PosCatalogItem, SalePaymentMethod } from "../sale-types";

export type CartLine = {
  key: string;
  variantId: string;
  type: PosCatalogItem["type"];
  name: string;
  variant: string;
  quantity: number;
  unitPrice: number;
  minimumSalePrice: number;
  selectedUnitIds: string[];
  unitLabel?: string;
};

export type PaymentLine = {
  id: string;
  method: SalePaymentMethod;
  amount: number;
  reference: string;
};

export type PosCatalogFilter = "ALL" | "PHONE" | "ACCESSORY" | "SERVICE" | "FAVORITES";

export const PAYMENT_LABELS: Record<SalePaymentMethod, string> = {
  CASH: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Crédito",
  OTHER: "Otro",
};

const penFormatter = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 2,
});

const SEARCH_LABEL_TOKENS = new Set(["imei", "imei1", "imei2", "serie", "serial", "codigo"]);

export function formatPen(value: number) {
  return penFormatter.format(value || 0);
}

export function normalizePosSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-PE")
    .trim()
    .replace(/\s+/g, " ");
}

export function posSearchTokens(value: string) {
  return normalizePosSearch(value)
    .split(" ")
    .map((token) => token.replace(/^[:#-]+|[:#-]+$/g, "").trim())
    .filter((token) => Boolean(token) && !SEARCH_LABEL_TOKENS.has(token))
    .slice(0, 8);
}

export function posItemSearchText(item: PosCatalogItem) {
  return normalizePosSearch([
    item.name,
    item.brand,
    item.category,
    item.sku ?? "",
    item.variant,
    ...item.units.flatMap((unit) => [unit.imei1 ?? "", unit.imei2 ?? "", unit.serial ?? ""]),
  ].join(" "));
}

export function itemMatchesPosSearch(item: PosCatalogItem, query: string) {
  const tokens = posSearchTokens(query);
  if (!tokens.length) return true;
  const haystack = posItemSearchText(item);
  return tokens.every((token) => haystack.includes(token));
}

export function stockFor(item: PosCatalogItem, warehouseId: string) {
  if (item.type === "SERVICE") return 999999;

  const balance = item.balances.find((entry) => entry.warehouseId === warehouseId);
  if (balance) return Number(balance.quantity || 0);

  if (item.type === "PHONE" || item.type === "SERIALIZED") {
    return item.units.filter((unit) => unit.warehouseId === warehouseId).length;
  }

  return 0;
}

export function unitLabel(unit: PosCatalogItem["units"][number]) {
  if (unit.imei1) return `IMEI ${unit.imei1}`;
  if (unit.serial) return `Serie ${unit.serial}`;
  return "Equipo serializado";
}
