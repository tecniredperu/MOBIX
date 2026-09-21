import { requirePermission } from "@/lib/business-context";
import { ReturnsView } from "@/modules/returns/returns-view";
import { getReturns } from "@/modules/returns/returns.repository";
export const dynamic="force-dynamic";
export default async function ReturnsPage(){await requirePermission("returns.manage");return <><ReturnsView items={await getReturns()}/></>}
