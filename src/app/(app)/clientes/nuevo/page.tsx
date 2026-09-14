import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { CustomerForm } from "@/modules/customers/customer-form";

export default async function NewCustomerPage() {
  await requirePermission("customers.manage");
  return (
    <AppShell>
      <CustomerForm />
    </AppShell>
  );
}
