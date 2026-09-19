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
  const disabled = isPending || !hasCart || !paymentComplete;

  const statusText = !creditReady
    ? "Revisa la línea de crédito"
    : invalidOverpayment
      ? "El exceso solo puede devolverse desde efectivo"
      : pendingAmount > 0.01
        ? "Falta " + formatPen(pendingAmount)
        : change > 0.01
          ? "Vuelto " + formatPen(change)
          : "Pago completo";

  return (
    <section className="panel pos-total-card pos-v5-total-card">
      <div className="pos-v5-discount-row">
        <span>Descuento</span>
        <div>
          <span>S/</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={discount || ""}
            placeholder="0.00"
            onChange={(event) => onDiscountChange(Number(event.target.value))}
          />
        </div>
      </div>

      <div className="pos-v5-summary-lines">
        <div>
          <span>{taxCondition === "TAXED" ? "Valor de venta" : "Subtotal"}</span>
          <strong>{formatPen(subtotal)}</strong>
        </div>
        <div>
          <span>Descuento</span>
          <strong>{discount > 0 ? "- " + formatPen(discount) : formatPen(0)}</strong>
        </div>
        <div>
          <span>IGV {taxCondition === "TAXED" ? "(18%)" : ""}</span>
          <strong>{formatPen(tax)}</strong>
        </div>
      </div>

      <div className="pos-v5-grand-total">
        <span>Total</span>
        <strong>{formatPen(total)}</strong>
      </div>

      <div className={paymentComplete ? "pos-v5-payment-status ok" : "pos-v5-payment-status pending"}>
        <span>{statusText}</span>
        <small>
          Cubierto: {formatPen(tendered)}
          {cashReceived > 0.01 ? " · Efectivo: " + formatPen(cashReceived) : ""}
          {creditAmount > 0.01 ? " · Crédito: " + formatPen(creditAmount) : ""}
        </small>
      </div>

      <button
        id="pos-confirm-sale"
        className="primary-button wide pos-v5-confirm"
        type="button"
        disabled={disabled}
        onClick={onConfirm}
      >
        <span>{isPending ? "Procesando venta..." : "Cobrar " + formatPen(total)}</span>
        <kbd>F9</kbd>
      </button>
    </section>
  );
}
