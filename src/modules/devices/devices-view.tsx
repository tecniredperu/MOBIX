import Link from "next/link";
import { ChevronDown, Search, Smartphone, ShieldCheck, Wrench } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Disponible",
  RESERVED: "Reservado",
  SOLD: "Vendido",
  IN_TRANSFER: "En transferencia",
  WARRANTY: "En garantía",
  TECHNICAL_SERVICE: "Servicio técnico",
  RETURNED: "Devuelto",
  DAMAGED: "Dañado",
  LOST: "Perdido",
  INACTIVE: "Inactivo",
};

function money(value: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value);
}

export function DevicesView({
  items,
  warehouses,
  summary,
  filters,
}: {
  items: Array<{
    id: string;
    product: string;
    model: string | null;
    brand: string;
    variant: string;
    sku: string | null;
    imei1: string;
    imei2: string;
    serial: string;
    warehouse: string;
    branch: string;
    cost: number;
    status: string;
    supplier: string;
    purchaseNumber: string;
    createdAt: string;
  }>;
  warehouses: Array<{ id: string; name: string; branchName: string }>;
  summary: { total: number; available: number; sold: number; service: number };
  filters: { q?: string; status?: string; warehouseId?: string };
}) {
  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">INVENTARIO</span>
          <h1>Equipos / IMEI</h1>
          <p>Trazabilidad individual de celulares y equipos serializados por IMEI y número de serie.</p>
        </div>
        <Link href="/compras/nueva" className="primary-button">Ingresar equipos</Link>
      </section>

      <section className="mobix-summary-grid four">
        <article><Smartphone size={19} /><span>Equipos registrados</span><strong>{summary.total}</strong></article>
        <article><ShieldCheck size={19} /><span>Disponibles</span><strong>{summary.available}</strong></article>
        <article><span className="summary-symbol">✓</span><span>Vendidos</span><strong>{summary.sold}</strong></article>
        <article><Wrench size={19} /><span>Garantía / servicio</span><strong>{summary.service}</strong></article>
      </section>

      <section className="panel table-panel">
        <form className="table-toolbar" method="get">
          <div className="table-search"><Search size={17} /><input name="q" defaultValue={filters.q} placeholder="Buscar IMEI, serie, producto, modelo o SKU..." /></div>
          <div className="filters">
            <label className="filter-select"><span className="sr-only">Almacén</span><select name="warehouseId" defaultValue={filters.warehouseId ?? ""}><option value="">Todos los almacenes</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.branchName} · {warehouse.name}</option>)}</select><ChevronDown size={15} /></label>
            <label className="filter-select"><span className="sr-only">Estado</span><select name="status" defaultValue={filters.status ?? ""}><option value="">Todos los estados</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={15} /></label>
            <button className="ghost-button" type="submit">Filtrar</button>
            {(filters.q || filters.status || filters.warehouseId) && <Link href="/equipos" className="clear-filter">Limpiar</Link>}
          </div>
        </form>

        <div className="table-wrap">
          <table className="data-table devices-table">
            <thead><tr><th>Equipo</th><th>IMEI / Serie</th><th>Ubicación</th><th>Compra</th><th className="right">Costo</th><th>Estado</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><div className="product-cell"><div className="product-thumb">{item.product.slice(0, 1).toUpperCase()}</div><div><strong>{item.product}</strong><span>{item.brand} · {item.variant}</span></div></div></td>
                  <td><div className="identifier-stack"><span><b>IMEI 1</b> <code>{item.imei1}</code></span><span><b>IMEI 2</b> <code>{item.imei2}</code></span><span><b>Serie</b> <code>{item.serial}</code></span></div></td>
                  <td><div className="stacked-cell"><strong>{item.warehouse}</strong><span>{item.branch}</span></div></td>
                  <td><div className="stacked-cell"><strong>{item.purchaseNumber}</strong><span>{item.supplier}</span></div></td>
                  <td className="right"><strong>{money(item.cost)}</strong></td>
                  <td><span className={`status-badge device-${item.status.toLowerCase()}`}>{STATUS_LABELS[item.status] ?? item.status}</span></td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={6}><div className="empty-table-state"><Smartphone size={22} /><strong>No encontramos equipos</strong><span>Registra una compra con celulares o cambia los filtros.</span></div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-footer"><span>{items.length} equipo(s) mostrado(s)</span><span>Los IMEI son únicos por empresa y no pueden reutilizarse.</span></div>
      </section>
    </div>
  );
}
