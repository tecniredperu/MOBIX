import { requirePermission } from "@/lib/business-context";
import { AuditLogView } from "@/modules/admin/audit-log-view";
import { getAuditLogData } from "@/modules/admin/admin.repository";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await requirePermission("roles.manage");
  const items = await getAuditLogData(200);

  return (
    <>
      <AuditLogView items={items} />
    </>
  );
}
