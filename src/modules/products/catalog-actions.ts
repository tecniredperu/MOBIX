export type CatalogOptionKind = "brand" | "category";

export type CatalogOption = {
  id: string;
  name: string;
};

type CatalogResponse = {
  option?: CatalogOption;
  error?: string;
};

export async function createCatalogOptionAction(
  kind: CatalogOptionKind,
  rawName: string,
): Promise<CatalogOption> {
  const response = await fetch("/api/catalog/options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ kind, name: rawName }),
  });

  let payload: CatalogResponse;
  try {
    payload = (await response.json()) as CatalogResponse;
  } catch {
    throw new Error("El servidor devolvió una respuesta inválida.");
  }

  if (!response.ok || !payload.option) {
    throw new Error(payload.error || "No se pudo crear el registro.");
  }

  return payload.option;
}
