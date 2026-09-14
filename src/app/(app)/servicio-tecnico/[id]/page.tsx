import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/business-context";
import { ServiceDetailView } from "@/modules/service/service-detail-view";
import { getServiceOrderDetail, getServiceTechnicians } from "@/modules/service/service.repository";

export const dynamic = "force-dynamic";

export default async function ServiceDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("service.manage");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [order, technicians] = await Promise.all([getServiceOrderDetail(id), getServiceTechnicians()]);
  if (!order) notFound();
  return <ServiceDetailView order={order} technicians={technicians} created={query.created === "1"} />;
}
