import Link from "next/link";

type AuditItem = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
};

type AuditData = {
  items: AuditItem[];
  filters: { q: string; action: string; entity: string; userId: string };
  options: {
    actions: string[];
    entities: string[];
    users: Array<{ id: string; name: string; email: string }>;
  };
  pagination: { page: number; pageSize: number; total: number; pages: number };
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Creación",
  UPDATE: "Actualización",
  CANCEL: "Anulación",
  ACTIVATE: "Activación",
  DEACTIVATE: "Desactivación",
  LOGIN: "Inicio de sesión",
  LOGOUT: "Cierre de sesión",
};

const ENTITY_LABELS: Record<string, string> = {
  AUTH_SESSION: "Sesión",
  USER: "Usuario",
  USER_PASSWORD: "Contraseña de usuario",
  ROLE: "Rol",
  SALE: "Venta",
  CASH_SESSION: "Caja",
  CASH_MOVEMENT: "Movimiento de caja",
  RETURN_ORDER: "Devolución / cambio",
  EXCHANGE_CREDIT: "Vale de cambio",
  RECEIVABLE_PAYMENT: "Abono de crédito",
  CUSTOMER: "Cliente",
  CUSTOMER_CREDIT: "Línea de crédito",
  PRODUCT: "Producto",
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

function pretty(value: unknown) {
  if (value == null) return "—";
  return JSON.stringify(value, null, 2);
}

function pageHref(data: AuditData, page: number) {
  const params = new URLSearchParams();
  if (data.filters.q) params.set("q", data.filters.q);
  if (data.filters.action) params.set("action", data.filters.action);
  if (data.filters.entity) params.set("entity", data.filters.entity);
  if (data.filters.userId) params.set("userId", data.filters.userId);
  params.set("page", String(page));
  return "/administracion/auditoria?" + params.toString();
}

export function AuditView({ data }: { data: AuditData }) {
  return (
    <div className="page-stack audit-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN</span>
          <h1>Auditoría</h1>
          <p>Historial de accesos, cambios y operaciones sensibles registradas por MOBIX.</p>
        </div>
        <div className="audit-total-chip">
          <strong>{data.pagination.total}</strong>
          <span>eventos encontrados</span>
        </div>
      </section>

      <form className="panel audit-filters" method="get">
        <label>
          <span>Buscar</span>
          <input
            name="q"
            defaultValue={data.filters.q}
            placeholder="Usuario, entidad o ID"
          />
        </label>
        <label>
          <span>Acción</span>
          <select name="action" defaultValue={data.filters.action}>
            <option value="">Todas</option>
            {data.options.actions.map((action) => (
              <option value={action} key={action}>
                {ACTION_LABELS[action] ?? action}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Entidad</span>
          <select name="entity" defaultValue={data.filters.entity}>
            <option value="">Todas</option>
            {data.options.entities.map((entity) => (
              <option value={entity} key={entity}>
                {ENTITY_LABELS[entity] ?? entity}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Usuario</span>
          <select name="userId" defaultValue={data.filters.userId}>
            <option value="">Todos</option>
            {data.options.users.map((user) => (
              <option value={user.id} key={user.id}>
                {user.name} · {user.email}
              </option>
            ))}
          </select>
        </label>
        <div className="audit-filter-actions">
          <button className="primary-button" type="submit">Filtrar</button>
          <Link className="secondary-button" href="/administracion/auditoria">Limpiar</Link>
        </div>
      </form>

      <section className="panel audit-table-panel">
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>Origen</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td className="audit-date">{dateTime(item.createdAt)}</td>
                  <td>
                    <strong>{item.user?.name ?? "Sistema"}</strong>
                    <small>{item.user?.email ?? "Sin usuario asociado"}</small>
                  </td>
                  <td>
                    <span className={"audit-action audit-action-" + item.action.toLowerCase()}>
                      {ACTION_LABELS[item.action] ?? item.action}
                    </span>
                  </td>
                  <td>
                    <strong>{ENTITY_LABELS[item.entity] ?? item.entity}</strong>
                    <small>{item.entityId ?? "—"}</small>
                  </td>
                  <td>
                    <span>{item.ipAddress ?? "—"}</span>
                  </td>
                  <td>
                    <details className="audit-details">
                      <summary>Ver cambios</summary>
                      <div className="audit-change-grid">
                        <div>
                          <strong>Antes</strong>
                          <pre>{pretty(item.oldValues)}</pre>
                        </div>
                        <div>
                          <strong>Después</strong>
                          <pre>{pretty(item.newValues)}</pre>
                        </div>
                        {item.userAgent && (
                          <div className="audit-agent">
                            <strong>Navegador / agente</strong>
                            <p>{item.userAgent}</p>
                          </div>
                        )}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
              {!data.items.length && (
                <tr>
                  <td colSpan={6} className="audit-empty">
                    No hay eventos que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="audit-pagination">
          <span>
            Página {data.pagination.page} de {data.pagination.pages}
          </span>
          <div>
            {data.pagination.page > 1 && (
              <Link className="secondary-button" href={pageHref(data, data.pagination.page - 1)}>
                Anterior
              </Link>
            )}
            {data.pagination.page < data.pagination.pages && (
              <Link className="secondary-button" href={pageHref(data, data.pagination.page + 1)}>
                Siguiente
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
