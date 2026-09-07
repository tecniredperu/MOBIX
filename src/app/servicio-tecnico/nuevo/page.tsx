import { AppShell } from "@/components/layout/app-shell";
import { ServiceForm } from "@/modules/service/service-form";
import { getServiceContext } from "@/modules/service/service.repository";

export const dynamic = "force-dynamic";

export default async function NewServicePage() {
  const { customers, soldUnits } = await getServiceContext();
  return (
    <AppShell>
      <ServiceForm customers={customers} soldUnits={soldUnits} />
    </AppShell>
  );
}
