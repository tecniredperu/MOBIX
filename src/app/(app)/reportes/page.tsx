import { AppShell } from "@/components/layout/app-shell";
import { ReportsView } from "@/modules/reports/reports-view";
import { getReports } from "@/modules/reports/reports.repository";

export const dynamic = "force-dynamic";
type SearchParams = Record<string,string|string[]|undefined>;
const one=(v:string|string[]|undefined)=>Array.isArray(v)?v[0]:v;

export default async function ReportsPage({searchParams}:{searchParams:Promise<SearchParams>}){
  const params=await searchParams;
  const data=await getReports({from:one(params.from),to:one(params.to)});
  return <AppShell><ReportsView data={data}/></AppShell>;
}
