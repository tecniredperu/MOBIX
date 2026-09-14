"use client";

import { useState } from "react";
import { MessageCircle, Printer, Receipt } from "lucide-react";
import { buildSaleReceiptPdf } from "./sale-receipt-pdf";
import { SaleTicketModal, type SaleTicketData } from "./sale-ticket-modal";

function whatsappNumber(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return "";
  return digits.startsWith("51") ? digits : `51${digits}`;
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

export function SaleDetailActions({
  saleNumber,
  customerName,
  customerPhone,
  total,
  ticket,
}: {
  saleNumber: string;
  customerName: string;
  customerPhone?: string | null;
  total: number;
  ticket: SaleTicketData;
}) {
  const [ticketOpen, setTicketOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const phone = whatsappNumber(customerPhone);
  const companyName = ticket.company.tradeName || ticket.company.businessName;
  const documentNumber = ticket.documentSeries && ticket.documentNumber
    ? `${ticket.documentSeries}-${ticket.documentNumber}`
    : saleNumber;
  const plainMessage = `Hola ${customerName}. Gracias por tu compra en ${companyName}. Adjunto tu comprobante ${documentNumber} por S/ ${total.toFixed(2)}.`;
  const message = encodeURIComponent(plainMessage);

  function printA4() {
    document.body.classList.add("print-sale-a4");
    const cleanup = () => document.body.classList.remove("print-sale-a4");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1200);
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
          title: `Comprobante ${documentNumber}`,
          text: plainMessage,
          files: [file],
        });
        return;
      }

      downloadFile(file);
      const whatsappUrl = phone
        ? `https://wa.me/${phone}?text=${message}`
        : `https://wa.me/?text=${message}`;
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      window.alert("El PDF del comprobante se descargó. Este navegador no permite adjuntar archivos automáticamente a WhatsApp; adjunta el PDF descargado en el chat que se acaba de abrir.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
      window.alert("No se pudo preparar el comprobante PDF. Intenta nuevamente.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <div className="sale-detail-actions no-print">
        <button className="secondary-button" type="button" onClick={printA4}><Printer size={16} /> Imprimir A4</button>
        <button className="secondary-button" type="button" onClick={() => setTicketOpen(true)}><Receipt size={16} /> Ticket 80 mm</button>
        <button className="secondary-button whatsapp-button" type="button" onClick={shareWhatsAppPdf} disabled={sharing}>
          <MessageCircle size={16} /> {sharing ? "Preparando PDF..." : "WhatsApp PDF"}
        </button>
      </div>
      <SaleTicketModal open={ticketOpen} onClose={() => setTicketOpen(false)} ticket={ticket} />
    </>
  );
}

export function PrintTicketButton() {
  return <button className="primary-button ticket-print-button no-print" type="button" onClick={() => window.print()}><Printer size={16} /> Imprimir ticket</button>;
}
