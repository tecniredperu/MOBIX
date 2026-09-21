import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("A4 elimina del layout impreso todo excepto el comprobante", async () => {
  const css = await source("src/app/mobix-receipts.css");

  assert.ok(css.includes("@page sale-a4"));
  assert.ok(css.includes("size: A4 portrait"));
  assert.ok(css.includes(".sale-detail-page > :not(.sale-receipt-a4)"));
  assert.ok(css.includes("display: none !important"));
  assert.ok(css.includes("page: sale-a4"));
  assert.ok(css.includes("break-inside: avoid-page"));
});

test("ticket define página térmica de 80 mm y layout aislado", async () => {
  const receiptsCss = await source("src/app/mobix-receipts.css");
  const modalCss = await source("src/app/mobix-print-modals.css");

  assert.ok(receiptsCss.includes("@page mobix-ticket"));
  assert.ok(receiptsCss.includes("size: 80mm auto"));
  assert.ok(modalCss.includes("body.print-ticket-modal .sale-detail-page > :not(.sale-detail-heading)"));
  assert.ok(modalCss.includes("body.print-ticket-page .ticket-screen > :not(.ticket-page)"));
  assert.ok(modalCss.includes("width: 80mm !important"));
});

test("las clases de impresión permanecen activas hasta afterprint", async () => {
  const actions = await source("src/modules/sales/sale-detail-actions.tsx");
  const ticketModal = await source("src/modules/sales/sale-ticket-modal.tsx");

  assert.ok(actions.includes('window.addEventListener("afterprint", cleanup, { once: true })'));
  assert.ok(ticketModal.includes('window.addEventListener("afterprint", cleanup, { once: true })'));
  assert.equal(actions.includes("window.setTimeout(cleanup, 1200)"), false);
  assert.equal(ticketModal.includes("window.setTimeout(cleanup, 1200)"), false);
});

test("PDF de venta es A4 de una sola página e incluye datos de empresa", async () => {
  const pdf = await source("src/modules/sales/sale-receipt-pdf.ts");

  assert.ok(pdf.includes("/Count 1"));
  assert.ok(pdf.includes("const pageWidth = 595.28"));
  assert.ok(pdf.includes("const pageHeight = 841.89"));
  assert.ok(pdf.includes("loadLogo(ticket.company.logoUrl)"));
  assert.ok(pdf.includes("ticket.company.businessName"));
  assert.ok(pdf.includes("ticket.company.address"));
  assert.ok(pdf.includes("ticket.company.phone"));
  assert.ok(pdf.includes("ticket.company.email"));
  assert.ok(pdf.includes("ticket.payments"));
});

test("WhatsApp prioriza compartir el PDF completo y conserva fallback web", async () => {
  const actions = await source("src/modules/sales/sale-detail-actions.tsx");

  assert.ok(actions.includes("const file = await buildSaleReceiptPdf(ticket)"));
  assert.ok(actions.includes("files: [file]"));
  assert.ok(actions.includes("navigator.share"));
  assert.ok(actions.includes("downloadFile(file)"));
  assert.ok(actions.includes("https://wa.me/"));
});

test("ticket directo conserva información crítica del comprobante", async () => {
  const page = await source("src/app/ventas/[id]/ticket/page.tsx");

  assert.ok(page.includes('EXCHANGE_CREDIT: "Vale de cambio"'));
  assert.ok(page.includes('className="ticket-cancelled-stamp">ANULADO'));
  assert.ok(page.includes("Garantía hasta:"));
  assert.ok(page.includes("payment.reference"));
  assert.ok(page.includes('sale.status === "CANCELLED" ? "VENTA ANULADA"'));
});
