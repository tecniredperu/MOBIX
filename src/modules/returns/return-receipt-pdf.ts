"use client";

export type ReturnReceiptData = {
  company: {
    businessName: string;
    tradeName: string | null;
    ruc: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    logoUrl: string | null;
  };
  returnNumber: string;
  type: "RETURN" | "EXCHANGE";
  createdAt: string;
  createdBy: string;
  reason: string;
  notes: string | null;
  warehouse: {
    branch: string;
    name: string;
  };
  customer: {
    name: string;
    documentType: string | null;
    documentNumber: string | null;
    phone: string | null;
  } | null;
  sale: {
    saleNumber: string;
    documentSeries: string | null;
    documentNumber: string | null;
  };
  items: Array<{
    product: string;
    brand: string;
    variant: string;
    quantity: number;
    identifier: string | null;
    disposition: string;
    amount: number;
  }>;
  refund: {
    amount: number;
    method: string | null;
  };
  exchangeCredit: {
    originalAmount: number;
    balance: number;
    status: string;
    refundedAmount: number;
    refundMethod: string | null;
    refundReference: string | null;
    usages: Array<{
      saleNumber: string;
      amount: number;
      units: Array<{
        product: string;
        identifier: string;
      }>;
    }>;
  } | null;
};

const REFUND_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Ajuste de crédito",
  OTHER: "Otro",
};

