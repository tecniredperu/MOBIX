import { ChevronDown, CreditCard, Plus, Trash2 } from "lucide-react";
import type { PosCustomer, SalePaymentMethod } from "../sale-types";
import { formatPen, PAYMENT_LABELS, type PaymentLine } from "./pos-shared";

export function PosPaymentCard({
  payments,
  selectedCustomer,
  creditAmount,
  creditReady,
  onAdd,
  onMethodChange,
  onAmountChange,
  onReferenceChange,
  onCompleteBalance,
  onRemove,
}: {
  payments: PaymentLine[];
  selectedCustomer: PosCustomer | null;
  creditAmount: number;
  creditReady: boolean;
  onAdd: () => void;
  onMethodChange: (id: string, method: SalePaymentMethod) => void;
  onAmountChange: (id: string, amount: number) => void;
  onReferenceChange: (id: string, reference: string) => void;
  onCompleteBalance: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const totalPayment = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const firstMethod = payments[0]?.method ?? "CASH";
  const paymentLabel = payments.length > 1
    ? `${PAYMENT_LABELS[firstMethod]} + ${payments.length - 1} medio${payments.length - 1 === 1 ? "" : "s"}`
    : PAYMENT_LABELS[firstMethod];

  return (
    <details className="panel pos-collapsible pos-payment-card">
      <summary className="pos-collapsible-summary">
        <div className="pos-summary-icon"><CreditCard size={17} /></div>
        <div className="pos-summary-copy">
          <strong>Pago</strong>
          <span>{paymentLabel} · {formatPen(totalPayment)}</span>
        </div>
        <ChevronDown className="pos-summary-chevron" size={17} />
      </summary>

      <div className="pos-collapsible-body">
        <div className="pos-payment-toolbar">
          <span>Configura solo si usarás Yape, Plin, tarjeta, transferencia, crédito o pago mixto.</span>
          <button className="ghost-button" type="button" onClick={onAdd}>
            <Plus size={14} /> Agregar medio
          </button>
        </div>

        <div className="payment-lines">
          {payments.map((payment, index) => (
            <div className="payment-line" key={payment.id}>
              <span className="payment-index">{index + 1}</span>
              <label className="payment-field">
                <span>Medio</span>
                <select
                  value={payment.method}
                  onChange={(event) => onMethodChange(payment.id, event.target.value as SalePaymentMethod)}
                >
                  {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="payment-field">
                <span>
                  {payment.method === "CASH"
                    ? "Recibido"
                    : payment.method === "CREDIT"
                      ? "A crédito"
                      : "Importe"}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={payment.amount}
                  onChange={(event) => onAmountChange(payment.id, Number(event.target.value))}
                />
              </label>
              <label className="payment-field reference">
                <span>{payment.method === "CREDIT" ? "Nota" : "Referencia"}</span>
                <input
                  value={payment.reference}
                  onChange={(event) => onReferenceChange(payment.id, event.target.value)}
                  placeholder={payment.method === "CASH" || payment.method === "CREDIT"
                    ? "Opcional"
                    : "N.º operación"}
                />
              </label>
              <div className="payment-actions">
                <button className="ghost-button" type="button" onClick={() => onCompleteBalance(payment.id)}>
                  Completar saldo
                </button>
                {payments.length > 1 && (
                  <button
                    className="row-menu danger"
                    type="button"
                    onClick={() => onRemove(payment.id)}
                    aria-label="Eliminar medio de pago"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {creditAmount > 0.01 && (
          <div className={`pos-credit-warning ${creditReady ? "ok" : "error"}`}>
            {creditReady ? (
              <>
                <strong>Crédito disponible</strong>
                <span>
                  Se generará una cuenta por cobrar por {formatPen(creditAmount)} a {selectedCustomer?.creditDays ?? 0} días.
                </span>
              </>
            ) : (
              <>
                <strong>No se puede confirmar el crédito</strong>
                <span>
                  {selectedCustomer?.creditEnabled
                    ? `Disponible: ${formatPen(selectedCustomer.availableCredit)}.`
                    : "Selecciona un cliente con crédito habilitado."}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
