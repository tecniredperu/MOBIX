import { notFound } from "next/navigation";
import { PrintTicketButton } from "@/modules/sales/sale-detail-actions";
import { getSaleDetail } from "@/modules/sales/sales.repository";

export const dynamic = "force-dynamic";

function money(value: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 }).format(value);
}

function limaDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sale = await getSaleDetail(id);
  if (!sale) notFound();

  const customer = sale.customer?.name ?? "Consumidor final";
  return (
    <main className="ticket-screen">
      <div className="ticket-page">
        <header className="ticket-header">
          <strong>MOBIX</strong>
          <span>Gestión móvil</span>
          <p>{sale.branch}</p>
        </header>
        <div className="ticket-meta">
          <span>Venta: {sale.saleNumber}</span>
          <span>{sale.documentSeries}-{sale.documentNumber}</span>
          <span>{limaDate(sale.createdAt)}</span>
          <span>Cliente: {customer}</span>
          {sale.customer?.documentNumber && <span>{sale.customer.documentType}: {sale.customer.documentNumber}</span>}
        </div>
        <div className="ticket-items">
          {sale.items.map((item) => (
            <div className="ticket-item" key={item.id}>
              <strong>{item.product}</strong>
              <span>{item.variant}</span>
              {item.identifiers.map((identifier, index) => <span key={index}>{identifier.imei1 ? `IMEI: ${identifier.imei1}` : identifier.serial ? `Serie: ${identifier.serial}` : ""}</span>)}
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
          {sale.payments.map((payment) => <div key={payment.id}><span>{payment.method}</span><strong>{money(payment.amount)}</strong></div>)}
        </div>
        <footer className="ticket-footer"><strong>¡Gracias por tu compra!</strong><span>Documento generado por MOBIX.</span><small>La integración de facturación electrónica SUNAT se habilitará en una etapa posterior.</small></footer>
      </div>
      <PrintTicketButton />
    </main>
  );
}
