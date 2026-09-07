"use client";

import Link from "next/link";
import { MessageCircle, Printer, Receipt } from "lucide-react";

function whatsappNumber(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return "";
  return digits.startsWith("51") ? digits : `51${digits}`;
}

export function SaleDetailActions({
  saleId,
  saleNumber,
  customerName,
  customerPhone,
  total,
}: {
  saleId: string;
  saleNumber: string;
  customerName: string;
  customerPhone?: string | null;
  total: number;
}) {
  const phone = whatsappNumber(customerPhone);
  const message = encodeURIComponent(
    `Hola ${customerName}. Gracias por tu compra. Venta ${saleNumber} por S/ ${total.toFixed(2)} registrada en MOBIX.`,
  );

  return (
    <div className="sale-detail-actions no-print">
      <button className="secondary-button" type="button" onClick={() => window.print()}><Printer size={16} /> Imprimir A4</button>
      <Link className="secondary-button" href={`/ventas/${saleId}/ticket`} target="_blank"><Receipt size={16} /> Ticket 80 mm</Link>
      {phone && <a className="secondary-button whatsapp-button" href={`https://wa.me/${phone}?text=${message}`} target="_blank" rel="noreferrer"><MessageCircle size={16} /> WhatsApp</a>}
    </div>
  );
}

export function PrintTicketButton() {
  return <button className="primary-button ticket-print-button no-print" type="button" onClick={() => window.print()}><Printer size={16} /> Imprimir ticket</button>;
}
