import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  FileText,
  MapPin,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  Smartphone,
  UserRound,
  Wrench,
} from "lucide-react";
import type { getDeviceDetail } from "./devices.repository";

type DeviceDetail = NonNullable<Awaited<ReturnType<typeof getDeviceDetail>>>;

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

function date(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "medium",
  }).format(new Date(value));
}

function money(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

function documentNumber(device: DeviceDetail) {
  const sale = device.sale;
  if (!sale) return "—";
  return sale.documentSeries && sale.documentNumber
    ? sale.documentSeries + "-" + sale.documentNumber
    : sale.saleNumber;
}

export function DeviceDetailView({ device }: { device: DeviceDetail }) {
  const identifier = device.identifiers.imei1
    ?? device.identifiers.serial
    ?? device.identifiers.imei2
    ?? "";
  const warrantyLabel = device.warranty.active
    ? "Garantía vigente"
    : device.warranty.expired
      ? "Garantía vencida"
      : "Sin garantía vigente";

  return (
    <div className="page-stack device-detail-page">
      <section className="page-heading device-detail-heading">
        <div>
          <Link href="/equipos" className="back-link">
            <ArrowLeft size={15} /> Volver a equipos
          </Link>
          <span className="eyebrow">TRAZABILIDAD POR IMEI</span>
          <h1>{device.product.name}</h1>
          <p>
            {device.product.brand} · {device.variant.label} · {STATUS_LABELS[device.status] ?? device.status}
          </p>
        </div>

        <div className="device-detail-actions">
          {device.sale && (
            <Link href={"/ventas/" + device.sale.id} className="secondary-button">
              <ReceiptText size={16} /> Ver venta
            </Link>
          )}
          {device.status === "SOLD" && (
            <Link
              href={"/devoluciones/nueva?unitId=" + encodeURIComponent(device.id)}
              className="secondary-button"
            >
              <RotateCcw size={16} />
              Devolver / cambiar
            </Link>
          )}
          {device.status === "SOLD" && identifier && (
            <Link
              href={"/servicio-tecnico/nuevo?unit=" + encodeURIComponent(identifier)}
              className="primary-button"
            >
              <Wrench size={16} />
              {device.warranty.active ? "Atender garantía" : "Nueva postventa"}
            </Link>
          )}
        </div>
      </section>

      <section className="device-detail-hero panel">
        <div className="device-detail-icon"><Smartphone size={34} /></div>
        <div className="device-detail-title">
          <span>Equipo individual</span>
          <strong>{identifier || "Sin identificador principal"}</strong>
          <small>{device.variant.sku ? "SKU " + device.variant.sku : "Sin SKU"}</small>
        </div>
        <div className={"device-warranty-state " + (device.warranty.active ? "active" : device.warranty.expired ? "expired" : "none")}>
          {device.warranty.active ? <ShieldCheck size={22} /> : <ShieldX size={22} />}
          <div>
            <span>{warrantyLabel}</span>
            <strong>{device.warranty.expiresAt ? "Hasta " + date(device.warranty.expiresAt) : "Sin fecha de vencimiento"}</strong>
          </div>
        </div>
      </section>

      <section className="device-detail-grid">
        <article className="panel device-detail-card">
          <div className="device-detail-card-title">
            <Smartphone size={17} />
            <strong>Identificación del equipo</strong>
          </div>
          <dl>
            <div><dt>IMEI 1</dt><dd><code>{device.identifiers.imei1 ?? "—"}</code></dd></div>
            <div><dt>IMEI 2</dt><dd><code>{device.identifiers.imei2 ?? "—"}</code></dd></div>
            <div><dt>Serie</dt><dd><code>{device.identifiers.serial ?? "—"}</code></dd></div>
            <div><dt>Modelo</dt><dd>{device.product.model ?? "—"}</dd></div>
            <div><dt>Variante</dt><dd>{device.variant.label}</dd></div>
            <div><dt>Categoría</dt><dd>{device.product.category}</dd></div>
          </dl>
        </article>

        <article className="panel device-detail-card">
          <div className="device-detail-card-title">
            <ShieldCheck size={17} />
            <strong>Garantía de la venta</strong>
          </div>
          <dl>
            <div><dt>Estado</dt><dd>{warrantyLabel}</dd></div>
            <div><dt>Plazo aplicado</dt><dd>{device.warranty.days > 0 ? device.warranty.days + " días" : "Sin plazo"}</dd></div>
            <div><dt>Inicio</dt><dd>{date(device.warranty.startsAt)}</dd></div>
            <div><dt>Vencimiento</dt><dd>{date(device.warranty.expiresAt)}</dd></div>
          </dl>
          <p className="device-warranty-note">
            El plazo mostrado corresponde a la garantía registrada al momento de vender este IMEI y no cambia si luego se modifica la configuración del producto.
          </p>
        </article>

        <article className="panel device-detail-card">
          <div className="device-detail-card-title">
            <UserRound size={17} />
            <strong>Cliente y venta</strong>
          </div>
          {device.sale ? (
            <dl>
              <div><dt>Cliente</dt><dd>{device.sale.customer?.name ?? "Consumidor final"}</dd></div>
              <div>
                <dt>Documento</dt>
                <dd>
                  {device.sale.customer?.documentNumber
                    ? (device.sale.customer.documentType ?? "Doc.") + " " + device.sale.customer.documentNumber
                    : "—"}
                </dd>
              </div>
              <div><dt>WhatsApp / teléfono</dt><dd>{device.sale.customer?.phone ?? "—"}</dd></div>
              <div><dt>Venta</dt><dd>{device.sale.saleNumber}</dd></div>
              <div><dt>Comprobante</dt><dd>{documentNumber(device)}</dd></div>
              <div><dt>Fecha de venta</dt><dd>{date(device.sale.soldAt)}</dd></div>
              <div><dt>Vendedor</dt><dd>{device.sale.seller}</dd></div>
            </dl>
          ) : (
            <div className="device-detail-empty">Este equipo todavía no tiene una venta asociada.</div>
          )}
        </article>

        <article className="panel device-detail-card">
          <div className="device-detail-card-title">
            <MapPin size={17} />
            <strong>Origen y ubicación</strong>
          </div>
          <dl>
            <div><dt>Sucursal</dt><dd>{device.location.branch}</dd></div>
            <div><dt>Almacén</dt><dd>{device.location.warehouse}</dd></div>
            <div><dt>Compra</dt><dd>{device.purchase?.number ?? "—"}</dd></div>
            <div><dt>Proveedor</dt><dd>{device.purchase?.supplier ?? "—"}</dd></div>
            <div><dt>Fecha compra</dt><dd>{device.purchase ? date(device.purchase.issueDate) : "—"}</dd></div>
            <div><dt>Costo</dt><dd>{device.purchase ? money(device.purchase.cost) : "—"}</dd></div>
          </dl>
        </article>
      </section>

      <section className="panel device-history-panel">
        <div className="panel-heading">
          <div>
            <h2>Historial de postventa</h2>
            <p>Atenciones de garantía y servicio técnico registradas para este IMEI.</p>
          </div>
          <CalendarClock size={20} />
        </div>

        {device.serviceOrders.length ? (
          <div className="device-service-history">
            {device.serviceOrders.map((order) => (
              <Link href={"/servicio-tecnico/" + order.id} key={order.id} className="device-service-row">
                <div className="device-service-icon">
                  {order.warrantyCovered ? <BadgeCheck size={17} /> : <Wrench size={17} />}
                </div>
                <div>
                  <strong>{order.serviceNumber}</strong>
                  <span>{order.reportedIssue}</span>
                </div>
                <div>
                  <span>{order.serviceType === "WARRANTY" ? "Garantía" : "Servicio técnico"}</span>
                  <small>{date(order.receivedAt)}</small>
                </div>
                <span className="status-badge">{order.status}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="device-detail-empty">
            <FileText size={20} />
            <strong>Sin atenciones registradas</strong>
            <span>Cuando el equipo ingrese por garantía o servicio técnico aparecerá aquí.</span>
          </div>
        )}
      </section>

      <section className="panel device-history-panel">
        <div className="panel-heading">
          <div>
            <h2>Devoluciones y cambios</h2>
            <p>Historial comercial del equipo y destino asignado al IMEI cuando regresó a tienda.</p>
          </div>
          <RotateCcw size={20} />
        </div>

        {device.returns.length ? (
          <div className="device-return-history">
            {device.returns.map((entry) => {
              const dispositionLabel = entry.disposition === "RESTOCK"
                ? "Apto para venta"
                : entry.disposition === "DAMAGED"
                  ? "Dañado / no vendible"
                  : "En revisión";
              return (
                <div className="device-return-row" key={entry.id}>
                  <div className="device-service-icon"><RotateCcw size={17} /></div>
                  <div>
                    <strong>{entry.returnNumber}</strong>
                    <span>{entry.reason}</span>
                  </div>
                  <div>
                    <span>{entry.type === "EXCHANGE" ? "Cambio" : "Devolución"}</span>
                    <small>{date(entry.createdAt)}</small>
                  </div>
                  <span className={"device-return-disposition " + entry.disposition.toLowerCase()}>
                    {dispositionLabel}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="device-detail-empty">
            <RotateCcw size={20} />
            <strong>Sin devoluciones ni cambios</strong>
            <span>Este IMEI no registra reingresos comerciales.</span>
          </div>
        )}
      </section>
    </div>
  );
}
