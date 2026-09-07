import { AppShell } from "@/components/layout/app-shell";
import { PosForm } from "@/modules/sales/pos-form";
import { getPosContext } from "@/modules/sales/sales.repository";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const { warehouses, catalog, customers } = await getPosContext();

  return (
    <AppShell>
      <PosForm warehouses={warehouses} catalog={catalog} customers={customers} />
    </AppShell>
  );
}
