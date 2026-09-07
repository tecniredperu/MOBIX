import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { SalesView } from "@/modules/sales/sales-view";
import { getSales } from "@/modules/sales/sales.repository";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission("sales.view");
  const params = await searchParams;
  const filters = {
    q: single(params.q),
    status: single(params.status),
    documentType: single(params.documentType),
  };
  const { items, summary } = await getSales(filters);

  return (
    <AppShell>
      <SalesView sales={items} summary={summary} filters={filters} />
    </AppShell>
  );
}
