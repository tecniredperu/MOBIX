"use client";

import { Printer, X } from "lucide-react";
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
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function ServiceTicketModal({ open, onClose, order }: { open: boolean; onClose: () => void; order: any }) {
  if (!open) return null;

  function printTicket() {
    document.body.classList.add("print-service-ticket");
    const cleanup = () => document.body.classList.remove("print-service-ticket");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1200);
  }

  return (
    <div className="service-ticket-modal" role="dialog" aria-modal="true" aria-label="Vista previa de ticket de servicio técnico">
      <button className="service-ticket-backdrop" type="button" aria-label="Cerrar ticket" onClick={onClose} />
      <section className="service-ticket-card">
        <div className="service-ticket-toolbar no-print">
          <div><strong>Ticket de recepción</strong><span>80 mm · {order.serviceNumber}</span></div>
          <div>
            <button className="secondary-button" type="button" onClick={printTicket}><Printer size={16} /> Imprimir ticket</button>
            <button className="service-ticket-close" type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
          </div>
        </div>
        <div className="service-ticket-scroll">
          <article className="service-ticket-paper">
            <header>
              <strong>MOBIX</strong>
              <span>Servicio técnico y postventa</span>
              <b>{order.serviceType === "WARRANTY" ? "GARANTÍA" : "SERVICIO TÉCNICO"}</b>
            </header>
            <div className="service-ticket-meta">
              <p><span>Orden</span><strong>{order.serviceNumber}</strong></p>
              <p><span>Recepción</span><strong>{dateTime(order.receivedAt)}</strong></p>
              <p><span>Estado</span><strong>{STATUS_LABELS[order.status as ServiceStatus] ?? order.status}</strong></p>
              <p><span>Cliente</span><strong>{order.customer.name}</strong></p>
              {order.customer.documentNumber && <p><span>Documento</span><strong>{order.customer.documentType} {order.customer.documentNumber}</strong></p>}
              {order.customer.phone && <p><span>Celular</span><strong>{order.customer.phone}</strong></p>}
            </div>
            <div className="service-ticket-device">
              <strong>{order.deviceName}</strong>
              <span>{[order.brand, order.model].filter(Boolean).join(" · ") || "Equipo recibido"}</span>
              {order.identifier && <code>{order.identifier}</code>}
            </div>
            <div className="service-ticket-section"><b>FALLA REPORTADA</b><p>{order.reportedIssue}</p></div>
            <div className="service-ticket-section"><b>ESTADO FÍSICO</b><p>{order.physicalCondition || "No especificado"}</p></div>
            <div className="service-ticket-section"><b>ACCESORIOS</b><p>{order.accessories || "Ninguno registrado"}</p></div>
            {order.diagnosis && <div className="service-ticket-section"><b>DIAGNÓSTICO</b><p>{order.diagnosis}</p></div>}
            <div className="service-ticket-meta service-ticket-bottom">
              <p><span>Entrega estimada</span><strong>{dateTime(order.expectedAt)}</strong></p>
              <p><span>Presupuesto</span><strong>{order.serviceType === "WARRANTY" ? "Cobertura de garantía" : money(order.estimatedCost)}</strong></p>
              {Number(order.finalCost || 0) > 0 && <p><span>Importe final</span><strong>{money(order.finalCost)}</strong></p>}
            </div>
            <div className="service-ticket-signatures"><span>Firma cliente</span><span>Recepción taller</span></div>
            <footer><strong>Conserve este ticket para recoger su equipo.</strong><span>Documento de control interno generado por MOBIX.</span></footer>
          </article>
        </div>
      </section>
    </div>
  );
}
