import Link from "next/link";
import { ArrowUpRight, CircleDollarSign, Plus, Search, UserRound, Users } from "lucide-react";

function money(value: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value || 0);
}

export function CustomersView({
  customers,
  summary,
  filters,
}: {
  customers: Array<{
    id: string;
    name: string;
    documentType: string | null;
    documentNumber: string | null;
    phone: string | null;
    email: string | null;
    status: string;
    salesCount: number;
    creditEnabled: boolean;
    creditLimit: number;
    creditDays: number;
    outstanding: number;
    overdue: number;
    availableCredit: number;
    updatedAt: string;
  }>;
  summary: { total: number; creditEnabled: number; outstanding: number; overdue: number };
  filters: { q?: string; credit?: string };
}) {
  return (
    <div className="page-stack customers-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">CLIENTES</span>
          <h1>Clientes y crédito</h1>
          <p>Historial comercial, líneas de crédito, cuentas por cobrar y cobranzas en un solo lugar.</p>
        </div>
        <Link className="primary-button" href="/clientes/nuevo"><Plus size={16} /> Nuevo cliente</Link>
      </section>

      <section className="customer-summary-grid">
        <article><span className="customer-summary-icon"><Users size={18} /></span><div><small>Clientes</small><strong>{summary.total}</strong><p>Registrados en MOBIX</p></div></article>
        <article><span className="customer-summary-icon"><UserRound size={18} /></span><div><small>Con crédito</small><strong>{summary.creditEnabled}</strong><p>Líneas habilitadas</p></div></article>
        <article><span className="customer-summary-icon"><CircleDollarSign size={18} /></span><div><small>Por cobrar</small><strong>{money(summary.outstanding)}</strong><p>Saldo pendiente total</p></div></article>
        <article className={summary.overdue > 0 ? "attention" : ""}><span className="customer-summary-icon"><CircleDollarSign size={18} /></span><div><small>Vencido</small><strong>{money(summary.overdue)}</strong><p>Cartera fuera de plazo</p></div></article>
      </section>

      <section className="panel customers-table-panel">
        <form className="customers-toolbar" method="get">
          <label className="customers-search"><Search size={17} /><input name="q" defaultValue={filters.q ?? ""} placeholder="Buscar cliente, DNI, RUC, celular..." /></label>
          <select name="credit" defaultValue={filters.credit ?? ""}>
            <option value="">Todos los clientes</option>
            <option value="enabled">Crédito habilitado</option>
            <option value="debt">Con deuda</option>
            <option value="overdue">Deuda vencida</option>
          </select>
          <button className="secondary-button" type="submit">Filtrar</button>
        </form>

        <div className="table-wrap">
          <table className="data-table customers-table">
            <thead><tr><th>Cliente</th><th>Contacto</th><th>Compras</th><th>Crédito</th><th>Deuda</th><th>Disponible</th><th></th></tr></thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <div className="customer-name-cell"><span>{customer.name.slice(0, 1).toUpperCase()}</span><div><strong>{customer.name}</strong><small>{customer.documentType && customer.documentNumber ? `${customer.documentType} · ${customer.documentNumber}` : "Sin documento"}</small></div></div>
                  </td>
                  <td><div className="stacked-cell"><span>{customer.phone ?? "—"}</span><small>{customer.email ?? "Sin correo"}</small></div></td>
                  <td><strong>{customer.salesCount}</strong></td>
                  <td>{customer.creditEnabled ? <span className="status-badge credit-enabled">{money(customer.creditLimit)} · {customer.creditDays}d</span> : <span className="status-badge credit-disabled">Sin crédito</span>}</td>
                  <td><div className="stacked-cell"><strong className={customer.overdue > 0 ? "debt-overdue" : ""}>{money(customer.outstanding)}</strong>{customer.overdue > 0 && <small className="debt-overdue">Vencido {money(customer.overdue)}</small>}</div></td>
                  <td><strong>{money(customer.availableCredit)}</strong></td>
                  <td className="right"><Link className="row-detail-link" href={`/clientes/${customer.id}`}>Detalle <ArrowUpRight size={14} /></Link></td>
                </tr>
              ))}
              {!customers.length && <tr><td colSpan={7}><div className="customers-empty"><UserRound size={24} /><strong>No hay clientes que coincidan</strong><span>Prueba con otro filtro o registra un nuevo cliente.</span></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
