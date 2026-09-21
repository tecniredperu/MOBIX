import { requirePermission } from "@/lib/business-context";
import { PurchaseForm } from "@/modules/purchases/purchase-form";
import { getPurchaseContext } from "@/modules/purchases/purchases.repository";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage() {
  const { settings } = await requirePermission("purchases.create");
  const { catalog, warehouses, suppliers } = await getPurchaseContext();

  return (
    <>
      <PurchaseForm catalog={catalog} warehouses={warehouses} suppliers={suppliers} taxRate={settings.taxRate} />
    </>
  );
}
