import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { ProductEditForm } from "@/modules/products/product-edit-form";
import { getProductCatalogContext, getProductForEdit } from "@/modules/products/products.repository";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("inventory.manage");
  const { id } = await params;

  const [product, context] = await Promise.all([
    getProductForEdit(id),
    getProductCatalogContext(),
  ]);

  if (!product) notFound();

  return (
    <AppShell>
      <ProductEditForm
        product={product}
        categories={context.categories}
        brands={context.brands}
      />
    </AppShell>
  );
}
