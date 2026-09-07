"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BadgeCheck, CalendarClock, MessageCircle, Printer, Save, ShieldCheck, Smartphone, UserRound, Wrench } from "lucide-react";
import { updateServiceOrderAction } from "./service-actions";
import type { ServiceStatus } from "./service-types";

const STATUS_LABELS: Record<ServiceStatus, string> = {
  RECEIVED: "Recibido",
  DIAGNOSIS: "En diagnóstico",
  WAITING_APPROVAL: "Esperando aprobación",
  IN_REPAIR: "En reparación",
  READY: "Listo para entrega",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

function money(value: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 }).format(value || 0);
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function whatsappNumber(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return "";
  return digits.startsWith("51") ? digits : `51${digits}`;
}

export function ServiceDetailView({
  order,
  technicians,
  created,
}: {
  order: any;
  technicians: Array<{ id: string; name: string }>;
  created: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [status, setStatus] = useState<ServiceStatus>(order.status);
  const [technicianId, setTechnicianId] = useState(order.technicianId ?? "");
  const [diagnosis, setDiagnosis] = useState(order.diagnosis ?? "");
  const [workPerformed, setWorkPerformed] = useState(order.workPerformed ?? "");
  const [estimatedCost, setEstimatedCost] = useState(String(order.estimatedCost ?? 0));
  const [finalCost, setFinalCost] = useState(String(order.finalCost ?? 0));
  const [note, setNote] = useState("");
  const closed = ["DELIVERED", "CANCELLED"].includes(order.status);

  const phone = whatsappNumber(order.customer.phone);
  const message = encodeURIComponent(
    `Hola ${order.customer.name}. Estado de su equipo ${order.deviceName} (${order.serviceNumber}): ${STATUS_LABELS[order.status as ServiceStatus]}. ${order.identifier ? `${order.identifier}. ` : ""}${order.expectedAt ? `Entrega estimada: ${dateTime(order.expectedAt)}. ` : ""}MOBIX.`,
  );

  function save() {
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await updateServiceOrderAction({
          orderId: order.id,
          status,
          technicianId: technicianId || undefined,
          diagnosis,
          workPerformed,
          estimatedCost: Number(estimatedCost || 0),
          finalCost: Number(finalCost || 0),
          note,
        });
        setSuccess("Seguimiento actualizado correctamente.");
        setNote("");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo actualizar la atención.");
      }
    });
  }

  return (
    <div className="page-stack service-detail-page">
      <section className="page-heading service-detail-heading">
        <div>
          <Link href="/servicio-tecnico" className="back-link no-print"><ArrowLeft size={15} /> Volver a postventa</Link>
          <span className="eyebrow">{order.serviceType === "WARRANTY" ? "GARANTÍA" : "SERVICIO TÉCNICO"} · {order.serviceNumber}</span>
          <h1>{order.deviceName}</h1>
          <p>{order.identifier ?? "Sin IMEI/serie"} · Recibido {dateTime(order.receivedAt)}</p>
        </div>
        <div className="service-detail-actions no-print">
          <button className="secondary-button" type="button" onClick={() => window.print()}><Printer size={15} /> Imprimir ficha</button>
          {phone && <a className="secondary-button whatsapp-button" href={`https://wa.me/${phone}?text=${message}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>}
        </div>
      </section>

      {created && <div className="success-banner no-print"><BadgeCheck size={18} /><div><strong>Recepción registrada</strong><span>La orden {order.serviceNumber} quedó vinculada al cliente y al equipo.</span></div></div>}
      {error && <div className="error-banner no-print"><strong>No se pudo actualizar</strong><span>{error}</span></div>}
      {success && <div className="cash-success-banner no-print"><BadgeCheck size={17} /><span>{success}</span></div>}

      <section className="service-detail-summary">
        <article className="panel service-info-card"><span className="service-info-icon"><UserRound size={18} /></span><div><span>Cliente</span><strong>{order.customer.name}</strong><small>{order.customer.documentNumber ? `${order.customer.documentType} ${order.customer.documentNumber}` : "Sin documento"}</small>{order.customer.phone && <small>{order.customer.phone}</small>}</div></article>
        <article className="panel service-info-card"><span className="service-info-icon"><Smartphone size={18} /></span><div><span>Equipo</span><strong>{order.deviceName}</strong><small>{[order.brand, order.model].filter(Boolean).join(" · ") || "Sin detalle adicional"}</small><small>{order.identifier ?? "Sin identificador"}</small></div></article>
        <article className="panel service-info-card"><span className="service-info-icon"><CalendarClock size={18} /></span><div><span>Estado</span><strong>{STATUS_LABELS[order.status as ServiceStatus]}</strong><small>Entrega estimada: {dateTime(order.expectedAt)}</small>{order.technicianName && <small>Técnico: {order.technicianName}</small>}</div></article>
        <article className={`panel service-info-card ${order.warrantyCovered ? "warranty-card" : ""}`}><span className="service-info-icon"><ShieldCheck size={18} /></span><div><span>Cobertura</span><strong>{order.serviceType === "WARRANTY" ? "Garantía" : "Servicio particular"}</strong><small>{order.warrantyExpiresAt ? `Garantía hasta ${dateTime(order.warrantyExpiresAt)}` : "Sin garantía vinculada"}</small>{order.saleNumber && <small>Venta {order.saleNumber}</small>}</div></article>
      </section>

      <section className="service-detail-grid">
        <div className="service-main-column">
          <article className="panel service-case-card">
            <div className="section-title"><div><h2>Recepción del equipo</h2><p>Información registrada al momento del ingreso.</p></div><Smartphone size={19} /></div>
            <dl className="service-case-data">
              <div><dt>Falla reportada</dt><dd>{order.reportedIssue}</dd></div>
              <div><dt>Estado físico</dt><dd>{order.physicalCondition || "No especificado"}</dd></div>
              <div><dt>Accesorios</dt><dd>{order.accessories || "Ninguno registrado"}</dd></div>
            </dl>
          </article>

          <article className="panel service-timeline-card">
            <div className="section-title"><div><h2>Historial de seguimiento</h2><p>Bitácora completa de la atención.</p></div><Wrench size={19} /></div>
            <div className="service-timeline">
              {order.events.map((event: any) => <div className="service-timeline-item" key={event.id}><span className="timeline-dot" /><div><strong>{STATUS_LABELS[event.status as ServiceStatus] ?? event.status}</strong><span>{event.note || "Cambio de estado"}</span><small>{event.userName} · {dateTime(event.createdAt)}</small></div></div>)}
            </div>
          </article>
        </div>

        <aside className="panel service-update-card no-print">
          <div className="section-title"><div><h2>Actualizar atención</h2><p>Diagnóstico, reparación y entrega.</p></div><Save size={19} /></div>
          {closed ? (
            <div className="service-closed-state"><BadgeCheck size={25} /><strong>Atención cerrada</strong><span>Esta orden fue {order.status === "DELIVERED" ? "entregada al cliente" : "cancelada"} y ya no admite cambios.</span></div>
          ) : (
            <div className="service-field-stack">
              <label><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value as ServiceStatus)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>Técnico responsable</span><select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}><option value="">Sin asignar</option>{technicians.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
              <label><span>Diagnóstico</span><textarea rows={4} value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} placeholder="Resultado de la revisión técnica..." /></label>
              <label><span>Trabajo realizado</span><textarea rows={4} value={workPerformed} onChange={(event) => setWorkPerformed(event.target.value)} placeholder="Repuestos, reparación, pruebas realizadas..." /></label>
              <div className="service-cost-grid">
                <label><span>Costo estimado</span><div className="money-input"><span>S/</span><input type="number" min="0" step="0.01" value={estimatedCost} onChange={(event) => setEstimatedCost(event.target.value)} /></div></label>
                <label><span>Costo final</span><div className="money-input"><span>S/</span><input type="number" min="0" step="0.01" value={finalCost} onChange={(event) => setFinalCost(event.target.value)} /></div></label>
              </div>
              <label><span>Nota para el historial</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej. cliente aprobó presupuesto por WhatsApp..." /></label>
              <button className="primary-button wide" type="button" disabled={isPending} onClick={save}>{isPending ? "Guardando..." : "Guardar seguimiento"}</button>
            </div>
          )}
        </aside>
      </section>

      <section className="panel service-print-costs">
        <div><span>Presupuesto estimado</span><strong>{order.serviceType === "WARRANTY" ? "Cobertura de garantía" : money(order.estimatedCost)}</strong></div>
        <div><span>Importe final</span><strong>{order.serviceType === "WARRANTY" ? money(0) : money(order.finalCost)}</strong></div>
      </section>
    </div>
  );
}
