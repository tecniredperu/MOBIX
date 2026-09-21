import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/business-context";
import { DevicesView } from "@/modules/devices/devices-view";
import { getDevices } from "@/modules/devices/devices.repository";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function DevicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission("inventory.view");
  const params = await searchParams;
  const filters = { q: single(params.q), status: single(params.status), warehouseId: single(params.warehouseId) };
  const { items, warehouses, summary } = await getDevices(filters);

  const exactQuery = filters.q?.trim().toLocaleLowerCase("es-PE");
  if (exactQuery && items.length === 1) {
    const item = items[0];
    const identifiers = [item.imei1, item.imei2, item.serial]
      .filter((value) => value && value !== "—")
      .map((value) => value.toLocaleLowerCase("es-PE"));
    if (identifiers.includes(exactQuery)) {
      redirect("/equipos/" + item.id);
    }
  }

  return (
    <>
      <DevicesView items={items} warehouses={warehouses} summary={summary} filters={filters} />
    </>
  );
}
