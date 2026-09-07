import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, History, Search } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  PURCHASE: "Compra",
  SALE: "Venta",
  TRANSFER_IN: "Transferencia entrada",
  TRANSFER_OUT: "Transferencia salida",
  RETURN_IN: "Devolución entrada",
  RETURN_OUT: "Devolución salida",
  ADJUSTMENT_IN: "Ajuste entrada",
  ADJUSTMENT_OUT: "Ajuste salida",
  WARRANTY_IN: "Garantía entrada",
  WARRANTY_OUT: "Garantía salida",
};

function money(value: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value);
}

export function KardexView({ items, warehouses, summary, filters }: {
  items: Array<{
    id: string;
    date: string;
    product: string;
    brand: string;
    variant: string;
    movementType: string;
    direction: string;
    quantity: number;
    unitCost: number;
    warehouse: string;
    branch: string;
    imei: string | null;
    referenceType: string | null;
    referenceId: string | null;
    notes: string | null;
    user: string;
  }>;
  warehouses: Array<{ id: string; name: string; branchName: string }>;
  summary: { movements: number; entries: number; exits: number; value: number };
  filters: { q?: string; movementType?: string; warehouseId?: string };
}) {
  return (
    <div className="page-stack">
      <section className="page-heading"><div><span className="eyebrow">INVENTARIO</span><h1>Kardex</h1><p>Historial de entradas y salidas con trazabilidad por producto, almacén e IMEI.</p></div></section>

      <section className="mobix-summary-grid four">
        <article><History size={19} /><span>Movimientos mostrados</span><strong>{summary.movements}</strong></article>
        <article><ArrowDownLeft size={19} /><span>Entradas</span><strong>{summary.entries}</strong></article>
        <article><ArrowUpRight size={19} /><span>Salidas</span><strong>{summary.exits}</strong></article>
        <article><span className="summary-symbol">S/</span><span>Impacto valorizado</span><strong>{money(summary.value)}</strong></article>
      </section>

      <section className="panel table-panel">
        <form className="table-toolbar" method="get">
          <div className="table-search"><Search size={17} /><input name="q" defaultValue={filters.q} placeholder="Buscar producto, IMEI, SKU o referencia..." /></div>
          <div className="filters">
            <label className="filter-select"><span className="sr-only">Movimiento</span><select name="movementType" defaultValue={filters.movementType ?? ""}><option value="">Todos los movimientos</option>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={15} /></label>
            <label className="filter-select"><span className="sr-only">Almacén</span><select name="warehouseId" defaultValue={filters.warehouseId ?? ""}><option value="">Todos los almacenes</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.branchName} · {warehouse.name}</option>)}</select><ChevronDown size={15} /></label>
            <button className="ghost-button" type="submit">Filtrar</button>
            {(filters.q || filters.movementType || filters.warehouseId) && <Link href="/kardex" className="clear-filter">Limpiar</Link>}
          </div>
        </form>

        <div className="table-wrap">
          <table className="data-table kardex-table">
            <thead><tr><th>Fecha</th><th>Movimiento</th><th>Producto</th><th>IMEI / Serie</th><th>Almacén</th><th className="right">Cantidad</th><th className="right">Costo</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><div className="stacked-cell"><strong>{new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Lima" }).format(new Date(item.date))}</strong><span>{item.user}</span></div></td>
                  <td><span className={`movement-badge ${item.direction.toLowerCase()}`}>{item.direction === "IN" ? <ArrowDownLeft size={14} /> : item.direction === "OUT" ? <ArrowUpRight size={14} /> : null}{TYPE_LABELS[item.movementType] ?? item.movementType}</span></td>
                  <td><div className="stacked-cell"><strong>{item.product}</strong><span>{item.brand} · {item.variant}</span></div></td>
                  <td>{item.imei ? <code className="imei-code">{item.imei}</code> : <span className="tiny-muted">Por cantidad</span>}</td>
                  <td><div className="stacked-cell"><strong>{item.warehouse}</strong><span>{item.branch}</span></div></td>
                  <td className={`right movement-qty ${item.direction.toLowerCase()}`}><strong>{item.direction === "OUT" ? "-" : item.direction === "IN" ? "+" : ""}{item.quantity}</strong></td>
                  <td className="right"><strong>{money(item.unitCost)}</strong></td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={7}><div className="empty-table-state"><History size={22} /><strong>No hay movimientos</strong><span>Las compras, ventas, transferencias y ajustes aparecerán aquí.</span></div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-footer"><span>Mostrando hasta 200 movimientos recientes</span><span>El Kardex no se elimina: las anulaciones se compensan con movimientos inversos.</span></div>
      </section>
    </div>
  );
}
