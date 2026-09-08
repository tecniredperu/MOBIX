import type { SaleTaxCondition } from "../sale-types";
import { formatPen } from "./pos-shared";

export function PosTotalCard({
  taxCondition,
  discount,
  subtotal,
  tax,
  total,
  tendered,
  cashReceived,
  creditAmount,
  pendingAmount,
  change,
  creditReady,
  invalidOverpayment,
  paymentComplete,
  isPending,
  hasCart,
  onDiscountChange,
  onConfirm,
}: {
  taxCondition: SaleTaxCondition;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  tendered: number;
  cashReceived: number;
  creditAmount: number;
  pendingAmount: number;
  change: number;
  creditReady: boolean;
  invalidOverpayment: boolean;
  paymentComplete: boolean;
  isPending: boolean;
  hasCart: boolean;
  onDiscountChange: (value: number) => void;
  onConfirm: () => void;
}) {
  const statusClass = !creditReady || invalidOverpayment
    ? "pending"
    : change > 0.01
      ? "change"
      : paymentComplete
        ? "ok"
        : "pending";

  const statusLabel = !creditReady
    ? "Crédito no disponible"
    : invalidOverpayment
      ? "Revisa el exceso de pago"
      : paymentComplete
        ? "Cobro cubierto"
        : "Cobro pendiente";

  const statusValue = !creditReady
    ? "Revisa la línea de crédito del cliente"
    : invalidOverpayment
      ? "El vuelto solo puede salir de efectivo"
      : pendingAmount > 0.01
        ? `Falta ${formatPen(pendingAmount)}`
        : change > 0.01
          ? `Entregar vuelto: ${formatPen(change)}`
          : "Pago completo";

  const confirmText = isPending
    ? "Procesando venta..."
    : change > 0.01
      ? `Confirmar venta · Vuelto ${formatPen(change)}`
      : creditAmount > 0.01
        ? `Confirmar venta · Crédito ${formatPen(creditAmount)}`
        : "Confirmar venta";

  return (
    <section className="panel pos-total-card">
      <label className="discount-row">
        <span>Descuento</span>
        <div>
          <span>S/</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={discount}
            onChange={(event) => onDiscountChange(Number(event.target.value))}
          />
        </div>
      </label>
      <div className="summary-row">
        <span>{taxCondition === "TAXED" ? "Valor de venta" : "Subtotal"}</span>
        <strong>{formatPen(subtotal)}</strong>
      </div>
      <div className="summary-row">
        <span>IGV {taxCondition === "TAXED" ? "18%" : ""}</span>
        <strong>{formatPen(tax)}</strong>
      </div>
      <div className="summary-row total">
        <span>Total</span>
        <strong>{formatPen(total)}</strong>
      </div>

      <div className="cash-change-box">
        <div>
          <span>Total cubierto</span>
          <strong>{formatPen(tendered)}</strong>
        </div>
        <div className={change > 0.01 ? "change-value" : ""}>
          <span>Vuelto a entregar</span>
          <strong>{formatPen(change)}</strong>
        </div>
      </div>

      <div className={`payment-balance ${statusClass}`}>
        <span>
          {statusLabel}
          <small>
            Efectivo: {formatPen(cashReceived)}
            {creditAmount > 0 ? ` · Crédito: ${formatPen(creditAmount)}` : ""}
          </small>
        </span>
        <strong>{statusValue}</strong>
      </div>

      <p className="tax-note">
        Los precios de MOBIX son precios finales. El crédito genera una cuenta por cobrar vinculada a la venta y al cliente; no se considera ingreso de efectivo hasta que se registre un abono.
      </p>
      <button
        className="primary-button wide pos-confirm"
        type="button"
        disabled={isPending || !hasCart || !paymentComplete}
        onClick={onConfirm}
      >
        {confirmText}
      </button>
      <p className="form-footnote">
        Stock, IMEI, Kardex, pagos, crédito y auditoría se procesan en una sola transacción. Los abonos posteriores se registran desde la ficha del cliente.
      </p>
    </section>
  );
}
