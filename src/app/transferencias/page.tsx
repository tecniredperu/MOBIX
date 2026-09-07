import { AppShell } from "@/components/layout/app-shell";
import { TransfersView } from "@/modules/transfers/transfers-view";
import { getTransfers } from "@/modules/transfers/transfers.repository";
export const dynamic="force-dynamic";
export default async function TransfersPage(){return <AppShell><TransfersView items={await getTransfers()}/></AppShell>}
