import { AppShell } from "@/components/layout/app-shell";
import { CashView } from "@/modules/cash/cash-view";
import { getCashDeskContext } from "@/modules/cash/cash.repository";

export const dynamic = "force-dynamic";

export default async function CashPage() {
  const context = await getCashDeskContext();

  return (
    <AppShell>
      <CashView {...context} />
    </AppShell>
  );
}
