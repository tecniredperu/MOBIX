import { requirePermission } from "@/lib/business-context";
import { getDashboardData } from "@/modules/dashboard/dashboard.repository";
import { DashboardView } from "@/modules/dashboard/dashboard-view";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const auth = await requirePermission("dashboard.view");
  const data = await getDashboardData();

  return (
    <>
      <DashboardView data={data} isSystem={auth.membership.role.isSystem} permissions={[...auth.permissions]} />
    </>
  );
}
