import { AppShell } from "@/components/layout/app-shell";
import { DashboardView } from "@/modules/dashboard/dashboard-view";

export default function HomePage() {
  return (
    <AppShell>
      <DashboardView />
    </AppShell>
  );
}
