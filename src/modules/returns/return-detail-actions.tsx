"use client";

import { useState } from "react";
import { Download, MessageCircle, Printer, Repeat2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReturnReceiptData } from "./return-receipt-pdf";

function whatsappNumber(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return "";
  return digits.startsWith("51") ? digits : "51" + digits;
}

async function buildPdf(receipt: ReturnReceiptData) {
  const { buildReturnReceiptPdf } = await import("./return-receipt-pdf");
  return buildReturnReceiptPdf(receipt);
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

export function ReturnDetailActions({
  exchangeCreditId,
  exchangeBalance,
  receipt,
}: {
  exchangeCreditId?: string | null;
  exchangeBalance?: number;
  receipt: ReturnReceiptData;
}) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const canContinueExchange = Boolean(exchangeCreditId && Number(exchangeBalance || 0) > 0.01);

  const isExchange = receipt.type === "EXCHANGE";
  const operationLabel = isExchange ? "cambio" : "devolución";
  const companyName = receipt.company.tradeName || receipt.company.businessName;
  const customerName = receipt.customer?.name || "cliente";
  const phone = whatsappNumber(receipt.customer?.phone);

  const plainMessage = [
    "Hola " + customerName + " 👋",
    "",
    "Te enviamos la constancia de " + operationLabel + " " + receipt.returnNumber + " registrada en " + companyName + ".",
    "Venta original: " + receipt.sale.saleNumber + ".",
    isExchange && receipt.exchangeCredit
      ? "Valor reconocido: S/ " + receipt.exchangeCredit.originalAmount.toFixed(2) + "."
      : "Importe devuelto: S/ " + receipt.refund.amount.toFixed(2) + ".",
    "",
    "Adjuntamos la constancia completa en PDF para que puedas conservarla.",
  ].join("\n");

  function printReturn() {
    document.body.classList.add("print-return-detail");
    const cleanup = () => document.body.classList.remove("print-return-detail");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1200);
  }

  async function downloadPdf() {
    if (downloading) return;
    setDownloading(true);
    try {
      const file = await buildPdf(receipt);
      downloadFile(file);
    } catch (error) {
      console.error(error);
      window.alert("No se pudo generar la constancia PDF. Intenta nuevamente.");
    } finally {
      setDownloading(false);
    }
  }

  async function shareWhatsAppPdf() {
    if (sharing) return;
    setSharing(true);
    try {
      const file = await buildPdf(receipt);
      const canShareFiles =
        typeof navigator.share === "function"
        && typeof navigator.canShare === "function"
        && navigator.canShare({ files: [file] });

      if (canShareFiles) {
        await navigator.share({
          title: "Constancia " + receipt.returnNumber,
          text: plainMessage,
          files: [file],
        });
        return;
      }

      downloadFile(file);
      const encodedMessage = encodeURIComponent(plainMessage);
      const whatsappUrl = phone
        ? "https://wa.me/" + phone + "?text=" + encodedMessage
        : "https://wa.me/?text=" + encodedMessage;
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      window.alert(
        "MOBIX descargó la constancia PDF y abrió WhatsApp. Adjunta el PDF descargado antes de enviar.",
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
      window.alert("No se pudo preparar la constancia PDF. Intenta nuevamente.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="return-detail-actions no-print">
      {canContinueExchange && (
        <button
          className="primary-button"
          type="button"
          onClick={() => router.push("/pos?exchangeCredit=" + encodeURIComponent(exchangeCreditId!))}
        >
          <Repeat2 size={16} />
          Usar saldo en POS
        </button>
      )}

      <button className="secondary-button" type="button" onClick={printReturn}>
        <Printer size={16} />
        Imprimir A4
      </button>

      <button
        className="secondary-button"
        type="button"
        disabled={downloading}
        onClick={() => void downloadPdf()}
      >
        <Download size={16} />
        {downloading ? "Generando..." : "PDF"}
      </button>

      <button
        className="secondary-button whatsapp-button"
        type="button"
        disabled={sharing}
        onClick={() => void shareWhatsAppPdf()}
      >
        <MessageCircle size={16} />
        {sharing ? "Preparando..." : "WhatsApp PDF"}
      </button>
    </div>
  );
}
