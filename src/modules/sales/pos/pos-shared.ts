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

export function formatPen(value: number) {
  return penFormatter.format(value || 0);
}

export function stockFor(item: PosCatalogItem, warehouseId: string) {
  if (item.type === "SERVICE") return 999999;
  if (item.type === "PHONE" || item.type === "SERIALIZED") {
    return item.units.filter((unit) => unit.warehouseId === warehouseId).length;
  }
  return item.balances.find((balance) => balance.warehouseId === warehouseId)?.quantity ?? 0;
}

export function unitLabel(unit: PosCatalogItem["units"][number]) {
  if (unit.imei1) return `IMEI ${unit.imei1}`;
  if (unit.serial) return `Serie ${unit.serial}`;
  return "Equipo serializado";
}
