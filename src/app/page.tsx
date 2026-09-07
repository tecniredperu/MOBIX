import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { getDashboardData } from "@/modules/dashboard/dashboard.repository";
import { DashboardView } from "@/modules/dashboard/dashboard-view";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requirePermission("dashboard.view");
  const data = await getDashboardData();

  return (
    <AppShell>
      <DashboardView data={data} />
    </AppShell>
  );
}
