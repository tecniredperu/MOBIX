import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { getSalesPage } from "@/modules/sales/sales-list.repository";
import { SalesView } from "@/modules/sales/sales-view";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function positiveInt(value: string | undefined, fallback = 1) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission("sales.view");
  const params = await searchParams;
  const filters = {
    q: single(params.q),
    status: single(params.status),
    documentType: single(params.documentType),
    page: positiveInt(single(params.page)),
    pageSize: 50,
  };
  const { items, summary, pagination } = await getSalesPage(filters);

  return (
    <AppShell>
      <SalesView sales={items} summary={summary} pagination={pagination} filters={filters} />
    </AppShell>
  );
}
