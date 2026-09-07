import Link from "next/link";
import { Eye, Plus, ReceiptText, Search, ShoppingBag, WalletCards } from "lucide-react";

const DOCUMENT_LABELS: Record<string, string> = {
  RECEIPT: "Boleta",
  INVOICE: "Factura",
  SALES_NOTE: "Nota de venta",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  COMPLETED: "Completada",
  CANCELLED: "Anulada",
  REFUNDED: "Devuelta",
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Crédito",
  OTHER: "Otro",
};

function money(value: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 }).format(value);
}

function limaDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SalesView({
  sales,
  summary,
  filters,
}: {
  sales: Array<{
    id: string;
    saleNumber: string;
    documentType: string;
    documentSeries: string | null;
    documentNumber: string | null;
    customer: string;
    total: number;
    status: string;
    itemCount: number;
    paymentMethods: string[];
    branch: string;
    warehouse: string;
    seller: string;
    createdAt: string;
  }>;
  summary: { todayTotal: number; todayCount: number; averageTicket: number; listed: number };
  filters: { q?: string; status?: string; documentType?: string };
}) {
  return (
    <div className="page-stack sales-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">VENTAS</span>
          <h1>Ventas</h1>
          <p>Consulta operaciones, comprobantes, clientes, pagos y equipos vendidos.</p>
        </div>
        <Link className="primary-button" href="/pos"><Plus size={17} /> Nueva venta</Link>
      </section>

      <section className="mobix-summary-grid four">
        <article><span className="summary-symbol">S/</span><span>Ventas de hoy</span><strong>{money(summary.todayTotal)}</strong></article>
        <article><ShoppingBag size={18} /><span>Operaciones hoy</span><strong>{summary.todayCount}</strong></article>
        <article><WalletCards size={18} /><span>Ticket promedio</span><strong>{money(summary.averageTicket)}</strong></article>
        <article><ReceiptText size={18} /><span>Resultados mostrados</span><strong>{summary.listed}</strong></article>
      </section>

      <section className="panel table-panel">
        <form className="table-toolbar" method="get">
          <div className="table-search"><Search size={17} /><input name="q" defaultValue={filters.q} placeholder="Venta, comprobante, DNI/RUC o cliente..." /></div>
          <div className="filters">
            <label className="filter-select"><span className="sr-only">Comprobante</span><select name="documentType" defaultValue={filters.documentType ?? ""}><option value="">Todos los comprobantes</option><option value="RECEIPT">Boleta</option><option value="INVOICE">Factura</option><option value="SALES_NOTE">Nota de venta</option></select></label>
            <label className="filter-select"><span className="sr-only">Estado</span><select name="status" defaultValue={filters.status ?? ""}><option value="">Todos los estados</option><option value="COMPLETED">Completada</option><option value="CANCELLED">Anulada</option><option value="REFUNDED">Devuelta</option></select></label>
            <button className="icon-button" type="submit" aria-label="Buscar"><Search size={16} /></button>
            {(filters.q || filters.status || filters.documentType) && <Link className="clear-filter" href="/ventas">Limpiar</Link>}
          </div>
        </form>

        <div className="table-wrap">
          <table className="data-table sales-table">
            <thead><tr><th>Venta</th><th>Fecha</th><th>Cliente</th><th>Comprobante</th><th>Pago</th><th className="right">Total</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td><div className="stacked-cell"><strong>{sale.saleNumber}</strong><span>{sale.itemCount} artículo{sale.itemCount === 1 ? "" : "s"} · {sale.branch}</span></div></td>
                  <td>{limaDate(sale.createdAt)}</td>
                  <td><div className="stacked-cell"><strong>{sale.customer}</strong><span>{sale.seller}</span></div></td>
                  <td><div className="stacked-cell"><strong>{DOCUMENT_LABELS[sale.documentType] ?? sale.documentType}</strong><span>{sale.documentSeries && sale.documentNumber ? `${sale.documentSeries}-${sale.documentNumber}` : "—"}</span></div></td>
                  <td>{sale.paymentMethods.map((method) => PAYMENT_LABELS[method] ?? method).join(" + ")}</td>
                  <td className="right"><strong>{money(sale.total)}</strong></td>
                  <td><span className={`status-badge sale-${sale.status.toLowerCase()}`}>{STATUS_LABELS[sale.status] ?? sale.status}</span></td>
                  <td className="right"><Link className="table-action-link" href={`/ventas/${sale.id}`}><Eye size={15} /> Detalle</Link></td>
                </tr>
              ))}
              {!sales.length && <tr><td colSpan={8}><div className="empty-table-state"><Search size={22} /><strong>No hay ventas para mostrar</strong><span>Registra una venta desde el Punto de Venta.</span></div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-footer"><span>{sales.length} venta{sales.length === 1 ? "" : "s"}</span><span>Hora y fecha mostradas en zona horaria de Perú (America/Lima).</span></div>
      </section>
    </div>
  );
}
