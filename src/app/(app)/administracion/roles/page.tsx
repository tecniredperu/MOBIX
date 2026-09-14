import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { RolesAdminView } from "@/modules/admin/roles-view";
import { getAdminData } from "@/modules/admin/admin.repository";
export const dynamic="force-dynamic";
export default async function RolesAdminPage(){await requirePermission("roles.manage");const data=await getAdminData();return <AppShell><RolesAdminView roles={data.roles} permissions={data.permissions}/></AppShell>}
