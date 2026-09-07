export type PurchaseTaxCondition = "TAXED" | "EXEMPT" | "UNAFFECTED";
export type PurchaseDocumentType = "FACTURA" | "BOLETA" | "GUIA" | "OTRO";

export type PurchaseUnitInput = {
  imei1?: string;
  imei2?: string;
  serial?: string;
};

export type PurchaseLineInput = {
  variantId: string;
  quantity: number;
  unitCost: number;
  units?: PurchaseUnitInput[];
};

export type CreatePurchaseInput = {
  supplier: {
    documentType: "RUC" | "DNI" | "CE" | "OTHER";
    documentNumber: string;
    businessName: string;
    phone?: string;
  };
  warehouseId: string;
  documentType: PurchaseDocumentType;
  documentSeries?: string;
  documentNumber?: string;
  issueDate: string;
  taxCondition: PurchaseTaxCondition;
  notes?: string;
  lines: PurchaseLineInput[];
};

export type PurchaseCatalogItem = {
  variantId: string;
  productId: string;
  name: string;
  model: string | null;
  type: "PHONE" | "SERIALIZED" | "ACCESSORY";
  brand: string;
  color: string | null;
  ram: string | null;
  storage: string | null;
  sku: string | null;
  purchasePrice: number;
  requiresImei: boolean;
  requiresSerial: boolean;
};

export const PURCHASE_TAX_LABELS: Record<PurchaseTaxCondition, string> = {
  TAXED: "Gravado (IGV 18%)",
  EXEMPT: "Exonerado",
  UNAFFECTED: "Inafecto",
};
