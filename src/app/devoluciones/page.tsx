import { AppShell } from "@/components/layout/app-shell";
import { ReturnsView } from "@/modules/returns/returns-view";
import { getReturns } from "@/modules/returns/returns.repository";
export const dynamic="force-dynamic";
export default async function ReturnsPage(){return <AppShell><ReturnsView items={await getReturns()}/></AppShell>}
