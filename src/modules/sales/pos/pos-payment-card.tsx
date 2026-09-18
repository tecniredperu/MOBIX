import {
  Banknote,
  CreditCard,
  Landmark,
  Plus,
  Smartphone,
  Trash2,
  WalletCards,
} from "lucide-react";
import type { PosCustomer, SalePaymentMethod } from "../sale-types";
import { formatPen, PAYMENT_LABELS, type PaymentLine } from "./pos-shared";

const QUICK_METHODS: Array<{
  value: Exclude<SalePaymentMethod, "CREDIT" | "OTHER">;
  label: string;
  icon: typeof Banknote;
}> = [
  { value: "CASH", label: "Efectivo", icon: Banknote },
  { value: "YAPE", label: "Yape", icon: Smartphone },
  { value: "PLIN", label: "Plin", icon: Smartphone },
  { value: "CARD", label: "Tarjeta", icon: CreditCard },
  { value: "TRANSFER", label: "Transferencia", icon: Landmark },
];

export function PosPaymentCard({
  payments,
  total,
  change,
  pendingAmount,
  selectedCustomer,
  creditAmount,
  creditReady,
  onSetSingleMethod,
  onEnableMixed,
  onAdd,
  onMethodChange,
  onAmountChange,
  onReferenceChange,
  onCompleteBalance,
  onRemove,
}: {
  payments: PaymentLine[];
  total: number;
  change: number;
  pendingAmount: number;
  selectedCustomer: PosCustomer | null;
  creditAmount: number;
  creditReady: boolean;
  onSetSingleMethod: (method: SalePaymentMethod) => void;
  onEnableMixed: () => void;
  onAdd: () => void;
  onMethodChange: (id: string, method: SalePaymentMethod) => void;
  onAmountChange: (id: string, amount: number) => void;
  onReferenceChange: (id: string, reference: string) => void;
  onCompleteBalance: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const mixed = payments.length > 1;
  const first = payments[0];
  const firstMethod = first?.method ?? "CASH";
  const singlePayment = !mixed ? first : null;
  const digital = singlePayment && !["CASH", "CREDIT"].includes(singlePayment.method);

  return (
    <section className="panel pos-payment-card pos-v5-payment-card">
      <div className="pos-v5-section-title">
        <div>
          <WalletCards size={17} />
          <strong>Método de pago</strong>
        </div>
        <span>{formatPen(total)}</span>
      </div>

      <div className="pos-v5-payment-body">
        <div className="pos-payment-method-buttons" id="pos-payment-methods">
          {QUICK_METHODS.map((method) => {
            const Icon = method.icon;
            const active = !mixed && firstMethod === method.value;
            return (
              <button
                key={method.value}
                className={active ? "active" : ""}
                type="button"
                onClick={() => onSetSingleMethod(method.value)}
              >
                <Icon size={14} />
                <span>{method.label}</span>
              </button>
            );
          })}
          <button
            className={mixed ? "active mixed" : "mixed"}
            type="button"
            onClick={onEnableMixed}
          >
            <WalletCards size={14} />
            <span>Pago mixto</span>
          </button>
        </div>

        {!mixed && singlePayment && (
          <div className="pos-single-payment">
            <label className="pos-single-payment-amount">
              <span>{singlePayment.method === "CASH" ? "Recibido con" : "Importe"}</span>
              <div>
                <span>S/</span>
                <input
                  id="pos-payment-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={singlePayment.amount || ""}
                  placeholder="0.00"
                  onChange={(event) => onAmountChange(singlePayment.id, Number(event.target.value))}
                />
              </div>
            </label>

            {singlePayment.method === "CASH" && (
              <div className={change > 0.01 ? "pos-single-change active" : "pos-single-change"}>
                <span>Vuelto</span>
                <strong>{formatPen(change)}</strong>
              </div>
            )}

            {digital && (
              <label className="pos-single-reference">
                <span>N.º operación / referencia</span>
                <input
                  value={singlePayment.reference}
                  onChange={(event) => onReferenceChange(singlePayment.id, event.target.value)}
                  placeholder="Opcional"
                />
              </label>
            )}

            {singlePayment.method === "CREDIT" && (
              <div className={creditReady ? "pos-credit-warning ok" : "pos-credit-warning error"}>
                <strong>{creditReady ? "Crédito disponible" : "Crédito no disponible"}</strong>
                <span>
                  {creditReady
                    ? "Se generará una cuenta por cobrar por " + formatPen(creditAmount) + "."
                    : selectedCustomer?.creditEnabled
                      ? "Disponible: " + formatPen(selectedCustomer.availableCredit) + "."
                      : "Selecciona un cliente con crédito habilitado."}
                </span>
              </div>
            )}
          </div>
        )}

        {mixed && (
          <div className="pos-mixed-payment">
            <div className="pos-mixed-heading">
              <span>Distribuye el total entre los medios de pago.</span>
              <button className="ghost-button" type="button" onClick={onAdd}>
                <Plus size={13} />
                Agregar medio
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
                    <span>{payment.method === "CASH" ? "Recibido" : "Importe"}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={payment.amount || ""}
                      placeholder="0.00"
                      onChange={(event) => onAmountChange(payment.id, Number(event.target.value))}
                    />
                  </label>

                  <label className="payment-field reference">
                    <span>{payment.method === "CREDIT" ? "Nota" : "Referencia"}</span>
                    <input
                      value={payment.reference}
                      onChange={(event) => onReferenceChange(payment.id, event.target.value)}
                      placeholder={payment.method === "CASH" || payment.method === "CREDIT" ? "Opcional" : "N.º operación"}
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

            <div className={pendingAmount > 0.01 ? "pos-mixed-balance pending" : "pos-mixed-balance ok"}>
              <span>{pendingAmount > 0.01 ? "Falta distribuir" : "Pago cubierto"}</span>
              <strong>{pendingAmount > 0.01 ? formatPen(pendingAmount) : formatPen(total)}</strong>
            </div>
          </div>
        )}

        {creditAmount > 0.01 && mixed && (
          <div className={creditReady ? "pos-credit-warning ok" : "pos-credit-warning error"}>
            <strong>{creditReady ? "Crédito disponible" : "No se puede confirmar el crédito"}</strong>
            <span>
              {creditReady
                ? "Cuenta por cobrar: " + formatPen(creditAmount) + " a " + (selectedCustomer?.creditDays ?? 0) + " días."
                : selectedCustomer?.creditEnabled
                  ? "Disponible: " + formatPen(selectedCustomer.availableCredit) + "."
                  : "Selecciona un cliente con crédito habilitado."}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
