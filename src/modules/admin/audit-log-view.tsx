import Link from "next/link";
import { History, ShieldCheck } from "lucide-react";

type AuditItem = {
  id: string;
  createdAt: string;
  userName: string;
  userEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ipAddress: string | null;
  oldValues: unknown;
  newValues: unknown;
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function compactJson(value: unknown) {
  if (value == null) return "—";
  const text = JSON.stringify(value);
  return text.length > 260 ? text.slice(0, 260) + "…" : text;
}

export function AuditLogView({ items }: { items: AuditItem[] }) {
  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN</span>
          <h1>Auditoría</h1>
          <p>Registro de las acciones recientes realizadas dentro de la empresa.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="secondary-button" href="/administracion/usuarios">
            Usuarios
          </Link>
          <Link className="secondary-button" href="/administracion/roles">
            Roles
          </Link>
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Eventos recientes</h2>
            <p>Se muestran hasta {items.length} eventos. Los campos sensibles se ocultan automáticamente.</p>
          </div>
          <History size={19} />
        </div>

        {items.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center" }}>
            <ShieldCheck size={28} />
            <p>Aún no existen eventos de auditoría.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr>
                  {["Fecha", "Usuario", "Acción", "Entidad", "IP", "Antes", "Después"].map((label) => (
                    <th
                      key={label}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        borderBottom: "1px solid var(--border, #e5e7eb)",
                        fontSize: 12,
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ padding: "10px 12px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                      {dateTime(item.createdAt)}
                    </td>
                    <td style={{ padding: "10px 12px", verticalAlign: "top" }}>
                      <strong>{item.userName}</strong>
                      {item.userEmail && <div style={{ fontSize: 12, opacity: 0.7 }}>{item.userEmail}</div>}
                    </td>
                    <td style={{ padding: "10px 12px", verticalAlign: "top" }}>{item.action}</td>
                    <td style={{ padding: "10px 12px", verticalAlign: "top" }}>
                      <strong>{item.entity}</strong>
                      {item.entityId && <div style={{ fontSize: 11, opacity: 0.65 }}>{item.entityId}</div>}
                    </td>
                    <td style={{ padding: "10px 12px", verticalAlign: "top" }}>{item.ipAddress ?? "—"}</td>
                    <td style={{ padding: "10px 12px", verticalAlign: "top", fontSize: 11, maxWidth: 280 }}>
                      {compactJson(item.oldValues)}
                    </td>
                    <td style={{ padding: "10px 12px", verticalAlign: "top", fontSize: 11, maxWidth: 280 }}>
                      {compactJson(item.newValues)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
