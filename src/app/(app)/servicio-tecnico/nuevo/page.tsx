import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { ServiceForm } from "@/modules/service/service-form";
import {
  getServiceContext,
  searchServiceSoldUnits,
} from "@/modules/service/service.repository";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewServicePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission("service.manage");
  const params = await searchParams;
  const unitQuery = single(params.unit)?.trim() ?? "";

  const [{ customers, soldUnits }, matchedUnits] = await Promise.all([
    getServiceContext(),
    unitQuery ? searchServiceSoldUnits(unitQuery) : Promise.resolve([]),
  ]);

  const merged = new Map(soldUnits.map((unit) => [unit.id, unit]));
  for (const unit of matchedUnits) merged.set(unit.id, unit);
  const units = [...merged.values()];
  const initialUnit = matchedUnits[0] ?? null;

  return (
    <AppShell>
      <ServiceForm
        customers={customers}
        soldUnits={units}
        initialUnitId={initialUnit?.id ?? ""}
        initialUnitQuery={unitQuery}
      />
    </AppShell>
  );
}
