"use client";

import { useState } from "react";
import { Download, MessageCircle, Printer, X } from "lucide-react";
import type { CashCloseReportData, CashPaymentTotals } from "./cash-types";

async function buildPdf(report: CashCloseReportData) {
  const { buildCashClosePdf } = await import("./cash-close-pdf");
  return buildCashClosePdf(report);
}

const PAYMENT_LABELS: Array<{ key: keyof CashPaymentTotals; label: string }> = [
  { key: "CASH", label: "Efectivo" },
  { key: "YAPE", label: "Yape" },
  { key: "PLIN", label: "Plin" },
  { key: "CARD", label: "Tarjeta" },
  { key: "TRANSFER", label: "Transferencia" },
  { key: "CREDIT", label: "Crédito" },
  { key: "EXCHANGE_CREDIT", label: "Vale de cambio" },
  { key: "OTHER", label: "Otro" },
];

function money(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}



export function CashCloseReport({
  report,
  onClose,
}: {
  report: CashCloseReportData;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const balanced = Math.abs(report.difference) <= 0.01;

  function printReport() {
    document.body.classList.add("print-cash-report");
    const cleanup = () => document.body.classList.remove("print-cash-report");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1200);
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

  function buildMessage() {
    const breakdown = PAYMENT_LABELS
      .filter(({ key }) =>
        Math.abs(report.paymentTotals[key] || 0) > 0.001
        || Math.abs(report.refundTotals[key] || 0) > 0.001)
      .map(({ key, label }) => {
        const collected = report.paymentTotals[key] || 0;
        const refunded = report.refundTotals[key] || 0;
        const net = report.netPaymentTotals[key] || 0;
        return refunded > 0.001
          ? "• " + label + ": neto " + money(net) + " · cobrado " + money(collected) + " · devuelto " + money(refunded)
          : "• " + label + ": " + money(net);
      })
      .join("\n");

    const differenceLabel = balanced
      ? "Caja cuadrada"
      : report.difference > 0
        ? "Sobrante: " + money(report.difference)
        : "Faltante: " + money(Math.abs(report.difference));

    return [
      "*REPORTE DE CIERRE DE CAJA - MOBIX*",
      report.companyName,
      "Sucursal: " + report.branchName,
      "Responsable: " + report.userName,
      "Apertura: " + dateTime(report.openedAt),
      "Cierre: " + dateTime(report.closedAt),
      "",
      "Fondo inicial: " + money(report.openingAmount),
      "Ventas: " + money(report.salesTotal) + " (" + report.salesCount + " operación" + (report.salesCount === 1 ? "" : "es") + ")",
      breakdown ? "\n*Conciliación por medio*\n" + breakdown : "",
      "\nDevoluciones del turno: " + money(report.refundTotal),
      "Ingresos manuales: " + money(report.manualIncome),
      "Salidas manuales: " + money(report.manualOut),
      "Efectivo esperado: " + money(report.expectedAmount),
      "Efectivo contado: " + money(report.actualAmount),
      "Resultado: " + differenceLabel,
      report.closingNotes?.trim() ? "Observación: " + report.closingNotes.trim() : "",
    ].filter(Boolean).join("\n");
  }

  async function downloadPdf() {
    if (downloading) return;
    setDownloading(true);
    try {
      const file = await buildPdf(report);
      downloadFile(file);
    } catch (error) {
      console.error(error);
      window.alert("No se pudo generar el PDF del cierre.");
    } finally {
      setDownloading(false);
    }
  }

  async function shareWhatsApp() {
    if (sharing) return;
    setSharing(true);
    try {
      const file = await buildPdf(report);
      const message = buildMessage();
      const canShareFiles =
        typeof navigator.share === "function"
        && typeof navigator.canShare === "function"
        && navigator.canShare({ files: [file] });

      if (canShareFiles) {
        await navigator.share({
          title: "Cierre de caja " + report.branchName,
          text: message,
          files: [file],
        });
        return;
      }

      downloadFile(file);
      window.open("https://wa.me/?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
      window.alert("MOBIX descargó el PDF del cierre y abrió WhatsApp. Adjunta el archivo descargado antes de enviar.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
      window.alert("No se pudo preparar el cierre de caja para compartir.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="cash-close-report-modal" role="dialog" aria-modal="true" aria-label="Reporte de cierre de caja">
      <button className="cash-report-backdrop" type="button" aria-label="Cerrar reporte" onClick={onClose} />
      <section className="cash-report-card">
        <div className="cash-report-toolbar no-print">
          <div>
            <strong>Caja cerrada</strong>
            <span>Reporte del turno listo para entregar</span>
          </div>
          <div className="cash-report-actions">
            <button className="secondary-button" type="button" onClick={printReport}><Printer size={16} /> Imprimir</button>
            <button className="secondary-button" type="button" disabled={downloading} onClick={() => void downloadPdf()}><Download size={16} /> {downloading ? "Generando..." : "PDF"}</button>
            <button className="secondary-button whatsapp-button" type="button" disabled={sharing} onClick={() => void shareWhatsApp()}><MessageCircle size={16} /> {sharing ? "Preparando..." : "WhatsApp PDF"}</button>
            <button className="cash-report-close" type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
          </div>
        </div>

        <div className="cash-report-scroll">
          <div className="cash-report-sheet">
            <header className="cash-report-header">
              <span className="cash-report-brand">MOBIX</span>
              <strong>Reporte de cierre de caja</strong>
              <small>{report.companyName}</small>
            </header>

            <div className="cash-report-meta">
              <div><span>Sucursal</span><strong>{report.branchName}</strong></div>
              <div><span>Responsable</span><strong>{report.userName}</strong></div>
              <div><span>Apertura</span><strong>{dateTime(report.openedAt)}</strong></div>
              <div><span>Cierre</span><strong>{dateTime(report.closedAt)}</strong></div>
            </div>

            <div className="cash-report-kpis">
              <article><span>Fondo inicial</span><strong>{money(report.openingAmount)}</strong></article>
              <article><span>Ventas del turno</span><strong>{money(report.salesTotal)}</strong><small>{report.salesCount} operación{report.salesCount === 1 ? "" : "es"}</small></article>
              <article><span>Devoluciones</span><strong>{money(report.refundTotal)}</strong><small>Todos los medios</small></article>
              <article><span>Efectivo esperado</span><strong>{money(report.expectedAmount)}</strong></article>
              <article><span>Efectivo contado</span><strong>{money(report.actualAmount)}</strong></article>
            </div>

            <section className="cash-report-section">
              <div className="cash-report-section-title"><strong>Conciliación por medio de pago</strong><span>Cobros menos devoluciones del turno</span></div>
              <div className="cash-report-payment-grid">
                {PAYMENT_LABELS.map(({ key, label }) => (
                  <div key={key}>
                    <span>{label}</span>
                    <strong>{money(report.netPaymentTotals[key])}</strong>
                    <small>
                      Cobrado {money(report.paymentTotals[key])}
                      {report.refundTotals[key] > 0.001 ? " · Devuelto " + money(report.refundTotals[key]) : ""}
                    </small>
                  </div>
                ))}
              </div>
            </section>

            <section className="cash-report-section">
              <div className="cash-report-row"><span>Ingresos manuales</span><strong>+ {money(report.manualIncome)}</strong></div>
              <div className="cash-report-row"><span>Salidas manuales / retiros</span><strong>- {money(report.manualOut)}</strong></div>
            </section>

            <div className={`cash-report-result ${balanced ? "balanced" : report.difference > 0 ? "positive" : "negative"}`}>
              <div><span>Resultado del arqueo</span><strong>{balanced ? "Caja cuadrada" : report.difference > 0 ? "Sobrante" : "Faltante"}</strong></div>
              <strong>{report.difference > 0 ? "+" : ""}{money(report.difference)}</strong>
            </div>

            {report.closingNotes?.trim() && (
              <div className="cash-report-notes"><span>Observación de cierre</span><p>{report.closingNotes}</p></div>
            )}

            <footer className="cash-report-footer">
              <span>Reporte generado por MOBIX</span>
              <span>ID de caja: {report.sessionId}</span>
            </footer>
          </div>
        </div>
      </section>
    </div>
  );
}
