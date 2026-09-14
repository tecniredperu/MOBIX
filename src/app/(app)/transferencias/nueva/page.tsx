import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { TransferForm } from "@/modules/transfers/transfer-form";
import { getTransferOptions } from "@/modules/transfers/transfers.repository";
export const dynamic="force-dynamic";
export default async function NewTransferPage(){await requirePermission("inventory.transfer");const data=await getTransferOptions();return <AppShell><TransferForm {...data}/></AppShell>}
