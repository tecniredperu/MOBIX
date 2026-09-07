import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/business-context";
import { getPosCashStatus } from "@/modules/cash/pos-cash-status";
import { PosFormV3 } from "@/modules/sales/pos-form-v3";
import { getPosContext } from "@/modules/sales/sales.repository";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  await requirePermission("sales.create");
  const [{ warehouses, catalog, customers }, cashStatus] = await Promise.all([
    getPosContext(),
    getPosCashStatus(),
  ]);

  return (
    <AppShell>
      <div className="pos-page-shell">
        {cashStatus ? (
          <div className="pos-cash-gate open">
            <span className="cash-live-dot" />
            <div><strong>Caja abierta</strong><span>Turno activo en {cashStatus.branchName}. Las ventas quedarán incluidas en este arqueo.</span></div>
            <Link href="/caja">Ver caja</Link>
          </div>
        ) : (
          <div className="pos-cash-gate closed">
            <div><strong>Debes abrir caja antes de vender</strong><span>MOBIX no confirmará ventas fuera de un turno de caja para evitar descuadres.</span></div>
            <Link href="/caja">Abrir caja</Link>
          </div>
        )}
        <PosFormV3 warehouses={warehouses} catalog={catalog} customers={customers} />
      </div>
    </AppShell>
  );
}
