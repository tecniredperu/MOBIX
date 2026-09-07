import { AppShell } from "@/components/layout/app-shell";
import { ReturnForm } from "@/modules/returns/return-form";
import { getReturnSaleOptions } from "@/modules/returns/returns.repository";
export const dynamic="force-dynamic";
export default async function NewReturnPage(){return <AppShell><ReturnForm sales={await getReturnSaleOptions()}/></AppShell>}