const DISPOSITION_LABELS: Record<string, string> = {
  RESTOCK: "Apto para venta",
  QUARANTINE: "En revisión",
  DAMAGED: "Dañado / no vendible",
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
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = words[0];
  for (let index = 1; index < words.length; index += 1) {
    const candidate = line + " " + words[index];
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

function drawLogo(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.drawImage(image, x, y, width, height);
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("No se pudo generar la constancia."));
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
    pushText(number + " 0 obj\n" + body + "\nendobj\n");
  };

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const scale = Math.min(pageWidth / imageWidth, pageHeight / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const drawX = (pageWidth - drawWidth) / 2;
  const drawY = (pageHeight - drawHeight) / 2;
  const pdfContent =
    "q\n"
    + drawWidth.toFixed(2) + " 0 0 " + drawHeight.toFixed(2) + " "
    + drawX.toFixed(2) + " " + drawY.toFixed(2)
    + " cm\n/Im0 Do\nQ\n";
  const contentBytes = encoder.encode(pdfContent);

  pushText("%PDF-1.4\n% MOBIX return receipt\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "
      + pageWidth + " " + pageHeight
      + "] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
  );

  offsets[4] = length;
  pushText(
    "4 0 obj\n<< /Type /XObject /Subtype /Image /Width " + imageWidth
      + " /Height " + imageHeight
      + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "
      + jpeg.length + " >>\nstream\n",
  );
  pushBytes(jpeg);
  pushText("\nendstream\nendobj\n");

  offsets[5] = length;
  pushText("5 0 obj\n<< /Length " + contentBytes.length + " >>\nstream\n");
  pushBytes(contentBytes);
  pushText("endstream\nendobj\n");

  const xrefOffset = length;
  pushText("xref\n0 6\n0000000000 65535 f \n");
  for (let index = 1; index <= 5; index += 1) {
    pushText(String(offsets[index]).padStart(10, "0") + " 00000 n \n");
  }
  pushText("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF");

  return new Blob([concatBytes(chunks)], { type: "application/pdf" });
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-");
}

function originalDocument(data: ReturnReceiptData) {
  return data.sale.documentSeries && data.sale.documentNumber
    ? data.sale.documentSeries + "-" + data.sale.documentNumber
    : data.sale.saleNumber;
}

export async function buildReturnReceiptPdf(data: ReturnReceiptData) {
  const replacementRows = data.exchangeCredit?.usages.reduce(
    (sum, usage) => sum + Math.max(1, usage.units.length),
    0,
  ) ?? 0;
  const estimatedRows = data.items.length * 100 + replacementRows * 55;

  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = Math.max(1754, 1250 + estimatedRows);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no permite generar la constancia PDF.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111827";
  ctx.textBaseline = "top";

  const margin = 72;
  const right = canvas.width - margin;
  const companyName = data.company.tradeName || data.company.businessName;
  const logo = await loadLogo(data.company.logoUrl);

  if (logo) drawLogo(ctx, logo, margin, 58, 180, 100);

  const companyX = logo ? 280 : margin;
  ctx.font = "700 33px Arial";
  ctx.fillText(companyName, companyX, 60);
  let companyY = 105;
  ctx.font = "600 19px Arial";
  if (data.company.businessName && data.company.businessName !== companyName) {
    companyY = drawWrapped(ctx, data.company.businessName, companyX, companyY, 500, 27) + 2;
  }
  ctx.font = "400 17px Arial";
  if (data.company.ruc) {
    ctx.fillText("RUC " + data.company.ruc, companyX, companyY);
    companyY += 24;
  }
  if (data.company.address) {
    companyY = drawWrapped(ctx, data.company.address, companyX, companyY, 500, 23);
  }
  const contact = [data.company.phone, data.company.email].filter(Boolean).join(" · ");
  if (contact) drawWrapped(ctx, contact, companyX, companyY + 2, 500, 23);

  const docX = 835;
  const docY = 48;
  const docW = right - docX;
  const docH = 200;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#111827";
  ctx.strokeRect(docX, docY, docW, docH);
  ctx.textAlign = "center";
  ctx.font = "700 21px Arial";
  ctx.fillText("CONSTANCIA DE", docX + docW / 2, docY + 30);
  ctx.font = "700 31px Arial";
  ctx.fillText(data.type === "EXCHANGE" ? "CAMBIO" : "DEVOLUCIÓN", docX + docW / 2, docY + 78);
  ctx.font = "700 24px Arial";
  ctx.fillText(data.returnNumber, docX + docW / 2, docY + 145);
  ctx.textAlign = "left";

  let y = 285;
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, y, right - margin, 190);

  const customerName = data.customer?.name || "Consumidor final";
  const customerDocument = data.customer?.documentNumber
    ? (data.customer.documentType || "Documento") + ": " + data.customer.documentNumber
    : "Sin documento";

  ctx.fillStyle = "#4b5563";
  ctx.font = "700 17px Arial";
  ctx.fillText("CLIENTE", margin + 20, y + 20);
  ctx.fillText("FECHA", 780, y + 20);
  ctx.fillText("VENTA ORIGINAL", margin + 20, y + 105);
  ctx.fillText("SUCURSAL", 780, y + 105);

  ctx.fillStyle = "#111827";
  ctx.font = "600 21px Arial";
  ctx.fillText(customerName, margin + 20, y + 50);
  ctx.fillText(limaDate(data.createdAt), 780, y + 50);
  ctx.font = "400 17px Arial";
  ctx.fillText(customerDocument, margin + 20, y + 79);
  ctx.fillText(originalDocument(data), margin + 20, y + 135);
  ctx.fillText(data.warehouse.branch + " / " + data.warehouse.name, 780, y + 135);

  y += 220;
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(margin, y, right - margin, 105);
  ctx.strokeStyle = "#d1d5db";
  ctx.strokeRect(margin, y, right - margin, 105);
  ctx.fillStyle = "#4b5563";
  ctx.font = "700 16px Arial";
  ctx.fillText("MOTIVO", margin + 20, y + 18);
  ctx.fillStyle = "#111827";
  ctx.font = "600 19px Arial";
  let reasonY = drawWrapped(ctx, data.reason, margin + 20, y + 45, right - margin * 2 - 30, 24);
  if (data.notes) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "400 15px Arial";
    drawWrapped(ctx, data.notes, margin + 20, reasonY + 3, right - margin * 2 - 30, 20);
  }

  y += 135;
  ctx.fillStyle = "#111827";
  ctx.fillRect(margin, y, right - margin, 50);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 17px Arial";
  ctx.fillText("CANT.", margin + 16, y + 15);
  ctx.fillText("PRODUCTO", margin + 110, y + 15);
  ctx.fillText("IMEI / SERIE", margin + 610, y + 15);
  ctx.fillText("DESTINO", margin + 840, y + 15);
  ctx.textAlign = "right";
  ctx.fillText("VALOR", right - 16, y + 15);
  ctx.textAlign = "left";
  y += 50;

  for (const item of data.items) {
    ctx.font = "700 19px Arial";
    const nameLines = wrapText(ctx, item.product, 430);
    ctx.font = "400 15px Arial";
    const variantLines = wrapText(ctx, item.brand + " · " + item.variant, 430);
    const rowHeight = Math.max(78, 25 + nameLines.length * 24 + variantLines.length * 20);

    ctx.strokeStyle = "#e5e7eb";
    ctx.strokeRect(margin, y, right - margin, rowHeight);
    ctx.fillStyle = "#111827";
    ctx.font = "600 18px Arial";
    ctx.fillText(String(item.quantity), margin + 20, y + 19);

    let textY = y + 15;
    ctx.font = "700 19px Arial";
    textY = drawWrapped(ctx, item.product, margin + 110, textY, 430, 24);
    ctx.font = "400 15px Arial";
    ctx.fillStyle = "#4b5563";
    drawWrapped(ctx, item.brand + " · " + item.variant, margin + 110, textY + 2, 430, 20);

    ctx.fillStyle = "#111827";
    ctx.font = "500 15px Arial";
    drawWrapped(ctx, item.identifier || "—", margin + 610, y + 18, 200, 20);
    drawWrapped(
      ctx,
      DISPOSITION_LABELS[item.disposition] ?? item.disposition,
      margin + 840,
      y + 18,
      175,
      20,
    );
    ctx.font = "700 18px Arial";
    ctx.textAlign = "right";
    ctx.fillText(money(item.amount), right - 16, y + 18);
    ctx.textAlign = "left";
    y += rowHeight;
  }

  y += 28;
  ctx.strokeStyle = "#d1d5db";
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(right, y);
  ctx.stroke();
  y += 25;

  if (data.type === "EXCHANGE" && data.exchangeCredit) {
    ctx.fillStyle = "#111827";
    ctx.font = "700 20px Arial";
    ctx.fillText("VALE DE CAMBIO", margin, y);
    y += 34;
    ctx.font = "600 17px Arial";
    ctx.fillText("Valor reconocido", margin, y);
    ctx.textAlign = "right";
    ctx.fillText(money(data.exchangeCredit.originalAmount), right, y);
    ctx.textAlign = "left";
    y += 27;
    ctx.fillText("Saldo actual", margin, y);
    ctx.textAlign = "right";
    ctx.fillText(money(data.exchangeCredit.balance), right, y);
    ctx.textAlign = "left";
    y += 27;
    if (data.exchangeCredit.refundedAmount > 0.01) {
      ctx.fillText("Saldo devuelto", margin, y);
      ctx.textAlign = "right";
      ctx.fillText(money(data.exchangeCredit.refundedAmount), right, y);
      ctx.textAlign = "left";
      y += 27;
    }

    if (data.exchangeCredit.usages.length) {
      y += 14;
      ctx.font = "700 16px Arial";
      ctx.fillStyle = "#4b5563";
      ctx.fillText("VENTAS DE REEMPLAZO", margin, y);
      y += 25;
      for (const usage of data.exchangeCredit.usages) {
        ctx.fillStyle = "#111827";
        ctx.font = "600 16px Arial";
        ctx.fillText(usage.saleNumber + " · " + money(usage.amount) + " aplicado", margin, y);
        y += 22;
        ctx.fillStyle = "#6b7280";
        ctx.font = "400 14px Arial";
        for (const unit of usage.units) {
          ctx.fillText(unit.product + " · " + unit.identifier, margin + 18, y);
          y += 19;
        }
        y += 6;
      }
    }
  } else {
    ctx.fillStyle = "#111827";
    ctx.font = "700 20px Arial";
    ctx.fillText("REEMBOLSO", margin, y);
    y += 34;
    ctx.font = "600 17px Arial";
    ctx.fillText("Importe devuelto", margin, y);
    ctx.textAlign = "right";
    ctx.fillText(money(data.refund.amount), right, y);
    ctx.textAlign = "left";
    y += 27;
    ctx.fillText("Medio", margin, y);
    ctx.textAlign = "right";
    ctx.fillText(REFUND_LABELS[data.refund.method ?? ""] ?? data.refund.method ?? "—", right, y);
    ctx.textAlign = "left";
    y += 27;
  }

  y += 45;
  const signatureWidth = 310;
  ctx.strokeStyle = "#6b7280";
  ctx.beginPath();
  ctx.moveTo(margin + 40, y);
  ctx.lineTo(margin + 40 + signatureWidth, y);
  ctx.moveTo(right - 40 - signatureWidth, y);
  ctx.lineTo(right - 40, y);
  ctx.stroke();
  ctx.fillStyle = "#4b5563";
  ctx.font = "400 15px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Cliente", margin + 40 + signatureWidth / 2, y + 8);
  ctx.fillText("Responsable", right - 40 - signatureWidth / 2, y + 8);

  y += 70;
  ctx.textAlign = "center";
  ctx.fillStyle = "#6b7280";
  ctx.font = "700 15px Arial";
  ctx.fillText(
    data.type === "EXCHANGE"
      ? "Constancia interna de cambio"
      : "Constancia interna de devolución",
    canvas.width / 2,
    y,
  );
  ctx.font = "400 13px Arial";
  ctx.fillText(
    "Documento vinculado a la venta " + data.sale.saleNumber + ". No reemplaza el comprobante de pago original.",
    canvas.width / 2,
    y + 24,
  );
  ctx.textAlign = "left";

  const jpegBlob = await canvasToJpeg(canvas);
  const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
  const pdf = jpegToPdf(jpeg, canvas.width, canvas.height);
  const filename =
    (data.type === "EXCHANGE" ? "cambio-" : "devolucion-")
    + safeFileName(data.returnNumber)
    + ".pdf";

  return new File([pdf], filename, { type: "application/pdf" });
}
