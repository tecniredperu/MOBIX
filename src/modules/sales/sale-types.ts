export type SaleTaxCondition = "TAXED" | "EXEMPT" | "UNAFFECTED";
export type SaleDocumentType = "RECEIPT" | "INVOICE" | "SALES_NOTE";
export type SalePaymentMethod = "CASH" | "YAPE" | "PLIN" | "CARD" | "TRANSFER" | "CREDIT" | "OTHER";

export type PosWarehouse = {
  id: string;
  name: string;
  branchName: string;
};

export type PosUnit = {
  id: string;
  warehouseId: string;
  imei1: string | null;
  imei2: string | null;
  serial: string | null;
};

export type PosBalance = {
  warehouseId: string;
  quantity: number;
};

export type PosCatalogItem = {
  productId: string;
  variantId: string;
  type: "PHONE" | "SERIALIZED" | "ACCESSORY" | "SERVICE";
  name: string;
  brand: string;
  category: string;
  sku: string | null;
  variant: string;
  salePrice: number;
  minimumSalePrice: number;
  units: PosUnit[];
  balances: PosBalance[];
};

export type PosCustomer = {
  id: string;
  documentType: string | null;
  documentNumber: string | null;
  name: string;
  phone: string | null;
  creditEnabled: boolean;
  creditLimit: number;
  creditDays: number;
  outstanding: number;
  availableCredit: number;
};

export type CreateSaleInput = {
  warehouseId: string;
  customerId?: string;
  customer?: {
    documentType?: "DNI" | "RUC" | "CE" | "OTHER";
    documentNumber?: string;
    name?: string;
    phone?: string;
    email?: string;
  };
  documentType: SaleDocumentType;
  taxCondition: SaleTaxCondition;
  discount: number;
  lines: Array<{
    variantId: string;
    quantity: number;
    unitPrice: number;
    selectedUnitIds?: string[];
  }>;
  payments: Array<{
    method: SalePaymentMethod;
    amount: number;
    reference?: string;
  }>;
};
