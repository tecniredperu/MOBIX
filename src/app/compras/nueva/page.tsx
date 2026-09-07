import { AppShell } from "@/components/layout/app-shell";
import { PurchaseForm } from "@/modules/purchases/purchase-form";
import { getPurchaseContext } from "@/modules/purchases/purchases.repository";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage() {
  const { catalog, warehouses } = await getPurchaseContext();

  return (
    <AppShell>
      <PurchaseForm catalog={catalog} warehouses={warehouses} />
    </AppShell>
  );
}
