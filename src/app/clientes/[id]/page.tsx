import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { CustomerDetailView } from "@/modules/customers/customer-detail-view";
import { getCustomerDetail } from "@/modules/customers/customers.repository";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("customers.manage");
  const { id } = await params;
  const customer = await getCustomerDetail(id);
  if (!customer) notFound();

  return (
    <AppShell>
      <CustomerDetailView customer={customer} />
    </AppShell>
  );
}
