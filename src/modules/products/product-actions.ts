export type ProductActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialProductActionState: ProductActionState = { status: "idle" };

type ProductApiResponse = {
  product?: { id: string; name: string };
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function readString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readVariants(formData: FormData) {
  const raw = readString(formData, "variants");
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function createProductAction(
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const payload = {
    type: readString(formData, "type"),
    categoryId: readString(formData, "categoryId"),
    brandId: readString(formData, "brandId"),
    name: readString(formData, "name"),
    model: readString(formData, "model"),
    sku: readString(formData, "sku"),
    barcode: readString(formData, "barcode"),
    description: readString(formData, "description"),
    warrantyDays: readString(formData, "warrantyDays"),
    minimumStock: readString(formData, "minimumStock"),
    variants: readVariants(formData),
  };

  try {
    const response = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const body = (await response.json().catch(() => ({}))) as ProductApiResponse;

    if (!response.ok || !body.product) {
      return {
        status: "error",
        message: body.error ?? "No se pudo guardar el producto. Inténtalo nuevamente.",
        fieldErrors: body.fieldErrors,
      };
    }

    if (typeof window !== "undefined") {
      window.location.assign("/productos?created=1");
    }

    return { status: "idle" };
  } catch {
    return {
      status: "error",
      message: "No se pudo conectar con MOBIX para guardar el producto. Inténtalo nuevamente.",
    };
  }
}
