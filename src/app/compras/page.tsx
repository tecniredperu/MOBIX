import { AppShell } from "@/components/layout/app-shell";
import { PurchasesView } from "@/modules/purchases/purchases-view";
import { getPurchases } from "@/modules/purchases/purchases.repository";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filters = { q: single(params.q), status: single(params.status) };
  const { items, summary } = await getPurchases(filters);

  return (
    <AppShell>
      <PurchasesView
        purchases={items}
        summary={summary}
        filters={filters}
        created={single(params.created) === "1"}
        createdNumber={single(params.number)}
      />
    </AppShell>
  );
}
