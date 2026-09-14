import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";
import { CatalogManager } from "@/modules/products/catalog-manager";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const auth = await requirePermission("inventory.view");
  const canManage = auth.membership.role.isSystem || auth.permissions.has("inventory.manage");

  const brands = await prisma.brand.findMany({
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
        kind="brand"
        title="Marcas"
        description="Administra las marcas comerciales del catálogo. Puedes crear, renombrar o desactivar marcas manteniendo intacto el historial de productos."
        singularLabel="Marca"
        pluralLabel="Marcas"
        canManage={canManage}
        initialItems={brands.map((brand) => ({
          id: brand.id,
          name: brand.name,
          status: brand.status,
          productCount: brand._count.products,
          updatedAt: brand.updatedAt.toISOString(),
        }))}
      />
    </AppShell>
  );
}
