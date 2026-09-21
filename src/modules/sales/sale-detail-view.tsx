import { ArrowLeft, BadgeCheck, Building2, CreditCard, Repeat2, RotateCcw, Smartphone, UserRound, WalletCards, Wrench } from "lucide-react";
import Link from "next/link";
import { SaleDetailActions } from "./sale-detail-actions";

const DOCUMENT_LABELS: Record<string, string> = {
  RECEIPT: "03 · Boleta de venta",
  INVOICE: "01 · Factura",
  SALES_NOTE: "Nota de venta",
};

const PRINT_DOCUMENT_LABELS: Record<string, string> = {
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
  EXCHANGE_CREDIT: "Vale de cambio",
  OTHER: "Otro",
};

type ReceiptCompany = {
  businessName: string;
  tradeName: string | null;
  ruc: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
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

function limaOnlyDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "medium",
  }).format(new Date(value));
}

export function SaleDetailView({
  sale,
  canCancelSale,
  created,
  change,
  exchangeCreditId,
  exchangeBalance,
  company,
  ticketFooter,
}: {
  sale: any;
  canCancelSale: boolean;
  created: boolean;
  change: number;
  exchangeCreditId: string | null;
  exchangeBalance: number;
  company: ReceiptCompany;
  ticketFooter: string | null;
}) {
  const customerName = sale.customer?.name ?? "Consumidor final";
  const companyName = company.tradeName || company.businessName;
  const documentNumber = sale.documentSeries && sale.documentNumber
    ? `${sale.documentSeries}-${sale.documentNumber}`
    : sale.saleNumber;
  const cancellablePaymentMethods = new Set(["CASH", "CREDIT", "EXCHANGE_CREDIT"]);
  const canCancel = canCancelSale
    && sale.status === "COMPLETED"
    && !sale.returns?.length
    && !sale.serviceOrders?.some((order: any) => order.status !== "CANCELLED")
    && sale.payments.every((payment: any) => cancellablePaymentMethods.has(payment.method));

  const ticket = {
    saleNumber: sale.saleNumber,
    status: sale.status,
    documentType: sale.documentType,
    documentSeries: sale.documentSeries,
    documentNumber: sale.documentNumber,
    taxCondition: sale.taxCondition,
    createdAt: sale.createdAt,
    branch: sale.branch,
    company,
    ticketFooter,
    customer: sale.customer
      ? {
          name: customerName,
          documentType: sale.customer.documentType,
          documentNumber: sale.customer.documentNumber,
          phone: sale.customer.phone,
          email: sale.customer.email,
          address: sale.customer.address,
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
      reference: payment.reference,
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
        <SaleDetailActions
          saleId={sale.id}
          saleNumber={sale.saleNumber}
          saleStatus={sale.status}
          canCancel={canCancel}
          customerName={customerName}
          customerPhone={sale.customer?.phone}
          total={sale.total}
          ticket={ticket}
          created={created}
          change={change}
          exchangeCreditId={exchangeCreditId}
          exchangeBalance={exchangeBalance}
        />
      </section>

      {created && <div className="success-banner no-print"><BadgeCheck size={18} /><div><strong>Venta registrada correctamente</strong><span>El stock, IMEI, pagos, Kardex y auditoría fueron actualizados.</span></div></div>}

      {sale.status === "CANCELLED" && (
        <div className="sale-cancelled-banner no-print">
          <RotateCcw size={18} />
          <div>
            <strong>Venta anulada</strong>
            <span>
              {sale.cancellation
                ? sale.cancellation.reason + " · " + sale.cancellation.userName + " · " + limaDate(sale.cancellation.createdAt)
                : "El stock y los IMEI fueron revertidos. Esta operación ya no forma parte de la conciliación de ventas."}
            </span>
          </div>
        </div>
      )}

      {sale.returns?.length ? (
        <section className="panel sale-return-history-panel">
          <div className="panel-heading">
            <div>
              <h2>Devoluciones y cambios vinculados</h2>
              <p>Operaciones que modificaron parcial o totalmente esta venta.</p>
            </div>
            <RotateCcw size={20} />
          </div>
          <div className="sale-return-history-list">
            {sale.returns.map((entry: any) => (
              <Link href={"/devoluciones/" + entry.id} className="sale-return-history-row" key={entry.id}>
                <div className="sale-return-history-icon">
                  {entry.type === "EXCHANGE" ? <Repeat2 size={16} /> : <RotateCcw size={16} />}
                </div>
                <div className="sale-return-history-copy">
                  <span>{entry.type === "EXCHANGE" ? "Cambio" : "Devolución"}</span>
                  <strong>{entry.returnNumber}</strong>
                  <small>{entry.reason}</small>
                </div>
                <div className="sale-return-history-meta">
                  <span>{entry.quantity} producto{entry.quantity === 1 ? "" : "s"}</span>
                  <strong>{money(entry.value)}</strong>
                  <small>{limaOnlyDate(entry.createdAt)}</small>
                </div>
                {entry.exchangeCredit && (
                  <div className="sale-return-history-credit">
                    <span>Vale</span>
                    <strong>{money(entry.exchangeCredit.balance)} saldo</strong>
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {sale.serviceOrders?.length ? (
        <section className="panel sale-service-history-panel">
          <div className="panel-heading">
            <div>
              <h2>Postventa y garantía</h2>
              <p>Atenciones técnicas vinculadas directamente a esta venta.</p>
            </div>
            <Wrench size={20} />
          </div>
          <div className="sale-service-history-list">
            {sale.serviceOrders.map((order: any) => (
              <Link href={"/servicio-tecnico/" + order.id} className="sale-service-history-row" key={order.id}>
                <div className="sale-service-history-icon"><Wrench size={16} /></div>
                <div className="sale-service-history-copy">
                  <span>{order.serviceType === "WARRANTY" ? "Garantía" : "Servicio técnico"}</span>
                  <strong>{order.serviceNumber}</strong>
                  <small>{order.deviceName}{order.identifier ? " · " + order.identifier : ""}</small>
                </div>
                <div className="sale-service-history-meta">
                  <span>{order.status}</span>
                  <strong>{order.warrantyCovered ? "Cobertura de venta" : money(order.finalCost)}</strong>
                  <small>{limaOnlyDate(order.receivedAt)}</small>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {sale.exchangeOrigins?.length ? (
        <section className="panel sale-exchange-origin-panel">
          <div className="panel-heading">
            <div>
              <h2>Venta vinculada a cambio</h2>
              <p>Valor reconocido por equipo(s) entregado(s) anteriormente.</p>
            </div>
            <Repeat2 size={20} />
          </div>
          <div className="sale-exchange-origin-list">
            {sale.exchangeOrigins.map((origin: any) => (
              <article className="sale-exchange-origin-row" key={origin.exchangeCreditId}>
                <div className="sale-exchange-origin-icon"><WalletCards size={18} /></div>
                <div className="sale-exchange-origin-copy">
                  <span>Vale de {origin.returnNumber}</span>
                  <strong>{money(origin.amount)} aplicado en esta venta</strong>
                  <small>
                    Valor original {money(origin.originalAmount)}
                    {origin.balance > 0.01
                      ? " · Saldo actual " + money(origin.balance)
                      : origin.refundedAmount > 0.01
                        ? " · Saldo restante devuelto al cliente"
                        : " · Vale utilizado"}
                  </small>
                </div>
                <div className="sale-exchange-origin-units">
                  {origin.returnedUnits.map((unit: any) => (
                    <Link href={"/equipos/" + unit.id} key={unit.id}>
                      <Smartphone size={13} />
                      <span>
                        <strong>{unit.product}</strong>
                        <code>{unit.identifier}</code>
                      </span>
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="sale-detail-grid">
        <article className="panel sale-info-card">
          <div className="sale-info-icon"><UserRound size={18} /></div>
          <div><span>Cliente</span><strong>{customerName}</strong><small>{sale.customer?.documentType && sale.customer?.documentNumber ? `${sale.customer.documentType} ${sale.customer.documentNumber}` : "Consumidor final"}</small>{sale.customer?.phone && <small>{sale.customer.phone}</small>}</div>
        </article>
        <article className="panel sale-info-card">
          <div className="sale-info-icon"><Building2 size={18} /></div>
          <div><span>Comprobante</span><strong>{documentNumber}</strong><small>{TAX_LABELS[sale.taxCondition] ?? sale.taxCondition}</small></div>
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
                  <td>{item.identifiers.length ? <div className="identifier-stack">{item.identifiers.map((identifier: any, index: number) => <span key={index}>{identifier.imei1 && <><b>IMEI 1</b> <code>{identifier.imei1}</code></>}{identifier.imei2 && <><br /><b>IMEI 2</b> <code>{identifier.imei2}</code></>}{identifier.serial && <><br /><b>Serie</b> <code>{identifier.serial}</code></>}{identifier.warrantyExpiresAt && <><br /><b>Garantía</b> hasta {limaOnlyDate(identifier.warrantyExpiresAt)}</>}</span>)}</div> : "—"}</td>
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
            {sale.payments.map((payment: any) => <div className="sale-payment-row" key={payment.id}><span>{PAYMENT_LABELS[payment.method] ?? payment.method}{payment.reference && payment.method !== "EXCHANGE_CREDIT" ? <small>Ref. {payment.reference}</small> : null}</span><strong>{money(payment.amount)}</strong></div>)}
          </div>
        </section>
        <section className="panel sale-totals-panel">
          <div className="summary-row"><span>Valor de venta</span><strong>{money(sale.subtotal)}</strong></div>
          <div className="summary-row"><span>IGV {sale.taxCondition === "TAXED" ? "18%" : ""}</span><strong>{money(sale.tax)}</strong></div>
          {sale.discount > 0 && <div className="summary-row"><span>Descuento</span><strong>- {money(sale.discount)}</strong></div>}
          <div className="summary-row total"><span>Total</span><strong>{money(sale.total)}</strong></div>
        </section>
      </div>

      <section
        className={[
          "sale-receipt-a4",
          sale.items.length > 5 ? "receipt-a4-dense" : "",
          sale.items.length > 9 ? "receipt-a4-ultra-dense" : "",
        ].filter(Boolean).join(" ")}
        aria-label="Comprobante A4"
      >
        <header className="receipt-a4-header">
          <div className="receipt-company-block">
            {company.logoUrl && <img className="receipt-company-logo" src={company.logoUrl} alt={`Logo de ${companyName}`} />}
            <div className="receipt-company-copy">
              <h2>{companyName}</h2>
              {company.businessName !== companyName && <strong>{company.businessName}</strong>}
              {company.address && <span>{company.address}</span>}
              {company.phone && <span>Tel.: {company.phone}</span>}
              {company.email && <span>{company.email}</span>}
            </div>
          </div>
          <div className="receipt-document-box">
            <span>RUC {company.ruc || "—"}</span>
            <h1>{PRINT_DOCUMENT_LABELS[sale.documentType] ?? sale.documentType}</h1>
            <strong>{documentNumber}</strong>
            {sale.status === "CANCELLED" && <b className="receipt-cancelled-stamp">ANULADO</b>}
          </div>
        </header>

        <div className="receipt-a4-info">
          <div className="receipt-info-row"><span>Cliente</span><strong>{customerName}</strong></div>
          <div className="receipt-info-row"><span>Fecha</span><strong>{limaDate(sale.createdAt)}</strong></div>
          <div className="receipt-info-row"><span>Documento</span><strong>{sale.customer?.documentNumber ? `${sale.customer.documentType || "Doc."} ${sale.customer.documentNumber}` : "Sin documento"}</strong></div>
          <div className="receipt-info-row"><span>Sucursal</span><strong>{sale.branch}</strong></div>
          {sale.customer?.phone && <div className="receipt-info-row"><span>Teléfono</span><strong>{sale.customer.phone}</strong></div>}
          {sale.customer?.email && <div className="receipt-info-row"><span>Correo</span><strong>{sale.customer.email}</strong></div>}
          {sale.customer?.address && <div className="receipt-info-row receipt-info-wide"><span>Dirección</span><strong>{sale.customer.address}</strong></div>}
          <div className="receipt-info-row"><span>Condición</span><strong>{TAX_LABELS[sale.taxCondition] ?? sale.taxCondition}</strong></div>
          <div className="receipt-info-row"><span>Vendedor</span><strong>{sale.seller}</strong></div>
        </div>

        <table className="receipt-a4-table">
          <thead>
            <tr><th>Cant.</th><th>Descripción</th><th className="right">P. unitario</th><th className="right">Descuento</th><th className="right">Total</th></tr>
          </thead>
          <tbody>
            {sale.items.map((item: any) => (
              <tr key={`print-${item.id}`}>
                <td>{item.quantity}</td>
                <td>
                  <div className="receipt-item-copy">
                    <strong>{item.product}</strong>
                    <span>{item.brand} · {item.variant}</span>
                    {item.identifiers.map((identifier: any, index: number) => (
                      <small key={index}>
                        {[identifier.imei1 ? `IMEI 1: ${identifier.imei1}` : "", identifier.imei2 ? `IMEI 2: ${identifier.imei2}` : "", identifier.serial ? `Serie: ${identifier.serial}` : ""].filter(Boolean).join(" · ")}
                        {identifier.warrantyExpiresAt ? ` · Garantía hasta: ${limaOnlyDate(identifier.warrantyExpiresAt)}` : ""}
                      </small>
                    ))}
                  </div>
                </td>
                <td className="right">{money(item.unitPrice)}</td>
                <td className="right">{item.discount ? money(item.discount) : "—"}</td>
                <td className="right"><strong>{money(item.total)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="receipt-a4-bottom">
          <div className="receipt-payment-box">
            <h3>Forma de pago</h3>
            {sale.payments.map((payment: any) => (
              <div className="receipt-payment-row" key={`print-payment-${payment.id}`}>
                <span>
                  {PAYMENT_LABELS[payment.method] ?? payment.method}
                  {payment.reference && payment.method !== "EXCHANGE_CREDIT" ? <small>Ref. {payment.reference}</small> : null}
                </span>
                <strong>{money(payment.amount)}</strong>
              </div>
            ))}
          </div>
          <div className="receipt-summary-box">
            <div className="receipt-summary-row"><span>Valor de venta</span><strong>{money(sale.subtotal)}</strong></div>
            <div className="receipt-summary-row"><span>IGV</span><strong>{money(sale.tax)}</strong></div>
            {sale.discount > 0 && <div className="receipt-summary-row"><span>Descuento</span><strong>-{money(sale.discount)}</strong></div>}
            <div className="receipt-summary-row total"><span>TOTAL</span><strong>{money(sale.total)}</strong></div>
          </div>
        </div>

        <footer className="receipt-a4-footer">
          <strong>{sale.status === "CANCELLED" ? "VENTA ANULADA" : "¡Gracias por su compra!"}</strong>
          {sale.status !== "CANCELLED" && ticketFooter && <span>{ticketFooter}</span>}
          <small>Venta {sale.saleNumber} · {companyName}</small>
        </footer>
      </section>
    </div>
  );
}
