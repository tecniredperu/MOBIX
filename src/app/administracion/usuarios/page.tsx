import { AppShell } from "@/components/layout/app-shell";
import { UsersAdminView } from "@/modules/admin/users-view";
import { getAdminData } from "@/modules/admin/admin.repository";
export const dynamic="force-dynamic";
export default async function UsersAdminPage(){const data=await getAdminData();return <AppShell><UsersAdminView users={data.users} roles={data.roles} branches={data.branches}/></AppShell>}
