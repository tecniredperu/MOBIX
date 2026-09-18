"use client";

import { useState } from "react";
import { Download, MessageCircle, Printer, Receipt } from "lucide-react";
import { ServiceTicketModal } from "./service-ticket-modal";
import {
  buildServiceReceiptPdf,
  type ServiceReceiptData,
} from "./service-receipt-pdf";
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
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function whatsappNumber(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return "";
  return digits.startsWith("51") ? digits : "51" + digits;
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

type Company = ServiceReceiptData["company"];

function ServicePrintCopy({
  order,
  company,
  copyLabel,
}: {
  order: any;
  company: Company;
  copyLabel: "CLIENTE" | "TALLER";
}) {
  const companyName = company.tradeName || company.businessName;

  return (
    <article className="service-a4-copy">
      <header className="service-a4-header">
        <div className="service-a4-company">
          {company.logoUrl && <img src={company.logoUrl} alt={"Logo de " + companyName} />}
          <div>
            <strong>{companyName}</strong>
            {company.ruc && <span>RUC {company.ruc}</span>}
            {company.address && <span>{company.address}</span>}
          </div>
        </div>
        <div className="service-a4-title">
          <b>FICHA DE RECEPCIÓN</b>
          <span>{copyLabel}</span>
        </div>
        <div className="service-a4-number">
          <small>Orden</small>
          <strong>{order.serviceNumber}</strong>
        </div>
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
      <footer>
        El cliente declara haber entregado el equipo en las condiciones descritas. Conserve su copia para el recojo.
      </footer>
    </article>
  );
}

export function ServicePrintActions({
  order,
  company,
}: {
  order: any;
  company: Company;
}) {
  const [ticketOpen, setTicketOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);

  const companyName = company.tradeName || company.businessName;
  const phone = whatsappNumber(order.customer.phone);
  const receipt: ServiceReceiptData = {
    company,
    serviceNumber: order.serviceNumber,
    serviceType: order.serviceType,
    status: order.status,
    receivedAt: order.receivedAt,
    expectedAt: order.expectedAt,
    deviceName: order.deviceName,
    brand: order.brand,
    model: order.model,
    identifier: order.identifier,
    reportedIssue: order.reportedIssue,
    physicalCondition: order.physicalCondition,
    accessories: order.accessories,
    diagnosis: order.diagnosis,
    technicianName: order.technicianName,
    estimatedCost: Number(order.estimatedCost || 0),
    finalCost: Number(order.finalCost || 0),
    customer: {
      name: order.customer.name,
      documentType: order.customer.documentType,
      documentNumber: order.customer.documentNumber,
      phone: order.customer.phone,
    },
  };

  const plainMessage = [
    "Hola " + order.customer.name + " 👋",
    "",
    "Te enviamos la ficha de recepción " + order.serviceNumber + " de " + companyName + ".",
    "Equipo: " + order.deviceName + (order.identifier ? " · " + order.identifier : "") + ".",
    "Estado actual: " + (STATUS_LABELS[order.status as ServiceStatus] ?? order.status) + ".",
    order.expectedAt ? "Entrega estimada: " + dateTime(order.expectedAt) + "." : "",
    "",
    "Adjuntamos la ficha completa en PDF para que puedas conservarla.",
  ].filter(Boolean).join("\n");

  function printA4() {
    document.body.classList.add("print-service-a4");
    const cleanup = () => document.body.classList.remove("print-service-a4");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1200);
  }

  async function downloadPdf() {
    if (downloading) return;
    setDownloading(true);
    try {
      const file = await buildServiceReceiptPdf(receipt);
      downloadFile(file);
    } catch (error) {
      console.error(error);
      window.alert("No se pudo generar la ficha PDF. Intenta nuevamente.");
    } finally {
      setDownloading(false);
    }
  }

  async function shareWhatsAppPdf() {
    if (sharing) return;
    setSharing(true);
    try {
      const file = await buildServiceReceiptPdf(receipt);
      const canShareFiles =
        typeof navigator.share === "function"
        && typeof navigator.canShare === "function"
        && navigator.canShare({ files: [file] });

      if (canShareFiles) {
        await navigator.share({
          title: "Servicio " + order.serviceNumber,
          text: plainMessage,
          files: [file],
        });
        return;
      }

      downloadFile(file);
      const encoded = encodeURIComponent(plainMessage);
      const url = phone
        ? "https://wa.me/" + phone + "?text=" + encoded
        : "https://wa.me/?text=" + encoded;
      window.open(url, "_blank", "noopener,noreferrer");
      window.alert(
        "MOBIX descargó la ficha PDF y abrió WhatsApp. Adjunta el archivo descargado antes de enviar.",
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
      window.alert("No se pudo preparar la ficha PDF. Intenta nuevamente.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <div className="service-detail-actions no-print">
        <button className="secondary-button" type="button" onClick={printA4}>
          <Printer size={15} /> A4 · 2 copias
        </button>
        <button className="secondary-button" type="button" onClick={() => setTicketOpen(true)}>
          <Receipt size={15} /> Ticket 80 mm
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={downloading}
          onClick={() => void downloadPdf()}
        >
          <Download size={15} /> {downloading ? "Generando..." : "PDF"}
        </button>
        <button
          className="secondary-button whatsapp-button"
          type="button"
          disabled={sharing}
          onClick={() => void shareWhatsAppPdf()}
        >
          <MessageCircle size={15} /> {sharing ? "Preparando..." : "WhatsApp PDF"}
        </button>
      </div>

      <div className="service-a4-print-sheet" aria-hidden="true">
        <ServicePrintCopy order={order} company={company} copyLabel="CLIENTE" />
        <div className="service-a4-cut"><span>✂</span><i /></div>
        <ServicePrintCopy order={order} company={company} copyLabel="TALLER" />
      </div>

      <ServiceTicketModal
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
        order={order}
        company={company}
      />
    </>
  );
}
