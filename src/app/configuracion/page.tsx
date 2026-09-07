import { AppShell } from "@/components/layout/app-shell";
import { SettingsView } from "@/modules/settings/settings-view";
import { getSettingsData } from "@/modules/settings/settings.repository";
export const dynamic="force-dynamic";
export default async function SettingsPage(){return <AppShell><SettingsView data={await getSettingsData()}/></AppShell>}
