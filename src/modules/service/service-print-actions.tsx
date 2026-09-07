"use client";

import { useState } from "react";
import { MessageCircle, Printer, Receipt } from "lucide-react";
import { ServiceTicketModal } from "./service-ticket-modal";
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

function whatsappNumber(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return "";
  return digits.startsWith("51") ? digits : `51${digits}`;
}

function ServicePrintCopy({ order, copyLabel }: { order: any; copyLabel: "CLIENTE" | "TALLER" }) {
  return (
    <article className="service-a4-copy">
      <header className="service-a4-header">
        <div><strong>MOBIX</strong><span>Servicio técnico y postventa</span></div>
        <div className="service-a4-title"><b>FICHA DE RECEPCIÓN</b><span>{copyLabel}</span></div>
        <div className="service-a4-number"><small>Orden</small><strong>{order.serviceNumber}</strong></div>
      </header>

      <div className="service-a4-meta-grid">
        <div><span>Fecha de recepción</span><strong>{dateTime(order.receivedAt)}</strong></div>
        <div><span>Tipo de atención</span><strong>{order.serviceType === "WARRANTY" ? "Garantía" : "Servicio técnico"}</strong></div>
        <div><span>Estado</span><strong>{STATUS_LABELS[order.status as ServiceStatus] ?? order.status}</strong></div>
        <div><span>Entrega estimada</span><strong>{dateTime(order.expectedAt)}</strong></div>
      </div>

      <div className="service-a4-two-cols">
        <section>
          <h4>CLIENTE</h4>
          <p><span>Nombre</span><strong>{order.customer.name}</strong></p>
          <p><span>Documento</span><strong>{order.customer.documentNumber ? `${order.customer.documentType} ${order.customer.documentNumber}` : "Sin documento"}</strong></p>
          <p><span>Celular</span><strong>{order.customer.phone || "—"}</strong></p>
        </section>
        <section>
          <h4>EQUIPO</h4>
          <p><span>Equipo</span><strong>{order.deviceName}</strong></p>
          <p><span>Marca / modelo</span><strong>{[order.brand, order.model].filter(Boolean).join(" · ") || "—"}</strong></p>
          <p><span>IMEI / serie</span><strong>{order.identifier || "—"}</strong></p>
        </section>
      </div>

      <div className="service-a4-details">
        <section><h4>FALLA REPORTADA</h4><p>{order.reportedIssue}</p></section>
        <section><h4>ESTADO FÍSICO AL RECIBIR</h4><p>{order.physicalCondition || "No especificado"}</p></section>
        <section><h4>ACCESORIOS ENTREGADOS</h4><p>{order.accessories || "Ninguno registrado"}</p></section>
        {order.diagnosis && <section><h4>DIAGNÓSTICO</h4><p>{order.diagnosis}</p></section>}
      </div>

      <div className="service-a4-cost-row">
        <div><span>Presupuesto</span><strong>{order.serviceType === "WARRANTY" ? "Cobertura de garantía" : money(order.estimatedCost)}</strong></div>
        <div><span>Importe final</span><strong>{order.serviceType === "WARRANTY" ? money(0) : money(order.finalCost)}</strong></div>
        {order.technicianName && <div><span>Técnico</span><strong>{order.technicianName}</strong></div>}
      </div>

      <div className="service-a4-signatures">
        <div><span>Firma del cliente</span></div>
        <div><span>Recepción / Taller</span></div>
      </div>
      <footer>El cliente declara haber entregado el equipo en las condiciones descritas. Conserve su copia para el recojo.</footer>
    </article>
  );
}

export function ServicePrintActions({ order }: { order: any }) {
  const [ticketOpen, setTicketOpen] = useState(false);
  const phone = whatsappNumber(order.customer.phone);
  const message = encodeURIComponent(
    `Hola ${order.customer.name}. Estado de su equipo ${order.deviceName} (${order.serviceNumber}): ${STATUS_LABELS[order.status as ServiceStatus]}. ${order.identifier ? `${order.identifier}. ` : ""}${order.expectedAt ? `Entrega estimada: ${dateTime(order.expectedAt)}. ` : ""}MOBIX.`,
  );

  function printA4() {
    document.body.classList.add("print-service-a4");
    const cleanup = () => document.body.classList.remove("print-service-a4");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1200);
  }

  return (
    <>
      <div className="service-detail-actions no-print">
        <button className="secondary-button" type="button" onClick={printA4}><Printer size={15} /> A4 · 2 copias</button>
        <button className="secondary-button" type="button" onClick={() => setTicketOpen(true)}><Receipt size={15} /> Ticket 80 mm</button>
        {phone && <a className="secondary-button whatsapp-button" href={`https://wa.me/${phone}?text=${message}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>}
      </div>

      <div className="service-a4-print-sheet" aria-hidden="true">
        <ServicePrintCopy order={order} copyLabel="CLIENTE" />
        <div className="service-a4-cut"><span>✂</span><i /></div>
        <ServicePrintCopy order={order} copyLabel="TALLER" />
      </div>

      <ServiceTicketModal open={ticketOpen} onClose={() => setTicketOpen(false)} order={order} />
    </>
  );
}
