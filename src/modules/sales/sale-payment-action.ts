import type { CreateSaleInput } from "./sale-types";

export async function createSaleWithChangeAction(input: CreateSaleInput) {
  const response = await fetch("/api/pos/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string" ? payload.error : "No se pudo completar la venta.",
    );
  }
  return payload.sale as { id: string; tendered: number; change: number };
}
