"use client";

import { MessageCircle, Printer, X } from "lucide-react";
import type { CashPaymentTotals } from "./cash-types";

const PAYMENT_LABELS: Array<{ key: keyof CashPaymentTotals; label: string }> = [
  { key: "CASH", label: "Efectivo" },
  { key: "YAPE", label: "Yape" },
  { key: "PLIN", label: "Plin" },
  { key: "CARD", label: "Tarjeta" },
  { key: "TRANSFER", label: "Transferencia" },
  { key: "CREDIT", label: "Crédito" },
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

export type CashCloseReportData = {
  sessionId: string;
  companyName: string;
  branchName: string;
  userName: string;
  openedAt: string;
  closedAt: string;
  openingAmount: number;
  salesCount: number;
  salesTotal: number;
  paymentTotals: CashPaymentTotals;
  manualIncome: number;
  manualOut: number;
  expectedAmount: number;
  actualAmount: number;
  difference: number;
  closingNotes?: string;
};

export function CashCloseReport({
  report,
  onClose,
}: {
  report: CashCloseReportData;
  onClose: () => void;
}) {
  const balanced = Math.abs(report.difference) <= 0.01;

  function printReport() {
    document.body.classList.add("print-cash-report");
    const cleanup = () => document.body.classList.remove("print-cash-report");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1200);
  }

  function shareWhatsApp() {
    const breakdown = PAYMENT_LABELS
      .filter(({ key }) => Math.abs(report.paymentTotals[key] || 0) > 0.001)
      .map(({ key, label }) => `• ${label}: ${money(report.paymentTotals[key])}`)
      .join("\n");

    const differenceLabel = balanced
      ? "Caja cuadrada"
      : report.difference > 0
        ? `Sobrante: ${money(report.difference)}`
        : `Faltante: ${money(Math.abs(report.difference))}`;

    const message = [
      `*REPORTE DE CIERRE DE CAJA - MOBIX*`,
      report.companyName,
      `Sucursal: ${report.branchName}`,
      `Vendedor: ${report.userName}`,
      `Apertura: ${dateTime(report.openedAt)}`,
      `Cierre: ${dateTime(report.closedAt)}`,
      "",
      `Fondo inicial: ${money(report.openingAmount)}`,
      `Ventas: ${money(report.salesTotal)} (${report.salesCount} operación${report.salesCount === 1 ? "" : "es"})`,
      breakdown ? `\n*Ventas/cobros por medio*\n${breakdown}` : "",
      `\nIngresos manuales: ${money(report.manualIncome)}`,
      `Salidas manuales: ${money(report.manualOut)}`,
      `Efectivo esperado: ${money(report.expectedAmount)}`,
      `Efectivo contado: ${money(report.actualAmount)}`,
      `Resultado: ${differenceLabel}`,
      report.closingNotes?.trim() ? `Observación: ${report.closingNotes.trim()}` : "",
    ].filter(Boolean).join("\n");

    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
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
            <button className="secondary-button whatsapp-button" type="button" onClick={shareWhatsApp}><MessageCircle size={16} /> WhatsApp</button>
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
              <article><span>Efectivo esperado</span><strong>{money(report.expectedAmount)}</strong></article>
              <article><span>Efectivo contado</span><strong>{money(report.actualAmount)}</strong></article>
            </div>

            <section className="cash-report-section">
              <div className="cash-report-section-title"><strong>Resumen por medio de pago</strong><span>Ventas y cobranzas registradas durante el turno</span></div>
              <div className="cash-report-payment-grid">
                {PAYMENT_LABELS.map(({ key, label }) => (
                  <div key={key}><span>{label}</span><strong>{money(report.paymentTotals[key])}</strong></div>
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
