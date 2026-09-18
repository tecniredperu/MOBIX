import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Box,
  Building2,
  CircleDollarSign,
  ReceiptText,
  Repeat2,
  Smartphone,
  UserRound,
  WalletCards,
} from "lucide-react";
import type { getReturnDetail } from "./returns.repository";
import { ReturnDetailActions } from "./return-detail-actions";

type ReturnDetail = NonNullable<Awaited<ReturnType<typeof getReturnDetail>>>;

type ReturnCompany = {
  businessName: string;
  tradeName: string | null;
  ruc: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
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

function originalDocument(detail: ReturnDetail) {
  return detail.sale.documentSeries && detail.sale.documentNumber
    ? detail.sale.documentSeries + "-" + detail.sale.documentNumber
    : detail.sale.saleNumber;
}

export function ReturnDetailView({
  detail,
  company,
}: {
  detail: ReturnDetail;
  company: ReturnCompany;
}) {
  const isExchange = detail.type === "EXCHANGE";
  const customerName = detail.customer?.name ?? "Consumidor final";
  const companyName = company.tradeName || company.businessName;
  const exchangeOpen = Boolean(
    detail.exchangeCredit
    && ["OPEN", "PARTIAL"].includes(detail.exchangeCredit.status)
    && detail.exchangeCredit.balance > 0.01,
  );

  return (
    <div className="page-stack return-detail-page">
      <section className="page-heading return-detail-heading">
        <div>
          <Link href="/devoluciones" className="back-link no-print">
            <ArrowLeft size={15} /> Volver a devoluciones
          </Link>
          <span className="eyebrow">{isExchange ? "CAMBIO" : "DEVOLUCIÓN"} · {detail.returnNumber}</span>
          <h1>{isExchange ? "Detalle del cambio" : "Detalle de la devolución"}</h1>
          <p>
            {limaDate(detail.createdAt)} · {detail.warehouse.branch} / {detail.warehouse.name}
          </p>
        </div>
        <ReturnDetailActions
          exchangeCreditId={detail.exchangeCredit?.id}
          exchangeBalance={detail.exchangeCredit?.balance}
        />
      </section>

      <section className="return-detail-summary-grid">
        <article className="panel">
          <div className="return-detail-summary-icon"><ReceiptText size={18} /></div>
          <span>Venta original</span>
          <strong>{detail.sale.saleNumber}</strong>
          <Link href={"/ventas/" + detail.sale.id}>Ver venta <ArrowUpRight size={12} /></Link>
        </article>
        <article className="panel">
          <div className="return-detail-summary-icon"><UserRound size={18} /></div>
          <span>Cliente</span>
          <strong>{customerName}</strong>
          {detail.customer?.documentNumber && (
            <small>{detail.customer.documentType} {detail.customer.documentNumber}</small>
          )}
        </article>
        <article className="panel">
          <div className="return-detail-summary-icon"><CircleDollarSign size={18} /></div>
          <span>{isExchange ? "Valor reconocido" : "Importe devuelto"}</span>
          <strong>{money(isExchange ? detail.merchandiseAmount : detail.refundAmount)}</strong>
          <small>{isExchange ? "Genera vale de cambio" : REFUND_LABELS[detail.refundMethod ?? ""] ?? "Sin medio"}</small>
        </article>
        <article className="panel">
          <div className="return-detail-summary-icon"><Building2 size={18} /></div>
          <span>Registrado por</span>
          <strong>{detail.createdBy}</strong>
          <small>{detail.warehouse.branch}</small>
        </article>
      </section>

      <section className="panel return-detail-reason">
        <div>
          <span>Motivo</span>
          <strong>{detail.reason}</strong>
          {detail.notes && <p>{detail.notes}</p>}
        </div>
        <span className={isExchange ? "return-detail-type exchange" : "return-detail-type refund"}>
          {isExchange ? <Repeat2 size={14} /> : <Banknote size={14} />}
          {isExchange ? "Cambio" : "Devolución"}
        </span>
      </section>

      <section className="panel table-panel return-detail-items">
        <div className="panel-heading">
          <div>
            <h2>Productos procesados</h2>
            <p>Detalle de cantidades, IMEI/serie y destino de cada producto.</p>
          </div>
          <Box size={20} />
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>IMEI / serie</th>
                <th>Destino</th>
                <th className="right">Cant.</th>
                <th className="right">P. unitario</th>
                <th className="right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="product-cell">
                      <div className="product-thumb">{item.product.slice(0, 1)}</div>
                      <div>
                        <strong>{item.product}</strong>
                        <span>{item.brand} · {item.variant}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    {item.productUnitId ? (
                      <Link className="return-detail-imei-link" href={"/equipos/" + item.productUnitId}>
                        <Smartphone size={13} />
                        <code>{item.identifier ?? item.productUnitId}</code>
                      </Link>
                    ) : "—"}
                  </td>
                  <td>
                    <span className={"device-return-disposition " + item.disposition.toLowerCase()}>
                      {DISPOSITION_LABELS[item.disposition] ?? item.disposition}
                    </span>
                  </td>
                  <td className="right">{item.quantity}</td>
                  <td className="right">{money(item.unitPrice)}</td>
                  <td className="right"><strong>{money(item.amount)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isExchange && detail.exchangeCredit && (
        <section className="panel return-detail-credit-panel">
          <div className="panel-heading">
            <div>
              <h2>Vale de cambio</h2>
              <p>Saldo reconocido por los productos entregados y su uso posterior.</p>
            </div>
            <WalletCards size={20} />
          </div>

          <div className="return-detail-credit-summary">
            <div>
              <span>Valor original</span>
              <strong>{money(detail.exchangeCredit.originalAmount)}</strong>
            </div>
            <div>
              <span>Saldo actual</span>
              <strong>{money(detail.exchangeCredit.balance)}</strong>
            </div>
            <div>
              <span>Estado</span>
              <strong>
                {detail.exchangeCredit.refundedAmount > 0.01
                  ? "Saldo devuelto"
                  : detail.exchangeCredit.status === "USED"
                    ? "Utilizado"
                    : detail.exchangeCredit.status === "PARTIAL"
                      ? "Uso parcial"
                      : "Disponible"}
              </strong>
            </div>
            {detail.exchangeCredit.refundedAmount > 0.01 && (
              <div>
                <span>Devuelto al cliente</span>
                <strong>{money(detail.exchangeCredit.refundedAmount)}</strong>
                <small>
                  {REFUND_LABELS[detail.exchangeCredit.refundMethod ?? ""] ?? detail.exchangeCredit.refundMethod}
                  {detail.exchangeCredit.refundReference ? " · Ref. " + detail.exchangeCredit.refundReference : ""}
                </small>
              </div>
            )}
          </div>

          {exchangeOpen && (
            <div className="return-detail-credit-open">
              <BadgeCheck size={17} />
              <div>
                <strong>Vale disponible para una nueva compra</strong>
                <span>Quedan {money(detail.exchangeCredit.balance)} por aplicar.</span>
              </div>
              <Link className="primary-button" href={"/pos?exchangeCredit=" + encodeURIComponent(detail.exchangeCredit.id)}>
                Usar en POS
              </Link>
            </div>
          )}

          {detail.exchangeCredit.usages.length ? (
            <div className="return-detail-credit-usages">
              {detail.exchangeCredit.usages.map((usage) => (
                <article key={usage.id}>
                  <div className="return-detail-usage-head">
                    <div>
                      <span>Venta de reemplazo</span>
                      <Link href={"/ventas/" + usage.sale.id}>{usage.sale.saleNumber}</Link>
                    </div>
                    <strong>{money(usage.amount)} aplicado</strong>
                  </div>
                  <div className="return-detail-replacement-units">
                    {usage.sale.units.length ? usage.sale.units.map((unit) => (
                      <Link href={"/equipos/" + unit.id} key={unit.id}>
                        <Smartphone size={13} />
                        <span>
                          <strong>{unit.product}</strong>
                          <code>{unit.identifier}</code>
                        </span>
                      </Link>
                    )) : (
                      <span className="return-detail-no-units">La venta de reemplazo no contiene equipos serializados.</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="return-detail-empty-credit">
              <Repeat2 size={19} />
              <strong>Aún no se ha utilizado este vale</strong>
              <span>Cuando se aplique en el POS, la nueva venta aparecerá aquí automáticamente.</span>
            </div>
          )}
        </section>
      )}

      {!isExchange && (
        <section className="panel return-detail-refund-panel">
          <div className="panel-heading">
            <div>
              <h2>Reembolso</h2>
              <p>Forma en la que se devolvió el importe al cliente.</p>
            </div>
            <Banknote size={20} />
          </div>
          <div className="return-detail-refund-row">
            <div><span>Importe</span><strong>{money(detail.refundAmount)}</strong></div>
            <div><span>Medio</span><strong>{REFUND_LABELS[detail.refundMethod ?? ""] ?? "—"}</strong></div>
            <div><span>Venta original</span><strong>{originalDocument(detail)}</strong></div>
          </div>
        </section>
      )}

      <section className="return-detail-print" aria-label="Constancia de devolución o cambio">
        <header className="return-print-header">
          <div className="return-print-company">
            {company.logoUrl && <img src={company.logoUrl} alt={"Logo de " + companyName} />}
            <div>
              <h2>{companyName}</h2>
              {company.businessName !== companyName && <strong>{company.businessName}</strong>}
              {company.ruc && <span>RUC {company.ruc}</span>}
              {company.address && <span>{company.address}</span>}
              {company.phone && <span>Tel. {company.phone}</span>}
              {company.email && <span>{company.email}</span>}
            </div>
          </div>
          <div className="return-print-document">
            <span>CONSTANCIA DE</span>
            <h1>{isExchange ? "CAMBIO" : "DEVOLUCIÓN"}</h1>
            <strong>{detail.returnNumber}</strong>
          </div>
        </header>

        <div className="return-print-info">
          <div><span>Fecha</span><strong>{limaDate(detail.createdAt)}</strong></div>
          <div><span>Venta original</span><strong>{originalDocument(detail)}</strong></div>
          <div><span>Cliente</span><strong>{customerName}</strong></div>
          <div>
            <span>Documento</span>
            <strong>
              {detail.customer?.documentNumber
                ? (detail.customer.documentType ?? "Doc.") + " " + detail.customer.documentNumber
                : "Sin documento"}
            </strong>
          </div>
          <div><span>Sucursal</span><strong>{detail.warehouse.branch}</strong></div>
          <div><span>Responsable</span><strong>{detail.createdBy}</strong></div>
        </div>

        <div className="return-print-reason">
          <span>Motivo</span>
          <strong>{detail.reason}</strong>
          {detail.notes && <p>{detail.notes}</p>}
        </div>

        <table className="return-print-table">
          <thead>
            <tr>
              <th>Cant.</th>
              <th>Producto</th>
              <th>IMEI / serie</th>
              <th>Destino</th>
              <th className="right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {detail.items.map((item) => (
              <tr key={"print-" + item.id}>
                <td>{item.quantity}</td>
                <td>
                  <strong>{item.product}</strong>
                  <small>{item.brand} · {item.variant}</small>
                </td>
                <td>{item.identifier ?? "—"}</td>
                <td>{DISPOSITION_LABELS[item.disposition] ?? item.disposition}</td>
                <td className="right">{money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="return-print-settlement">
          {isExchange && detail.exchangeCredit ? (
            <>
              <div><span>Valor reconocido</span><strong>{money(detail.exchangeCredit.originalAmount)}</strong></div>
              <div><span>Saldo actual del vale</span><strong>{money(detail.exchangeCredit.balance)}</strong></div>
              {detail.exchangeCredit.refundedAmount > 0.01 && (
                <div><span>Saldo devuelto</span><strong>{money(detail.exchangeCredit.refundedAmount)}</strong></div>
              )}
            </>
          ) : (
            <>
              <div><span>Importe devuelto</span><strong>{money(detail.refundAmount)}</strong></div>
              <div><span>Medio de devolución</span><strong>{REFUND_LABELS[detail.refundMethod ?? ""] ?? "—"}</strong></div>
            </>
          )}
        </div>

        <div className="return-print-signatures">
          <div><span>Cliente</span></div>
          <div><span>Responsable</span></div>
        </div>

        <footer>
          <strong>{isExchange ? "Constancia interna de cambio" : "Constancia interna de devolución"}</strong>
          <span>Documento vinculado a la venta {detail.sale.saleNumber}. No reemplaza el comprobante de pago original.</span>
        </footer>
      </section>
    </div>
  );
}
