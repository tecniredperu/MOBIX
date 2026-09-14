import { requirePermission } from "@/lib/business-context";
import { ServiceListView } from "@/modules/service/service-list-view";
import { getServiceOrders } from "@/modules/service/service.repository";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;
function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function ServicePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission("service.manage");
  const params = await searchParams;
  const pageValue = Number(single(params.page));
  const filters = { q: single(params.q), status: single(params.status), type: single(params.type), page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1, pageSize: 50 };
  const { items, summary, pagination } = await getServiceOrders(filters);
  return <ServiceListView items={items} summary={summary} pagination={pagination} filters={filters} />;
}
