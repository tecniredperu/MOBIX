import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/business-context";
import { DeviceDetailView } from "@/modules/devices/device-detail-view";
import { getDeviceDetail } from "@/modules/devices/devices.repository";

export const dynamic = "force-dynamic";

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("inventory.view");
  const { id } = await params;
  const device = await getDeviceDetail(id);
  if (!device) notFound();

  return (
    <>
      <DeviceDetailView device={device} />
    </>
  );
}
