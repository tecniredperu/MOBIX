export type ServiceType = "WARRANTY" | "TECHNICAL_SERVICE";
export type ServiceStatus =
  | "RECEIVED"
  | "DIAGNOSIS"
  | "WAITING_APPROVAL"
  | "IN_REPAIR"
  | "READY"
  | "DELIVERED"
  | "CANCELLED";

export type ServiceCustomerOption = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
};

export type SoldUnitOption = {
  id: string;
  saleId: string;
  saleNumber: string;
  soldAt: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  productName: string;
  brand: string;
  model: string | null;
  variant: string;
  identifier: string;
  warrantyDays: number;
  warrantyExpiresAt: string | null;
  withinWarranty: boolean;
};

export type ServiceListItem = {
  id: string;
  serviceNumber: string;
  serviceType: ServiceType;
  status: ServiceStatus;
  customerName: string;
  customerPhone: string | null;
  deviceName: string;
  identifier: string | null;
  warrantyCovered: boolean;
  technicianName: string | null;
  estimatedCost: number;
  finalCost: number;
  receivedAt: string;
  expectedAt: string | null;
};
