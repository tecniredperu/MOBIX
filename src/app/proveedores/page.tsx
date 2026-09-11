import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { SuppliersView } from "@/modules/suppliers/suppliers-view";
import { getSuppliers } from "@/modules/suppliers/suppliers.repository";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await requirePermission("purchases.view");
  const params = await searchParams;
  const filters = { q: single(params.q), status: single(params.status) };
  const { items, summary } = await getSuppliers(filters);
  const canEdit = context.membership.role.isSystem || context.permissions.has("purchases.create");

  return (
    <AppShell>
      <SuppliersView suppliers={items} summary={summary} filters={filters} canEdit={canEdit} />
    </AppShell>
  );
}
