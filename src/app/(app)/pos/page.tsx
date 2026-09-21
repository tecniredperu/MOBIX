import { requirePermission } from "@/lib/business-context";
import { getExchangeCreditForPos } from "@/modules/sales/exchange-credit.repository";
import { getOptimizedPosContext } from "@/modules/sales/pos-context.repository";
import { PosFormV4 } from "@/modules/sales/pos-form-v4";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission("sales.create");
  const params = await searchParams;
  const exchangeCreditId = single(params.exchangeCredit)?.trim() ?? "";

  const [{ warehouses, catalog, customers }, exchangeCredit] = await Promise.all([
    getOptimizedPosContext(),
    exchangeCreditId ? getExchangeCreditForPos(exchangeCreditId) : Promise.resolve(null),
  ]);

  return (
    <>
      <div className="pos-page-shell">
        <PosFormV4
          warehouses={warehouses}
          catalog={catalog}
          customers={customers}
          initialExchangeCredit={exchangeCredit}
        />
      </div>
    </>
  );
}
