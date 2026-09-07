import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { SaleDetailView } from "@/modules/sales/sale-detail-view";
import { getSaleDetail } from "@/modules/sales/sales.repository";

export const dynamic = "force-dynamic";

export default async function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("sales.view");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const sale = await getSaleDetail(id);
  if (!sale) notFound();
  const created = (Array.isArray(query.created) ? query.created[0] : query.created) === "1";

  return (
    <AppShell>
      <SaleDetailView sale={sale} created={created} />
    </AppShell>
  );
}
