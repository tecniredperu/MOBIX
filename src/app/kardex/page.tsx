import { AppShell } from "@/components/layout/app-shell";
import { KardexView } from "@/modules/inventory/kardex-view";
import { getKardex } from "@/modules/inventory/kardex.repository";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function KardexPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filters = { q: single(params.q), movementType: single(params.movementType), warehouseId: single(params.warehouseId) };
  const { items, warehouses, summary } = await getKardex(filters);

  return (
    <AppShell>
      <KardexView items={items} warehouses={warehouses} summary={summary} filters={filters} />
    </AppShell>
  );
}
