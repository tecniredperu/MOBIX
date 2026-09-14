import type { PosCustomer } from "./sale-types";

type CustomerDocumentType = "DNI" | "RUC" | "CE" | "OTHER";

export async function createPosCustomerAction(input: {
  documentType: CustomerDocumentType;
  documentNumber?: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}): Promise<PosCustomer> {
  const response = await fetch("/api/pos/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string" ? payload.error : "No se pudo registrar el cliente.",
    );
  }
  return payload.customer as PosCustomer;
}
