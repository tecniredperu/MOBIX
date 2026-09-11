import { ChevronDown, UserRound } from "lucide-react";
import type {
  PosCustomer,
  SaleDocumentType,
  SaleTaxCondition,
} from "../sale-types";
import { formatPen } from "./pos-shared";

type CustomerDocumentType = "DNI" | "RUC" | "CE" | "OTHER";

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
  customerDocumentType,
  customerDocument,
  customerName,
  customerPhone,
  documentType,
  taxCondition,
  onExistingCustomerChange,
  onCustomerDocumentTypeChange,
  onCustomerDocumentChange,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onDocumentTypeChange,
  onTaxConditionChange,
}: {
  customers: PosCustomer[];
  customerId: string;
  selectedCustomer: PosCustomer | null;
  customerDocumentType: CustomerDocumentType;
  customerDocument: string;
  customerName: string;
  customerPhone: string;
  documentType: SaleDocumentType;
  taxCondition: SaleTaxCondition;
  onExistingCustomerChange: (id: string) => void;
  onCustomerDocumentTypeChange: (type: CustomerDocumentType) => void;
  onCustomerDocumentChange: (value: string) => void;
  onCustomerNameChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onDocumentTypeChange: (type: SaleDocumentType) => void;
  onTaxConditionChange: (condition: SaleTaxCondition) => void;
}) {
  const customerLabel = selectedCustomer?.name || customerName.trim() || "Consumidor final";

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
          <label>
            <span>Cliente existente</span>
            <select value={customerId} onChange={(event) => onExistingCustomerChange(event.target.value)}>
              <option value="">Consumidor final / nuevo cliente</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}{customer.documentNumber ? ` · ${customer.documentNumber}` : ""}
                </option>
              ))}
            </select>
          </label>

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
                  : "Configura el crédito desde Clientes."}
              </small>
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

          {!customerId && (
            <div className="pos-new-customer-fields">
              <div className="pos-doc-row">
                <select
                  value={customerDocumentType}
                  onChange={(event) => onCustomerDocumentTypeChange(event.target.value as CustomerDocumentType)}
                >
                  <option value="DNI">DNI</option>
                  <option value="RUC">RUC</option>
                  <option value="CE">CE</option>
                  <option value="OTHER">Otro</option>
                </select>
                <input
                  value={customerDocument}
                  onChange={(event) => onCustomerDocumentChange(event.target.value)}
                  placeholder="N.º documento"
                />
              </div>
              <input
                value={customerName}
                onChange={(event) => onCustomerNameChange(event.target.value)}
                placeholder={customerDocumentType === "RUC" ? "Razón social" : "Nombres del cliente"}
              />
              <input
                value={customerPhone}
                onChange={(event) => onCustomerPhoneChange(event.target.value)}
                placeholder="Celular / WhatsApp (opcional)"
              />
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
