import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { SettingsView } from "@/modules/settings/settings-view";
import { getSettingsData } from "@/modules/settings/settings.repository";
export const dynamic="force-dynamic";
export default async function SettingsPage(){await requirePermission("settings.manage");return <AppShell><SettingsView data={await getSettingsData()}/></AppShell>}
