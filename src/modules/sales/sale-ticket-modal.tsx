"use client";

import { Printer, X } from "lucide-react";

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Crédito",
  OTHER: "Otro",
};

function money(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

function limaDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export type SaleTicketData = {
  saleNumber: string;
  documentSeries: string | null;
  documentNumber: string | null;
  createdAt: string;
  branch: string;
  customer: {
    name: string;
    documentType: string | null;
    documentNumber: string | null;
  } | null;
  items: Array<{
    id: string;
    product: string;
    variant: string;
    quantity: number;
    unitPrice: number;
    total: number;
    identifiers: Array<{ imei1: string | null; imei2: string | null; serial: string | null }>;
  }>;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payments: Array<{ id: string; method: string; amount: number }>;
};

export function SaleTicketModal({
  open,
  onClose,
  ticket,
}: {
  open: boolean;
  onClose: () => void;
  ticket: SaleTicketData;
}) {
  if (!open) return null;

  function printTicket() {
    document.body.classList.add("print-ticket-modal");
    const cleanup = () => document.body.classList.remove("print-ticket-modal");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1200);
  }

  const customer = ticket.customer?.name ?? "Consumidor final";

  return (
    <div className="ticket-modal" role="dialog" aria-modal="true" aria-label="Vista previa del ticket">
      <button className="ticket-modal-backdrop" type="button" aria-label="Cerrar ticket" onClick={onClose} />
      <section className="ticket-modal-card">
        <div className="ticket-modal-toolbar no-print">
          <div>
            <strong>Vista previa del ticket</strong>
            <span>80 mm · {ticket.saleNumber}</span>
          </div>
          <div>
            <button className="secondary-button" type="button" onClick={printTicket}><Printer size={16} /> Imprimir ticket</button>
            <button className="ticket-modal-close" type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
          </div>
        </div>

        <div className="ticket-modal-scroll">
          <div className="ticket-page">
            <header className="ticket-header">
              <strong>MOBIX</strong>
              <span>Gestión móvil</span>
              <p>{ticket.branch}</p>
            </header>
            <div className="ticket-meta">
              <span>Venta: {ticket.saleNumber}</span>
              {ticket.documentSeries && ticket.documentNumber && <span>{ticket.documentSeries}-{ticket.documentNumber}</span>}
              <span>{limaDate(ticket.createdAt)}</span>
              <span>Cliente: {customer}</span>
              {ticket.customer?.documentNumber && <span>{ticket.customer.documentType}: {ticket.customer.documentNumber}</span>}
            </div>
            <div className="ticket-items">
              {ticket.items.map((item) => (
                <div className="ticket-item" key={item.id}>
                  <strong>{item.product}</strong>
                  <span>{item.variant}</span>
                  {item.identifiers.map((identifier, index) => (
                    <span key={index}>
                      {identifier.imei1 ? `IMEI 1: ${identifier.imei1}` : identifier.serial ? `Serie: ${identifier.serial}` : ""}
                      {identifier.imei2 ? ` · IMEI 2: ${identifier.imei2}` : ""}
                    </span>
                  ))}
                  <div><span>{item.quantity} x {money(item.unitPrice)}</span><strong>{money(item.total)}</strong></div>
                </div>
              ))}
            </div>
            <div className="ticket-totals">
              <div><span>Valor venta</span><strong>{money(ticket.subtotal)}</strong></div>
              <div><span>IGV</span><strong>{money(ticket.tax)}</strong></div>
              {ticket.discount > 0 && <div><span>Descuento</span><strong>-{money(ticket.discount)}</strong></div>}
              <div className="ticket-total"><span>TOTAL</span><strong>{money(ticket.total)}</strong></div>
            </div>
            <div className="ticket-payments">
              {ticket.payments.map((payment) => (
                <div key={payment.id}><span>{PAYMENT_LABELS[payment.method] ?? payment.method}</span><strong>{money(payment.amount)}</strong></div>
              ))}
            </div>
            <footer className="ticket-footer">
              <strong>¡Gracias por tu compra!</strong>
              <span>Documento generado por MOBIX.</span>
              <small>La facturación electrónica SUNAT se habilitará en una etapa posterior.</small>
            </footer>
          </div>
        </div>
      </section>
    </div>
  );
}
