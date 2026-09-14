"use client";

import type { SaleTicketData } from "./sale-ticket-modal";

const DOCUMENT_LABELS: Record<string, string> = {
  RECEIPT: "BOLETA DE VENTA",
  INVOICE: "FACTURA",
  SALES_NOTE: "NOTA DE VENTA",
};

const TAX_LABELS: Record<string, string> = {
  TAXED: "Gravado",
  EXEMPT: "Exonerado",
  UNAFFECTED: "Inafecto",
};

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

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = words[0];
  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${line} ${words[index]}`;
    if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = words[index];
    }
  }
  lines.push(line);
  return lines;
}

function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const lines = wrapText(ctx, text, maxWidth);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

async function loadLogo(url?: string | null) {
  if (!url) return null;
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function drawLogo(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.drawImage(image, x, y, width, height);
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("No se pudo generar la imagen del comprobante."));
    }, "image/jpeg", 0.94);
  });
}

function concatBytes(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function jpegToPdf(jpeg: Uint8Array, imageWidth: number, imageHeight: number) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const pushText = (value: string) => {
    const bytes = encoder.encode(value);
    chunks.push(bytes);
    length += bytes.length;
  };
  const pushBytes = (value: Uint8Array) => {
    chunks.push(value);
    length += value.length;
  };
  const object = (number: number, body: string) => {
    offsets[number] = length;
    pushText(`${number} 0 obj\n${body}\nendobj\n`);
  };

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const scale = Math.min(pageWidth / imageWidth, pageHeight / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const drawX = (pageWidth - drawWidth) / 2;
  const drawY = (pageHeight - drawHeight) / 2;
  const content = `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Im0 Do\nQ\n`;
  const contentBytes = encoder.encode(content);

  pushText("%PDF-1.4\n% MOBIX receipt\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);

  offsets[4] = length;
  pushText(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  pushBytes(jpeg);
  pushText("\nendstream\nendobj\n");

  offsets[5] = length;
  pushText(`5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
  pushBytes(contentBytes);
  pushText("endstream\nendobj\n");

  const xrefOffset = length;
  pushText("xref\n0 6\n0000000000 65535 f \n");
  for (let index = 1; index <= 5; index += 1) {
    pushText(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob([concatBytes(chunks)], { type: "application/pdf" });
}

function identifierText(item: SaleTicketData["items"][number]) {
  return item.identifiers.flatMap((identifier) => {
    const parts: string[] = [];
    if (identifier.imei1) parts.push(`IMEI 1: ${identifier.imei1}`);
    if (identifier.imei2) parts.push(`IMEI 2: ${identifier.imei2}`);
    if (identifier.serial) parts.push(`Serie: ${identifier.serial}`);
    return parts;
  });
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-");
}

export async function buildSaleReceiptPdf(ticket: SaleTicketData) {
  const estimatedRows = ticket.items.reduce((sum, item) => sum + 90 + identifierText(item).length * 28, 0);
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = Math.max(1754, 1120 + estimatedRows);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no permite generar el comprobante PDF.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111827";
  ctx.textBaseline = "top";

  const margin = 72;
  const right = canvas.width - margin;
  const logo = await loadLogo(ticket.company.logoUrl);
  const companyName = ticket.company.tradeName || ticket.company.businessName;
  const documentLabel = DOCUMENT_LABELS[ticket.documentType] ?? ticket.documentType;
  const documentNumber = ticket.documentSeries && ticket.documentNumber
    ? `${ticket.documentSeries}-${ticket.documentNumber}`
    : ticket.saleNumber;

  if (logo) drawLogo(ctx, logo, margin, 62, 185, 105);

  const companyX = logo ? 285 : margin;
  ctx.font = "700 34px Arial";
  ctx.fillText(companyName, companyX, 62);
  ctx.font = "600 20px Arial";
  let companyY = 108;
  if (ticket.company.businessName && ticket.company.businessName !== companyName) {
    companyY = drawWrapped(ctx, ticket.company.businessName, companyX, companyY, 500, 28) + 3;
  }
  ctx.font = "400 18px Arial";
  if (ticket.company.address) companyY = drawWrapped(ctx, ticket.company.address, companyX, companyY, 500, 25) + 2;
  const contact = [ticket.company.phone, ticket.company.email].filter(Boolean).join(" · ");
  if (contact) drawWrapped(ctx, contact, companyX, companyY, 500, 25);

  const docX = 850;
  const docY = 48;
  const docW = right - docX;
  const docH = 205;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#111827";
  ctx.strokeRect(docX, docY, docW, docH);
  ctx.textAlign = "center";
  ctx.font = "700 24px Arial";
  ctx.fillText(`RUC ${ticket.company.ruc || "—"}`, docX + docW / 2, docY + 28);
  ctx.font = "700 29px Arial";
  drawWrapped(ctx, documentLabel, docX + docW / 2, docY + 78, docW - 30, 34);
  ctx.font = "700 25px Arial";
  ctx.fillText(documentNumber, docX + docW / 2, docY + 151);
  ctx.textAlign = "left";

  let y = 286;
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, y, right - margin, 178);
  ctx.font = "700 18px Arial";
  ctx.fillStyle = "#4b5563";
  ctx.fillText("CLIENTE", margin + 22, y + 20);
  ctx.fillText("FECHA", 785, y + 20);
  ctx.font = "600 22px Arial";
  ctx.fillStyle = "#111827";
  ctx.fillText(ticket.customer?.name || "Consumidor final", margin + 22, y + 53);
  ctx.fillText(limaDate(ticket.createdAt), 785, y + 53);
  ctx.font = "400 18px Arial";
  const customerDocument = ticket.customer?.documentNumber
    ? `${ticket.customer.documentType || "Documento"}: ${ticket.customer.documentNumber}`
    : "Sin documento";
  ctx.fillText(customerDocument, margin + 22, y + 92);
  ctx.fillText(`Sucursal: ${ticket.branch}`, 785, y + 92);
  ctx.fillText(`Condición: ${TAX_LABELS[ticket.taxCondition] ?? ticket.taxCondition}`, margin + 22, y + 127);
  ctx.fillText(`Venta: ${ticket.saleNumber}`, 785, y + 127);

  y += 212;
  const tableX = margin;
  const tableW = right - margin;
  ctx.fillStyle = "#111827";
  ctx.fillRect(tableX, y, tableW, 52);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 18px Arial";
  ctx.fillText("CANT.", tableX + 18, y + 16);
  ctx.fillText("DESCRIPCIÓN", tableX + 120, y + 16);
  ctx.textAlign = "right";
  ctx.fillText("P. UNIT.", tableX + 915, y + 16);
  ctx.fillText("TOTAL", right - 18, y + 16);
  ctx.textAlign = "left";
  y += 52;

  for (const item of ticket.items) {
    ctx.font = "700 20px Arial";
    const nameLines = wrapText(ctx, item.product, 610);
    ctx.font = "400 17px Arial";
    const variantLines = wrapText(ctx, item.variant, 610);
    const ids = identifierText(item);
    const rowHeight = Math.max(88, 28 + nameLines.length * 26 + variantLines.length * 23 + ids.length * 22);

    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tableX, y, tableW, rowHeight);
    ctx.fillStyle = "#111827";
    ctx.font = "600 20px Arial";
    ctx.fillText(String(item.quantity), tableX + 22, y + 22);

    let textY = y + 18;
    ctx.font = "700 20px Arial";
    textY = drawWrapped(ctx, item.product, tableX + 120, textY, 610, 26);
    ctx.font = "400 17px Arial";
    ctx.fillStyle = "#4b5563";
    textY = drawWrapped(ctx, item.variant, tableX + 120, textY + 2, 610, 23);
    ctx.font = "400 15px Arial";
    ctx.fillStyle = "#6b7280";
    for (const id of ids) {
      ctx.fillText(id, tableX + 120, textY + 1);
      textY += 21;
    }

    ctx.fillStyle = "#111827";
    ctx.font = "600 19px Arial";
    ctx.textAlign = "right";
    ctx.fillText(money(item.unitPrice), tableX + 915, y + 22);
    ctx.font = "700 20px Arial";
    ctx.fillText(money(item.total), right - 18, y + 22);
    ctx.textAlign = "left";
    y += rowHeight;
  }

  y += 34;
  const summaryX = 765;
  const summaryW = right - summaryX;
  const summaryRows: Array<[string, string, boolean?]> = [
    ["Valor de venta", money(ticket.subtotal)],
    ["IGV", money(ticket.tax)],
  ];
  if (ticket.discount > 0) summaryRows.push(["Descuento", `-${money(ticket.discount)}`]);
  summaryRows.push(["TOTAL", money(ticket.total), true]);

  for (const [label, value, total] of summaryRows) {
    ctx.font = total ? "700 27px Arial" : "600 19px Arial";
    ctx.fillStyle = "#111827";
    ctx.fillText(label, summaryX, y);
    ctx.textAlign = "right";
    ctx.fillText(value, right, y);
    ctx.textAlign = "left";
    y += total ? 48 : 35;
  }

  y += 18;
  ctx.strokeStyle = "#d1d5db";
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(right, y);
  ctx.stroke();
  y += 28;
  ctx.font = "700 18px Arial";
  ctx.fillText("PAGO", margin, y);
  y += 30;
  ctx.font = "400 18px Arial";
  for (const payment of ticket.payments) {
    ctx.fillText(`${PAYMENT_LABELS[payment.method] ?? payment.method}: ${money(payment.amount)}`, margin, y);
    y += 27;
  }

  y += 28;
  ctx.strokeStyle = "#d1d5db";
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(right, y);
  ctx.stroke();
  y += 28;
  ctx.textAlign = "center";
  ctx.fillStyle = "#374151";
  ctx.font = "700 20px Arial";
  ctx.fillText("¡Gracias por su compra!", canvas.width / 2, y);
  if (ticket.ticketFooter) {
    ctx.font = "400 16px Arial";
    drawWrapped(ctx, ticket.ticketFooter, canvas.width / 2, y + 34, 920, 22);
  }
  ctx.textAlign = "left";

  const jpegBlob = await canvasToJpeg(canvas);
  const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
  const pdf = jpegToPdf(jpeg, canvas.width, canvas.height);
  const filename = `comprobante-${safeFileName(documentNumber)}.pdf`;
  return new File([pdf], filename, { type: "application/pdf" });
}
