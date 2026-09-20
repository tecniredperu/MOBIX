import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { getPosCashStatus } from "@/modules/cash/pos-cash-status";
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
  const { settings } = await requirePermission("sales.create");
  const params = await searchParams;
  const exchangeCreditId = single(params.exchangeCredit)?.trim() ?? "";

  const [{ warehouses, catalog, customers }, cashStatus, exchangeCredit] = await Promise.all([
    getOptimizedPosContext(),
    settings.requireCashSession ? getPosCashStatus() : Promise.resolve(null),
    exchangeCreditId ? getExchangeCreditForPos(exchangeCreditId) : Promise.resolve(null),
  ]);

  return (
    <AppShell>
      <div className="pos-page-shell">
        {settings.requireCashSession ? (
          cashStatus ? (
            <div className="pos-cash-gate open">
              <span className="cash-live-dot" />
              <div>
                <strong>Caja abierta</strong>
                <span>Turno activo en {cashStatus.branchName}</span>
              </div>
              <Link href="/caja">Ver caja</Link>
            </div>
          ) : (
            <div className="pos-cash-gate closed">
              <div>
                <strong>Debes abrir caja antes de vender</strong>
                <span>Abre un turno para registrar ventas.</span>
              </div>
              <Link href="/caja">Abrir caja</Link>
            </div>
          )
        ) : (
          <div className="pos-cash-gate open">
            <span className="cash-live-dot" />
            <div>
              <strong>Control de caja opcional</strong>
              <span>Puedes vender sin un turno de caja abierto.</span>
            </div>
            <Link href="/configuracion">Configuración</Link>
          </div>
        )}
        <PosFormV4
          warehouses={warehouses}
          catalog={catalog}
          customers={customers}
          initialExchangeCredit={exchangeCredit}
        />
      </div>
    </AppShell>
  );
}
