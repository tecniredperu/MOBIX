import { AppShell } from "@/components/layout/app-shell";
import { ProductForm } from "@/modules/products/product-form";
import { getProductCatalogContext } from "@/modules/products/products.repository";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const { categories, brands } = await getProductCatalogContext();

  return (
    <AppShell>
      <ProductForm categories={categories} brands={brands} />
    </AppShell>
  );
}
