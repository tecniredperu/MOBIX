import { ArrowLeft, BadgeCheck, Building2, CreditCard, UserRound } from "lucide-react";
import Link from "next/link";
import { SaleDetailActions } from "./sale-detail-actions";

const DOCUMENT_LABELS: Record<string, string> = {
  RECEIPT: "03 · Boleta de venta",
  INVOICE: "01 · Factura",
  SALES_NOTE: "Nota de venta",
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
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 }).format(value);
}

function limaDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SaleDetailView({ sale, created }: { sale: any; created: boolean }) {
  const customerName = sale.customer?.name ?? "Consumidor final";
  const ticket = {
    saleNumber: sale.saleNumber,
    documentSeries: sale.documentSeries,
    documentNumber: sale.documentNumber,
    createdAt: sale.createdAt,
    branch: sale.branch,
    customer: sale.customer
      ? {
          name: customerName,
          documentType: sale.customer.documentType,
          documentNumber: sale.customer.documentNumber,
        }
      : null,
    items: sale.items.map((item: any) => ({
      id: item.id,
      product: item.product,
      variant: item.variant,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      identifiers: item.identifiers,
    })),
    subtotal: sale.subtotal,
    tax: sale.tax,
    discount: sale.discount,
    total: sale.total,
    payments: sale.payments.map((payment: any) => ({
      id: payment.id,
      method: payment.method,
      amount: payment.amount,
    })),
  };

  return (
    <div className="page-stack sale-detail-page">
      <section className="page-heading sale-detail-heading">
        <div>
          <Link href="/ventas" className="back-link no-print"><ArrowLeft size={15} /> Volver a ventas</Link>
          <span className="eyebrow">VENTA {sale.saleNumber}</span>
          <h1>{DOCUMENT_LABELS[sale.documentType] ?? sale.documentType}</h1>
          <p>{limaDate(sale.createdAt)} · {sale.branch} / {sale.warehouse}</p>
        </div>
        <SaleDetailActions saleNumber={sale.saleNumber} customerName={customerName} customerPhone={sale.customer?.phone} total={sale.total} ticket={ticket} />
      </section>

      {created && <div className="success-banner no-print"><BadgeCheck size={18} /><div><strong>Venta registrada correctamente</strong><span>El stock, IMEI, pagos, Kardex y auditoría fueron actualizados.</span></div></div>}

      <section className="sale-detail-grid">
        <article className="panel sale-info-card">
          <div className="sale-info-icon"><UserRound size={18} /></div>
          <div><span>Cliente</span><strong>{customerName}</strong><small>{sale.customer?.documentType && sale.customer?.documentNumber ? `${sale.customer.documentType} ${sale.customer.documentNumber}` : "Consumidor final"}</small>{sale.customer?.phone && <small>{sale.customer.phone}</small>}</div>
        </article>
        <article className="panel sale-info-card">
          <div className="sale-info-icon"><Building2 size={18} /></div>
          <div><span>Comprobante</span><strong>{sale.documentSeries && sale.documentNumber ? `${sale.documentSeries}-${sale.documentNumber}` : sale.saleNumber}</strong><small>{TAX_LABELS[sale.taxCondition] ?? sale.taxCondition}</small></div>
        </article>
        <article className="panel sale-info-card">
          <div className="sale-info-icon"><CreditCard size={18} /></div>
          <div><span>Vendedor</span><strong>{sale.seller}</strong><small>{sale.branch} · {sale.warehouse}</small></div>
        </article>
      </section>

      <section className="panel table-panel sale-items-panel">
        <div className="panel-heading"><div><h2>Detalle de productos</h2><p>Equipos vendidos identificados por IMEI o serie.</p></div></div>
        <div className="table-wrap">
          <table className="data-table sale-detail-table">
            <thead><tr><th>Producto</th><th>IMEI / serie</th><th className="right">Cant.</th><th className="right">P. unitario</th><th className="right">Descuento</th><th className="right">Total</th></tr></thead>
            <tbody>
              {sale.items.map((item: any) => (
                <tr key={item.id}>
                  <td><div className="product-cell"><div className="product-thumb">{item.product.slice(0, 1)}</div><div><strong>{item.product}</strong><span>{item.brand} · {item.variant}</span></div></div></td>
                  <td>{item.identifiers.length ? <div className="identifier-stack">{item.identifiers.map((identifier: any, index: number) => <span key={index}>{identifier.imei1 && <><b>IMEI 1</b> <code>{identifier.imei1}</code></>}{identifier.imei2 && <><br /><b>IMEI 2</b> <code>{identifier.imei2}</code></>}{identifier.serial && <><br /><b>Serie</b> <code>{identifier.serial}</code></>}</span>)}</div> : "—"}</td>
                  <td className="right">{item.quantity}</td>
                  <td className="right">{money(item.unitPrice)}</td>
                  <td className="right">{item.discount ? money(item.discount) : "—"}</td>
                  <td className="right"><strong>{money(item.total)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="sale-bottom-grid">
        <section className="panel sale-payments-panel">
          <div className="panel-heading"><div><h2>Pagos</h2><p>Medios utilizados en la operación.</p></div></div>
          <div className="sale-payment-list">
            {sale.payments.map((payment: any) => <div className="sale-payment-row" key={payment.id}><span>{PAYMENT_LABELS[payment.method] ?? payment.method}{payment.reference ? <small>Ref. {payment.reference}</small> : null}</span><strong>{money(payment.amount)}</strong></div>)}
          </div>
        </section>
        <section className="panel sale-totals-panel">
          <div className="summary-row"><span>Valor de venta</span><strong>{money(sale.subtotal)}</strong></div>
          <div className="summary-row"><span>IGV {sale.taxCondition === "TAXED" ? "18%" : ""}</span><strong>{money(sale.tax)}</strong></div>
          {sale.discount > 0 && <div className="summary-row"><span>Descuento</span><strong>- {money(sale.discount)}</strong></div>}
          <div className="summary-row total"><span>Total</span><strong>{money(sale.total)}</strong></div>
        </section>
      </div>
    </div>
  );
}
