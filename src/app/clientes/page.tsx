import { AppShell } from "@/components/layout/app-shell";
import { CustomersView } from "@/modules/customers/customers-view";
import { getCustomers } from "@/modules/customers/customers.repository";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filters = { q: single(params.q), credit: single(params.credit) };
  const { items, summary } = await getCustomers(filters);

  return (
    <AppShell>
      <CustomersView customers={items} summary={summary} filters={filters} />
    </AppShell>
  );
}
