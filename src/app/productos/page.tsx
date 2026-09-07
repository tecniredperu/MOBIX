import { AppShell } from "@/components/layout/app-shell";
import { ProductsView } from "@/modules/products/products-view";
import {
  getProductCatalogContext,
  getProducts,
} from "@/modules/products/products.repository";
import type { ProductTypeValue } from "@/modules/products/product-types";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const type = single(params.type);
  const status = single(params.status);
  const filters = {
    q: single(params.q),
    type: (["PHONE", "SERIALIZED", "ACCESSORY", "SERVICE"] as string[]).includes(type ?? "")
      ? (type as ProductTypeValue)
      : undefined,
    brandId: single(params.brandId),
    categoryId: single(params.categoryId),
    status: status === "ACTIVE" || status === "INACTIVE" ? status : undefined,
  };

  const [{ items, summary }, { brands, categories }] = await Promise.all([
    getProducts(filters),
    getProductCatalogContext(),
  ]);

  return (
    <AppShell>
      <ProductsView
        products={items}
        summary={summary}
        brands={brands}
        categories={categories}
        filters={filters}
        created={single(params.created) === "1"}
      />
    </AppShell>
  );
}
