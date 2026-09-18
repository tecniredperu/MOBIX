"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  RotateCcw,
  Repeat2,
  WalletCards,
  X,
} from "lucide-react";
import { refundExchangeCreditAction } from "./return-actions";

const METHODS: Record<string, string> = {
  CASH: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Crédito",
  OTHER: "Otro",
};

const EXCHANGE_REFUND_METHODS = [
  ["CASH", "Efectivo"],
  ["YAPE", "Yape"],
  ["PLIN", "Plin"],
  ["CARD", "Tarjeta"],
  ["TRANSFER", "Transferencia"],
  ["OTHER", "Otro"],
] as const;

function money(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(value || 0);
}

function dt(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

type RefundCredit = {
  id: string;
  returnNumber: string;
  balance: number;
};

export function ReturnsView({ items }: { items: any[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refundCredit, setRefundCredit] = useState<RefundCredit | null>(null);
  const [refundMethod, setRefundMethod] = useState<(typeof EXCHANGE_REFUND_METHODS)[number][0]>("CASH");
  const [refundReference, setRefundReference] = useState("");
  const [refundError, setRefundError] = useState("");

  const total = items.reduce(
    (sum, item) => sum + (
      item.type === "EXCHANGE"
        ? Number(item.exchangeCredit?.originalAmount || 0)
        : item.refundAmount
    ),
    0,
  );
  const exchanges = items.filter((item) => item.type === "EXCHANGE").length;
  const openCredits = items.filter(
    (item) =>
      item.exchangeCredit
      && ["OPEN", "PARTIAL"].includes(item.exchangeCredit.status)
      && item.exchangeCredit.balance > 0.01,
  );
  const openCreditBalance = openCredits.reduce(
    (sum, item) => sum + Number(item.exchangeCredit?.balance || 0),
    0,
  );
  const quarantined = items.reduce(
    (sum, item) => sum + Number(item.serializedDisposition?.quarantine || 0),
    0,
  );
  const damaged = items.reduce(
    (sum, item) => sum + Number(item.serializedDisposition?.damaged || 0),
    0,
  );

  function openRefund(item: any) {
    if (!item.exchangeCredit) return;
    setRefundCredit({
      id: item.exchangeCredit.id,
      returnNumber: item.returnNumber,
      balance: Number(item.exchangeCredit.balance || 0),
    });
    setRefundMethod("CASH");
    setRefundReference("");
    setRefundError("");
  }

  function closeRefund() {
    if (pending) return;
    setRefundCredit(null);
    setRefundError("");
  }

  function confirmRefund() {
    if (!refundCredit) return;
    setRefundError("");
    startTransition(async () => {
      try {
        await refundExchangeCreditAction({
          exchangeCreditId: refundCredit.id,
          method: refundMethod,
          reference: refundReference,
        });
        setRefundCredit(null);
        router.refresh();
      } catch (cause) {
        setRefundError(
          cause instanceof Error
            ? cause.message
            : "No se pudo devolver el saldo del vale.",
        );
      }
    });
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">POSTVENTA COMERCIAL</span>
          <h1>Devoluciones y cambios</h1>
          <p>Reingresos de stock, IMEI, reembolsos y trazabilidad vinculada a la venta original.</p>
        </div>
        <Link className="primary-button" href="/devoluciones/nueva">
          Nueva devolución / cambio <ArrowUpRight size={16} />
        </Link>
      </section>

      <section className="mobix-summary-grid four">
        <article>
          <RotateCcw size={19} />
          <span>Operaciones</span>
          <strong>{items.length}</strong>
        </article>
        <article>
          <Repeat2 size={19} />
          <span>Cambios</span>
          <strong>{exchanges}</strong>
          {openCredits.length > 0 && (
            <small>{openCredits.length} vales abiertos · {money(openCreditBalance)}</small>
          )}
        </article>
        <article>
          <span className="summary-symbol">S/</span>
          <span>Valor procesado</span>
          <strong>{money(total)}</strong>
        </article>
        <article className={quarantined || damaged ? "return-review-card" : ""}>
          <AlertTriangle size={19} />
          <span>IMEI por revisar</span>
          <strong>{quarantined + damaged}</strong>
          {quarantined + damaged > 0 && (
            <small>{quarantined} en revisión · {damaged} dañados</small>
          )}
        </article>
      </section>

      {(quarantined > 0 || damaged > 0) && (
        <section className="return-review-banner panel">
          <AlertTriangle size={18} />
          <div>
            <strong>Hay equipos que no deben volver al POS todavía</strong>
            <span>
              Los IMEI en revisión o dañados permanecen fuera del stock vendible hasta que se evalúe su condición.
            </span>
          </div>
          <Link href="/equipos?status=RETURNED" className="secondary-button">
            Ver en revisión
          </Link>
        </section>
      )}

      <section className="panel table-panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Operación</th>
                <th>Venta</th>
                <th>Cliente</th>
                <th>Motivo</th>
                <th>Destino IMEI</th>
                <th>Vale de cambio</th>
                <th>Reembolso</th>
                <th className="right">Valor</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const disposition = item.serializedDisposition || {
                  restock: 0,
                  quarantine: 0,
                  damaged: 0,
                };
                const credit = item.exchangeCredit;
                const creditOpen = Boolean(
                  credit
                  && ["OPEN", "PARTIAL"].includes(credit.status)
                  && credit.balance > 0.01,
                );

                return (
                  <tr key={item.id}>
                    <td>
                      <Link className="return-detail-link" href={"/devoluciones/" + item.id}>
                        {item.returnNumber}
                      </Link>
                      <span className={`service-type-badge ${item.type === "EXCHANGE" ? "technical" : "warranty"}`}>
                        {item.type === "EXCHANGE" ? "Cambio" : "Devolución"}
                      </span>
                    </td>
                    <td>
                      <strong>{item.saleNumber}</strong>
                      <span className="table-sub">{item.warehouse}</span>
                    </td>
                    <td>{item.customer}</td>
                    <td>{item.reason}</td>
                    <td>
                      <div className="return-disposition-stack">
                        {disposition.quarantine > 0 && (
                          <span className="return-disposition-chip quarantine">
                            {disposition.quarantine} en revisión
                          </span>
                        )}
                        {disposition.damaged > 0 && (
                          <span className="return-disposition-chip damaged">
                            {disposition.damaged} dañados
                          </span>
                        )}
                        {disposition.restock > 0 && (
                          <span className="return-disposition-chip restock">
                            {disposition.restock} disponibles
                          </span>
                        )}
                        {!disposition.quarantine && !disposition.damaged && !disposition.restock && <span>—</span>}
                      </div>
                    </td>
                    <td>
                      {credit ? (
                        <div className="return-credit-cell">
                          <span className={`return-credit-chip ${credit.status.toLowerCase()}`}>
                            <WalletCards size={12} />
                            {money(credit.balance)} disponible
                          </span>
                          {creditOpen ? (
                            <div className="return-credit-actions">
                              <Link href={`/pos?exchangeCredit=${encodeURIComponent(credit.id)}`}>
                                Usar en POS
                              </Link>
                              <button type="button" onClick={() => openRefund(item)}>
                                Devolver saldo
                              </button>
                            </div>
                          ) : (
                            <small>
                              {Number(credit.refundedAmount || 0) > 0 ? "Saldo devuelto" : "Vale utilizado"}
                            </small>
                          )}
                        </div>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                    <td>
                      {item.type === "EXCHANGE"
                        ? "Valor para cambio"
                        : METHODS[item.refundMethod || ""] || "—"}
                    </td>
                    <td className="right">
                      <strong>
                        {money(
                          item.type === "EXCHANGE"
                            ? Number(item.exchangeCredit?.originalAmount || 0)
                            : item.refundAmount,
                        )}
                      </strong>
                    </td>
                    <td>
                      {dt(item.createdAt)}
                      <span className="table-sub">{item.userName}</span>
                    </td>
                  </tr>
                );
              })}

              {!items.length && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-table-state">
                      <RotateCcw size={22} />
                      <strong>Sin devoluciones</strong>
                      <span>Las operaciones aparecerán aquí cuando se registren.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {refundCredit && (
        <div className="return-refund-modal" role="dialog" aria-modal="true" aria-labelledby="return-refund-title">
          <button
            className="return-refund-backdrop"
            type="button"
            aria-label="Cerrar"
            onClick={closeRefund}
          />
          <section className="return-refund-card">
            <button className="return-refund-close" type="button" onClick={closeRefund} aria-label="Cerrar">
              <X size={17} />
            </button>
            <div className="return-refund-icon"><Banknote size={23} /></div>
            <div className="return-refund-heading">
              <span>DEVOLVER DIFERENCIA</span>
              <h2 id="return-refund-title">{refundCredit.returnNumber}</h2>
              <p>Se devolverá todo el saldo no utilizado del vale de cambio.</p>
            </div>

            <div className="return-refund-amount">
              <span>Saldo a devolver</span>
              <strong>{money(refundCredit.balance)}</strong>
            </div>

            <label className="field-label">
              <span>Medio de devolución</span>
              <select
                value={refundMethod}
                onChange={(event) => {
                  setRefundMethod(event.target.value as (typeof EXCHANGE_REFUND_METHODS)[number][0]);
                  setRefundReference("");
                }}
              >
                {EXCHANGE_REFUND_METHODS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            {["YAPE", "PLIN", "CARD", "TRANSFER"].includes(refundMethod) && (
              <label className="field-label">
                <span>N.º operación / referencia</span>
                <input
                  value={refundReference}
                  onChange={(event) => setRefundReference(event.target.value)}
                  placeholder="Obligatorio"
                />
              </label>
            )}

            {refundError && (
              <div className="return-refund-error">{refundError}</div>
            )}

            <button
              className="primary-button wide"
              type="button"
              disabled={pending}
              onClick={confirmRefund}
            >
              {pending ? "Procesando..." : "Confirmar devolución de " + money(refundCredit.balance)}
            </button>
            <small className="return-refund-note">
              Si eliges efectivo, MOBIX exige una caja abierta en la sucursal de la venta original y registra automáticamente la salida.
            </small>
          </section>
        </div>
      )}
    </div>
  );
}
