import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";
import { CatalogManager } from "@/modules/products/catalog-manager";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const auth = await requirePermission("inventory.view");
  const canManage = auth.membership.role.isSystem || auth.permissions.has("inventory.manage");

  const categories = await prisma.category.findMany({
    where: { companyId: auth.company.id },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      status: true,
      updatedAt: true,
      _count: {
        select: {
          products: { where: { deletedAt: null } },
        },
      },
    },
  });

  return (
    <AppShell>
      <CatalogManager
        kind="category"
        title="Categorías"
        description="Organiza el catálogo por tipo de producto. Puedes crear, editar o desactivar categorías sin perder el historial de los productos asociados."
        singularLabel="Categoría"
        pluralLabel="Categorías"
        canManage={canManage}
        initialItems={categories.map((category) => ({
          id: category.id,
          name: category.name,
          status: category.status,
          productCount: category._count.products,
          updatedAt: category.updatedAt.toISOString(),
        }))}
      />
    </AppShell>
  );
}
