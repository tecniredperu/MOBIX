import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { ServiceForm } from "@/modules/service/service-form";
import { getServiceContext } from "@/modules/service/service.repository";

export const dynamic = "force-dynamic";

export default async function NewServicePage() {
  await requirePermission("service.manage");
  const { customers, soldUnits } = await getServiceContext();
  return (
    <AppShell>
      <ServiceForm customers={customers} soldUnits={soldUnits} />
    </AppShell>
  );
}
