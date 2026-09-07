import Link from "next/link";
import { ArrowUpRight, Clock3, Search, ShieldCheck, Wrench, CheckCircle2 } from "lucide-react";
import type { ServiceListItem } from "./service-types";

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Recibido",
  DIAGNOSIS: "Diagnóstico",
  WAITING_APPROVAL: "Espera aprobación",
  IN_REPAIR: "En reparación",
  READY: "Listo para entrega",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

function date(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "short" }).format(new Date(value));
}

function money(value: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value || 0);
}

export function ServiceListView({
  items,
  summary,
  filters,
}: {
  items: ServiceListItem[];
  summary: { active: number; warranty: number; repairing: number; ready: number };
  filters: { q?: string; status?: string; type?: string };
}) {
  const stats = [
    { label: "Atenciones activas", value: summary.active, icon: Clock3 },
    { label: "Garantías", value: summary.warranty, icon: ShieldCheck },
    { label: "En reparación", value: summary.repairing, icon: Wrench },
    { label: "Listos para entregar", value: summary.ready, icon: CheckCircle2 },
  ];

  return (
    <div className="page-stack service-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">POSTVENTA</span>
          <h1>Garantías y servicio técnico</h1>
          <p>Controla cada equipo desde la recepción hasta la entrega, con trazabilidad por IMEI.</p>
        </div>
        <Link className="primary-button" href="/servicio-tecnico/nuevo">Nueva atención <ArrowUpRight size={16} /></Link>
      </section>

      <section className="stat-grid service-stats">
        {stats.map(({ label, value, icon: Icon }) => (
          <article className="stat-card" key={label}>
            <div className="stat-icon"><Icon size={18} /></div>
            <p>{label}</p><strong>{value}</strong><span>Órdenes registradas</span>
          </article>
        ))}
      </section>

      <section className="panel table-panel">
        <div className="panel-heading service-filter-heading">
          <div><h2>Órdenes de postventa</h2><p>Busca por número, cliente, equipo o IMEI.</p></div>
          <form className="service-filters">
            <label className="search-box"><Search size={15} /><input name="q" defaultValue={filters.q} placeholder="Buscar..." /></label>
            <select name="type" defaultValue={filters.type ?? ""}>
              <option value="">Todos los tipos</option>
              <option value="WARRANTY">Garantía</option>
              <option value="TECHNICAL_SERVICE">Servicio técnico</option>
            </select>
            <select name="status" defaultValue={filters.status ?? ""}>
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button className="secondary-button" type="submit">Filtrar</button>
          </form>
        </div>
        <div className="table-wrap">
          <table className="data-table service-table">
            <thead><tr><th>Orden</th><th>Cliente</th><th>Equipo / IMEI</th><th>Tipo</th><th>Estado</th><th>Técnico</th><th>Entrega estimada</th><th className="right">Importe</th><th /></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.serviceNumber}</strong><span className="table-sub">{date(item.receivedAt)}</span></td>
                  <td><strong>{item.customerName}</strong>{item.customerPhone && <span className="table-sub">{item.customerPhone}</span>}</td>
                  <td><strong>{item.deviceName}</strong><span className="table-sub service-identifier">{item.identifier ?? "Sin identificador"}</span></td>
                  <td><span className={`service-type-badge ${item.serviceType === "WARRANTY" ? "warranty" : "technical"}`}>{item.serviceType === "WARRANTY" ? "Garantía" : "Servicio técnico"}</span></td>
                  <td><span className={`service-status ${item.status.toLowerCase()}`}>{STATUS_LABELS[item.status] ?? item.status}</span></td>
                  <td>{item.technicianName ?? "Sin asignar"}</td>
                  <td>{date(item.expectedAt)}</td>
                  <td className="right"><strong>{money(item.finalCost || item.estimatedCost)}</strong></td>
                  <td className="right"><Link className="table-action-link" href={`/servicio-tecnico/${item.id}`}>Detalle <ArrowUpRight size={13} /></Link></td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={9}><div className="empty-table-state"><Wrench size={23} /><strong>No hay órdenes con estos filtros</strong><span>Registra una nueva atención o cambia los filtros.</span></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
