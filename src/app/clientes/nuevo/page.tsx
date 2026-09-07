import { AppShell } from "@/components/layout/app-shell";
import { CustomerForm } from "@/modules/customers/customer-form";

export default function NewCustomerPage() {
  return (
    <AppShell>
      <CustomerForm />
    </AppShell>
  );
}
