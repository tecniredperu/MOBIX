"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  FileDown,
  MessageCircle,
  Printer,
  Receipt,
  ShoppingCart,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { buildSaleReceiptPdf } from "./sale-receipt-pdf";
import { SaleTicketModal, type SaleTicketData } from "./sale-ticket-modal";

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

function money(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

export function SaleDetailActions({
  saleNumber,
  customerName,
  customerPhone,
  total,
  ticket,
  created = false,
  change = 0,
}: {
  saleNumber: string;
  customerName: string;
  customerPhone?: string | null;
  total: number;
  ticket: SaleTicketData;
  created?: boolean;
  change?: number;
}) {
  const router = useRouter();
  const [ticketOpen, setTicketOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(created);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const phone = whatsappNumber(customerPhone);
  const companyName = ticket.company.tradeName || ticket.company.businessName;
  const documentNumber = ticket.documentSeries && ticket.documentNumber
    ? ticket.documentSeries + "-" + ticket.documentNumber
    : saleNumber;
  const greetingName = customerName?.trim() || "cliente";
  const plainMessage = [
    "Hola " + greetingName + " 👋",
    "",
    "Muchas gracias por tu compra en " + companyName + ".",
    "Tu comprobante N.° " + documentNumber + " corresponde a un total de S/ " + total.toFixed(2) + ".",
    "",
    "Adjuntamos tu comprobante en PDF para que puedas conservarlo.",
    "¡Gracias por tu preferencia! Esperamos atenderte nuevamente.",
  ].join("\n");
  const message = encodeURIComponent(plainMessage);

  useEffect(() => {
    if (!completionOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCompletionOpen(false);
      if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
        const active = document.activeElement;
        const isInteractive = active instanceof HTMLButtonElement
          || active instanceof HTMLInputElement
          || active instanceof HTMLSelectElement
          || active instanceof HTMLTextAreaElement;
        if (!isInteractive) router.push("/pos");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [completionOpen, router]);

  function printA4() {
    setCompletionOpen(false);
    window.setTimeout(() => {
      document.body.classList.add("print-sale-a4");
      const cleanup = () => document.body.classList.remove("print-sale-a4");
      window.addEventListener("afterprint", cleanup, { once: true });
      window.print();
      window.setTimeout(cleanup, 1200);
    }, 120);
  }

  function openTicket() {
    setCompletionOpen(false);
    window.setTimeout(() => setTicketOpen(true), 80);
  }

  async function downloadPdf() {
    if (downloading) return;
    setDownloading(true);
    try {
      const file = await buildSaleReceiptPdf(ticket);
      downloadFile(file);
    } catch (error) {
      console.error(error);
      window.alert("No se pudo generar el comprobante PDF. Intenta nuevamente.");
    } finally {
      setDownloading(false);
    }
  }

  async function shareWhatsAppPdf() {
    if (sharing) return;
    setSharing(true);
    try {
      const file = await buildSaleReceiptPdf(ticket);
      const canShareFiles = typeof navigator.share === "function"
        && typeof navigator.canShare === "function"
        && navigator.canShare({ files: [file] });

      if (canShareFiles) {
        await navigator.share({
          title: "Comprobante " + documentNumber,
          text: plainMessage,
          files: [file],
        });
        return;
      }

      downloadFile(file);
      const whatsappUrl = phone
        ? "https://wa.me/" + phone + "?text=" + message
        : "https://wa.me/?text=" + message;
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      window.alert(
        "MOBIX preparó y descargó el PDF completo del comprobante. WhatsApp Web no permite adjuntar archivos automáticamente desde el navegador; adjunta el PDF descargado antes de enviar.",
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
      window.alert("No se pudo preparar el comprobante PDF. Intenta nuevamente.");
    } finally {
      setSharing(false);
    }
  }

  function newSale() {
    setCompletionOpen(false);
    router.push("/pos");
  }

  return (
    <>
      <div className="sale-detail-actions no-print">
        <button className="secondary-button" type="button" onClick={printA4}>
          <Printer size={16} /> Imprimir A4
        </button>
        <button className="secondary-button" type="button" onClick={openTicket}>
          <Receipt size={16} /> Ticket 80 mm
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void downloadPdf()}
          disabled={downloading}
        >
          <FileDown size={16} /> {downloading ? "Generando..." : "Descargar PDF"}
        </button>
        <button
          className="secondary-button whatsapp-button"
          type="button"
          onClick={() => void shareWhatsAppPdf()}
          disabled={sharing}
        >
          <MessageCircle size={16} /> {sharing ? "Preparando PDF..." : "WhatsApp PDF"}
        </button>
      </div>

      {completionOpen && (
        <div
          className="sale-completion-modal no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sale-completion-title"
        >
          <button
            className="sale-completion-backdrop"
            type="button"
            aria-label="Cerrar resumen de venta"
            onClick={() => setCompletionOpen(false)}
          />
          <section className="sale-completion-card">
            <button
              className="sale-completion-close"
              type="button"
              onClick={() => setCompletionOpen(false)}
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>

            <div className="sale-completion-check">
              <BadgeCheck size={34} />
            </div>

            <div className="sale-completion-heading">
              <span>VENTA COMPLETADA</span>
              <h2 id="sale-completion-title">Venta registrada correctamente</h2>
              <p>Stock, IMEI/serie, pagos, caja, Kardex y auditoría fueron actualizados.</p>
            </div>

            <div className="sale-completion-summary">
              <div>
                <span>Comprobante</span>
                <strong>{documentNumber}</strong>
              </div>
              <div>
                <span>Total cobrado</span>
                <strong>{money(total)}</strong>
              </div>
              {change > 0.009 && (
                <div className="sale-completion-change">
                  <span><Banknote size={14} /> Vuelto al cliente</span>
                  <strong>{money(change)}</strong>
                </div>
              )}
            </div>

            <div className="sale-completion-actions">
              <button className="sale-completion-action" type="button" onClick={openTicket}>
                <Receipt size={19} />
                <span><strong>Ticket</strong><small>Imprimir 80 mm</small></span>
              </button>
              <button className="sale-completion-action" type="button" onClick={printA4}>
                <Printer size={19} />
                <span><strong>A4</strong><small>Imprimir comprobante</small></span>
              </button>
              <button
                className="sale-completion-action"
                type="button"
                onClick={() => void downloadPdf()}
                disabled={downloading}
              >
                <FileDown size={19} />
                <span><strong>PDF</strong><small>{downloading ? "Generando..." : "Guardar comprobante"}</small></span>
              </button>
              <button
                className="sale-completion-action whatsapp"
                type="button"
                onClick={() => void shareWhatsAppPdf()}
                disabled={sharing}
              >
                <MessageCircle size={19} />
                <span><strong>WhatsApp</strong><small>{sharing ? "Preparando..." : "Enviar PDF"}</small></span>
              </button>
            </div>

            <button className="primary-button sale-completion-new" type="button" onClick={newSale}>
              <ShoppingCart size={18} />
              Nueva venta
              <kbd>Enter</kbd>
            </button>

            <button
              className="sale-completion-view"
              type="button"
              onClick={() => setCompletionOpen(false)}
            >
              Ver detalle de la venta
            </button>
          </section>
        </div>
      )}

      <SaleTicketModal
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
        ticket={ticket}
      />
    </>
  );
}

export function PrintTicketButton() {
  return (
    <button
      className="primary-button ticket-print-button no-print"
      type="button"
      onClick={() => window.print()}
    >
      <Printer size={16} /> Imprimir ticket
    </button>
  );
}
