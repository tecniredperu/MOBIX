import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { ServiceDetailView } from "@/modules/service/service-detail-view";
import { getServiceContext, getServiceOrderDetail } from "@/modules/service/service.repository";

export const dynamic = "force-dynamic";

export default async function ServiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("service.manage");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [order, context] = await Promise.all([
    getServiceOrderDetail(id),
    getServiceContext(),
  ]);
  if (!order) notFound();

  return (
    <AppShell>
      <ServiceDetailView order={order} technicians={context.technicians} created={query.created === "1"} />
    </AppShell>
  );
}
