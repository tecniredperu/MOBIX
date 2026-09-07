export const PRODUCT_TYPE_LABELS = {
  PHONE: "Celular",
  SERIALIZED: "Equipo serializado",
  ACCESSORY: "Accesorio",
  SERVICE: "Servicio",
} as const;

export type ProductTypeValue = keyof typeof PRODUCT_TYPE_LABELS;

export type ProductListItem = {
  id: string;
  name: string;
  model: string | null;
  type: ProductTypeValue;
  brand: string;
  category: string;
  stock: number;
  price: number;
  cost: number;
  minimumStock: number;
  status: "ACTIVE" | "INACTIVE";
  variantSummary: string;
};

export type ProductCatalogOption = {
  id: string;
  name: string;
};
