import Link from "next/link";
import { CheckCircle2, ChevronDown, FileText, Plus, Search, ShoppingBag } from "lucide-react";

function money(value: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value);
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmada",
  PARTIALLY_RECEIVED: "Recepción parcial",
  RECEIVED: "Recibida",
  CANCELLED: "Anulada",
};

export function PurchasesView({
  purchases,
  summary,
  filters,
  created,
  createdNumber,
}: {
  purchases: Array<{
    id: string;
    number: string;
    issueDate: string;
    supplier: string;
    supplierDocument: string;
    documentType: string;
    document: string;
    warehouse: string;
    branch: string;
    subtotal: number;
    tax: number;
    total: number;
    status: string;
    lines: number;
    serializedUnits: number;
    notes: string | null;
  }>;
  summary: { purchases: number; total: number; tax: number };
  filters: { q?: string; status?: string };
  created: boolean;
  createdNumber?: string;
}) {
  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">COMPRAS</span>
          <h1>Compras</h1>
          <p>Registra ingresos de mercadería, costos, comprobantes e IMEI de equipos.</p>
        </div>
        <Link href="/compras/nueva" className="primary-button"><Plus size={18} /> Nueva compra</Link>
      </section>

      {created && (
        <div className="success-banner">
          <CheckCircle2 size={18} />
          <div><strong>Compra registrada</strong><span>{createdNumber ? `Se creó ${createdNumber} y se actualizó el inventario.` : "El inventario y Kardex fueron actualizados."}</span></div>
        </div>
      )}

      <section className="mobix-summary-grid three">
        <article><ShoppingBag size={19} /><span>Compras registradas</span><strong>{summary.purchases}</strong></article>
        <article><FileText size={19} /><span>IGV registrado</span><strong>{money(summary.tax)}</strong></article>
        <article><span className="summary-symbol">S/</span><span>Total compras</span><strong>{money(summary.total)}</strong></article>
      </section>

      <section className="panel table-panel">
        <form className="table-toolbar" method="get">
          <div className="table-search"><Search size={17} /><input name="q" defaultValue={filters.q} placeholder="Buscar compra, proveedor, RUC o comprobante..." /></div>
          <div className="filters">
            <label className="filter-select"><span className="sr-only">Estado</span><select name="status" defaultValue={filters.status ?? ""}><option value="">Todos los estados</option><option value="RECEIVED">Recibidas</option><option value="DRAFT">Borradores</option><option value="CANCELLED">Anuladas</option></select><ChevronDown size={15} /></label>
            <button className="ghost-button" type="submit">Filtrar</button>
            {(filters.q || filters.status) && <Link className="clear-filter" href="/compras">Limpiar</Link>}
          </div>
        </form>

        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Compra</th><th>Proveedor</th><th>Comprobante</th><th>Destino</th><th className="right">Total</th><th>Estado</th></tr></thead>
            <tbody>
              {purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td><div className="stacked-cell"><strong>{purchase.number}</strong><span>{new Intl.DateTimeFormat("es-PE").format(new Date(purchase.issueDate))} · {purchase.lines} ítem(s){purchase.serializedUnits ? ` · ${purchase.serializedUnits} equipo(s)` : ""}</span></div></td>
                  <td><div className="stacked-cell"><strong>{purchase.supplier}</strong><span>{purchase.supplierDocument}</span></div></td>
                  <td><div className="stacked-cell"><strong>{purchase.document}</strong><span>{purchase.documentType}</span></div></td>
                  <td><div className="stacked-cell"><strong>{purchase.warehouse}</strong><span>{purchase.branch}</span></div></td>
                  <td className="right"><strong>{money(purchase.total)}</strong><div className="tiny-muted">IGV {money(purchase.tax)}</div></td>
                  <td><span className={`status-badge purchase-${purchase.status.toLowerCase()}`}>{STATUS_LABELS[purchase.status] ?? purchase.status}</span></td>
                </tr>
              ))}
              {!purchases.length && <tr><td colSpan={6}><div className="empty-table-state"><ShoppingBag size={22} /><strong>No hay compras para mostrar</strong><span>Registra la primera compra para ingresar stock e IMEI.</span></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
