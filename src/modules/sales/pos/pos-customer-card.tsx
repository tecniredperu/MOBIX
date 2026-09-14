import { ChevronDown, Plus, UserRound } from "lucide-react";
import type {
  PosCustomer,
  SaleDocumentType,
  SaleTaxCondition,
} from "../sale-types";
import { formatPen } from "./pos-shared";

const DOCUMENT_LABELS: Record<SaleDocumentType, string> = {
  RECEIPT: "Boleta",
  INVOICE: "Factura",
  SALES_NOTE: "Nota de venta",
};

const TAX_LABELS: Record<SaleTaxCondition, string> = {
  TAXED: "Gravado",
  EXEMPT: "Exonerado",
  UNAFFECTED: "Inafecto",
};

export function PosCustomerCard({
  customers,
  customerId,
  selectedCustomer,
  documentType,
  taxCondition,
  onExistingCustomerChange,
  onAddCustomer,
  onDocumentTypeChange,
  onTaxConditionChange,
}: {
  customers: PosCustomer[];
  customerId: string;
  selectedCustomer: PosCustomer | null;
  documentType: SaleDocumentType;
  taxCondition: SaleTaxCondition;
  onExistingCustomerChange: (id: string) => void;
  onAddCustomer: () => void;
  onDocumentTypeChange: (type: SaleDocumentType) => void;
  onTaxConditionChange: (condition: SaleTaxCondition) => void;
}) {
  const customerLabel = selectedCustomer?.name || "Consumidor final";

  return (
    <details className="panel pos-collapsible pos-customer-card">
      <summary className="pos-collapsible-summary">
        <div className="pos-summary-icon"><UserRound size={17} /></div>
        <div className="pos-summary-copy">
          <strong>Cliente y comprobante</strong>
          <span>{customerLabel} · {DOCUMENT_LABELS[documentType]} · {TAX_LABELS[taxCondition]}</span>
        </div>
        <ChevronDown className="pos-summary-chevron" size={17} />
      </summary>

      <div className="pos-collapsible-body">
        <div className="pos-form-grid">
          <div className="pos-customer-select-row">
            <label>
              <span>Cliente</span>
              <select value={customerId} onChange={(event) => onExistingCustomerChange(event.target.value)}>
                <option value="">Consumidor final</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}{customer.documentNumber ? ` · ${customer.documentNumber}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary-button pos-add-customer-button" type="button" onClick={onAddCustomer}>
              <Plus size={15} /> Agregar cliente
            </button>
          </div>

          {selectedCustomer && (
            <div className={`pos-credit-profile ${selectedCustomer.creditEnabled ? "enabled" : "disabled"}`}>
              <div>
                <span>Línea de crédito</span>
                <strong>{selectedCustomer.creditEnabled ? formatPen(selectedCustomer.creditLimit) : "No habilitada"}</strong>
              </div>
              <div>
                <span>Deuda actual</span>
                <strong>{formatPen(selectedCustomer.outstanding)}</strong>
              </div>
              <div>
                <span>Disponible</span>
                <strong>{formatPen(selectedCustomer.availableCredit)}</strong>
              </div>
              <small>
                {selectedCustomer.creditEnabled
                  ? `Plazo habitual: ${selectedCustomer.creditDays} días`
                  : "La línea de crédito puede configurarse desde Clientes."}
              </small>
            </div>
          )}

          {documentType === "INVOICE" && !selectedCustomer && (
            <div className="pos-customer-required-note">
              Para emitir factura debes seleccionar o agregar un cliente con RUC válido.
            </div>
          )}

          <div className="pos-two-cols">
            <label>
              <span>Comprobante</span>
              <select
                value={documentType}
                onChange={(event) => onDocumentTypeChange(event.target.value as SaleDocumentType)}
              >
                <option value="RECEIPT">03 · Boleta de venta</option>
                <option value="INVOICE">01 · Factura</option>
                <option value="SALES_NOTE">Nota de venta</option>
              </select>
            </label>
            <label>
              <span>Condición tributaria</span>
              <select
                value={taxCondition}
                onChange={(event) => onTaxConditionChange(event.target.value as SaleTaxCondition)}
              >
                <option value="TAXED">Gravado</option>
                <option value="EXEMPT">Exonerado</option>
                <option value="UNAFFECTED">Inafecto</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </details>
  );
}
