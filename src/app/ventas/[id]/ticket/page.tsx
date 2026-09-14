import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/business-context";
import { PrintTicketButton } from "@/modules/sales/sale-detail-actions";
import { getSaleDetail } from "@/modules/sales/sales.repository";

export const dynamic = "force-dynamic";

const DOCUMENT_LABELS: Record<string, string> = {
  RECEIPT: "BOLETA DE VENTA",
  INVOICE: "FACTURA",
  SALES_NOTE: "NOTA DE VENTA",
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
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 }).format(value);
}

function limaDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePermission("sales.view");
  const { id } = await params;
  const sale = await getSaleDetail(id);
  if (!sale) notFound();

  const customer = sale.customer?.name ?? "Consumidor final";
  const company = context.company;
  const companyName = company.tradeName || company.businessName;
  const contact = [company.phone, company.email].filter(Boolean).join(" · ");
  const documentNumber = sale.documentSeries && sale.documentNumber
    ? `${sale.documentSeries}-${sale.documentNumber}`
    : sale.saleNumber;

  return (
    <main className="ticket-screen">
      <div className="ticket-page">
        <header className="ticket-header">
          {company.logoUrl && <img className="ticket-company-logo" src={company.logoUrl} alt={`Logo de ${companyName}`} />}
          <strong className="ticket-company-name">{companyName}</strong>
          {company.businessName !== companyName && <span className="ticket-company-legal">{company.businessName}</span>}
          {company.ruc && <span>RUC {company.ruc}</span>}
          {company.address && <p>{company.address}</p>}
          {contact && <span className="ticket-company-contact">{contact}</span>}
          <p>{sale.branch}</p>
        </header>
        <div className="ticket-document-box">
          <strong>{DOCUMENT_LABELS[sale.documentType] ?? sale.documentType}</strong>
          <span>{documentNumber}</span>
        </div>
        <div className="ticket-meta">
          <span>Venta: {sale.saleNumber}</span>
          <span>{limaDate(sale.createdAt)}</span>
          <span>Cliente: {customer}</span>
          {sale.customer?.documentNumber && <span>{sale.customer.documentType}: {sale.customer.documentNumber}</span>}
        </div>
        <div className="ticket-items">
          {sale.items.map((item) => (
            <div className="ticket-item" key={item.id}>
              <strong>{item.product}</strong>
              <span>{item.variant}</span>
              {item.identifiers.map((identifier, index) => (
                <span key={index}>
                  {[identifier.imei1 ? `IMEI 1: ${identifier.imei1}` : "", identifier.imei2 ? `IMEI 2: ${identifier.imei2}` : "", identifier.serial ? `Serie: ${identifier.serial}` : ""].filter(Boolean).join(" · ")}
                </span>
              ))}
              <div><span>{item.quantity} x {money(item.unitPrice)}</span><strong>{money(item.total)}</strong></div>
            </div>
          ))}
        </div>
        <div className="ticket-totals">
          <div><span>Valor venta</span><strong>{money(sale.subtotal)}</strong></div>
          <div><span>IGV</span><strong>{money(sale.tax)}</strong></div>
          {sale.discount > 0 && <div><span>Descuento</span><strong>-{money(sale.discount)}</strong></div>}
          <div className="ticket-total"><span>TOTAL</span><strong>{money(sale.total)}</strong></div>
        </div>
        <div className="ticket-payments">
          {sale.payments.map((payment) => <div key={payment.id}><span>{PAYMENT_LABELS[payment.method] ?? payment.method}</span><strong>{money(payment.amount)}</strong></div>)}
        </div>
        <footer className="ticket-footer">
          <strong>¡Gracias por tu compra!</strong>
          {context.settings.ticketFooter && <small className="ticket-custom-footer">{context.settings.ticketFooter}</small>}
        </footer>
      </div>
      <PrintTicketButton />
    </main>
  );
}
