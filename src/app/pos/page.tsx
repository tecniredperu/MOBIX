import { AppShell } from "@/components/layout/app-shell";
import { PosFormV2 } from "@/modules/sales/pos-form-v2";
import { getPosContext } from "@/modules/sales/sales.repository";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const { warehouses, catalog, customers } = await getPosContext();

  return (
    <AppShell>
      <PosFormV2 warehouses={warehouses} catalog={catalog} customers={customers} />
    </AppShell>
  );
}