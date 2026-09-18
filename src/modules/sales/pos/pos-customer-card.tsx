import {
  Building2,
  LoaderCircle,
  Plus,
  ReceiptText,
  Search,
  UserRound,
  X,
} from "lucide-react";
import type {
  PosCustomer,
  SaleDocumentType,
  SaleTaxCondition,
} from "../sale-types";

const DOCUMENT_OPTIONS: Array<{
  value: SaleDocumentType;
  label: string;
  short: string;
}> = [
  { value: "RECEIPT", label: "Boleta", short: "03" },
  { value: "INVOICE", label: "Factura", short: "01" },
  { value: "SALES_NOTE", label: "Nota de venta", short: "NV" },
];

export function PosCustomerCard({
  customers,
  customerId,
  customerQuery,
  isSearchingCustomers,
  selectedCustomer,
  documentType,
  taxCondition,
  onCustomerQueryChange,
  onExistingCustomerChange,
  onAddCustomer,
  onDocumentTypeChange,
  onTaxConditionChange,
}: {
  customers: PosCustomer[];
  customerId: string;
  customerQuery: string;
  isSearchingCustomers: boolean;
  selectedCustomer: PosCustomer | null;
  documentType: SaleDocumentType;
  taxCondition: SaleTaxCondition;
  onCustomerQueryChange: (value: string) => void;
  onExistingCustomerChange: (id: string) => void;
  onAddCustomer: () => void;
  onDocumentTypeChange: (type: SaleDocumentType) => void;
  onTaxConditionChange: (condition: SaleTaxCondition) => void;
}) {
  void customerId;
  const invoiceNeedsRuc = documentType === "INVOICE"
    && (
      !selectedCustomer
      || selectedCustomer.documentType !== "RUC"
      || (selectedCustomer.documentNumber ?? "").replace(/\D/g, "").length !== 11
    );

  const selectedDocumentLabel = selectedCustomer
    ? (selectedCustomer.documentType || "Documento")
      + (selectedCustomer.documentNumber ? ": " + selectedCustomer.documentNumber : "")
      + (selectedCustomer.phone ? " · " + selectedCustomer.phone : "")
    : "";

  return (
    <section className="panel pos-customer-card pos-v5-customer-card">
      <div className="pos-v5-section-title">
        <div>
          <UserRound size={17} />
          <strong>Cliente</strong>
        </div>
        <button className="pos-v5-new-customer" type="button" onClick={onAddCustomer}>
          <Plus size={14} />
          Nuevo cliente
        </button>
      </div>

      <div className="pos-v5-customer-body">
        {selectedCustomer ? (
          <div className="pos-selected-customer">
            <div className="pos-selected-customer-icon">
              {selectedCustomer.documentType === "RUC" ? <Building2 size={18} /> : <UserRound size={18} />}
            </div>
            <div className="pos-selected-customer-copy">
              <strong>{selectedCustomer.name}</strong>
              <span>{selectedDocumentLabel}</span>
            </div>
            <button
              className="pos-selected-customer-clear"
              type="button"
              onClick={() => {
                onExistingCustomerChange("");
                onCustomerQueryChange("");
              }}
              aria-label="Usar consumidor final"
              title="Cambiar a consumidor final"
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <>
            <div className="pos-customer-search">
              {isSearchingCustomers ? <LoaderCircle className="mobix-spin" size={16} /> : <Search size={16} />}
              <input
                id="pos-customer-search"
                value={customerQuery}
                onChange={(event) => onCustomerQueryChange(event.target.value)}
                placeholder="Buscar cliente por DNI, RUC, nombre o WhatsApp..."
                autoComplete="off"
                spellCheck={false}
              />
              <span className="pos-consumer-final-chip">Consumidor final</span>
            </div>

            {customerQuery.trim().length >= 2 && (
              <div className="pos-customer-results">
                {customers.slice(0, 6).map((customer) => {
                  const detail = (customer.documentType || "Doc.")
                    + (customer.documentNumber ? " " + customer.documentNumber : "")
                    + (customer.phone ? " · " + customer.phone : "");

                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => {
                        onExistingCustomerChange(customer.id);
                        onCustomerQueryChange("");
                      }}
                    >
                      <span className="pos-customer-result-icon">
                        {customer.documentType === "RUC" ? <Building2 size={14} /> : <UserRound size={14} />}
                      </span>
                      <span>
                        <strong>{customer.name}</strong>
                        <small>{detail}</small>
                      </span>
                    </button>
                  );
                })}
                {!isSearchingCustomers && customers.length === 0 && (
                  <div className="pos-customer-no-results">
                    No encontramos ese cliente. Puedes registrarlo sin salir del POS.
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div className="pos-v5-document-row">
          <div className="pos-v5-document-label">
            <ReceiptText size={14} />
            <span>Comprobante</span>
          </div>
          <div className="pos-document-buttons" id="pos-document-types">
            {DOCUMENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={documentType === option.value ? "active" : ""}
                type="button"
                onClick={() => onDocumentTypeChange(option.value)}
              >
                <small>{option.short}</small>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="pos-tax-row">
          <span>Condición tributaria</span>
          <select
            value={taxCondition}
            onChange={(event) => onTaxConditionChange(event.target.value as SaleTaxCondition)}
          >
            <option value="TAXED">Gravado</option>
            <option value="EXEMPT">Exonerado</option>
            <option value="UNAFFECTED">Inafecto</option>
          </select>
        </div>

        {invoiceNeedsRuc && (
          <div className="pos-customer-required-note">
            Para Factura selecciona un cliente con RUC válido de 11 dígitos.
          </div>
        )}
      </div>
    </section>
  );
}
