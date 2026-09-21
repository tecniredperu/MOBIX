import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { AuditView } from "@/modules/admin/audit-view";
import { getAuditPage } from "@/modules/admin/audit.repository";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInt(value: string | undefined, fallback = 1) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission("audit.view");
  const params = await searchParams;
  const data = await getAuditPage({
    q: single(params.q),
    action: single(params.action),
    entity: single(params.entity),
    userId: single(params.userId),
    page: positiveInt(single(params.page)),
    pageSize: 50,
  });

  return (
    <AppShell>
      <AuditView data={data} />
    </AppShell>
  );
}
