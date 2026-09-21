import { requirePermission } from "@/lib/business-context";
import { ReturnForm } from "@/modules/returns/return-form";
import { getReturnSaleOptions } from "@/modules/returns/returns.repository";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission("returns.manage");
  const params = await searchParams;
  const unitId = single(params.unitId)?.trim() ?? "";
  const sales = await getReturnSaleOptions();

  const matchedSale = unitId
    ? sales.find((sale) =>
        sale.items.some((item) =>
          item.units.some((unit) => unit.id === unitId && unit.status === "SOLD"),
        ),
      )
    : undefined;

  return (
    <>
      <ReturnForm
        sales={sales}
        initialSaleId={matchedSale?.id ?? ""}
        initialUnitId={unitId}
      />
    </>
  );
}
