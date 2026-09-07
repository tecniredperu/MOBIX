"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Minus, Plus, Search, ShoppingCart, Smartphone, Trash2, UserRound } from "lucide-react";
import { createSaleAction } from "./sale-actions";
import type {
  PosCatalogItem,
  PosCustomer,
  PosWarehouse,
  SaleDocumentType,
  SalePaymentMethod,
  SaleTaxCondition,
} from "./sale-types";

type CartLine = {
  key: string;
  variantId: string;
  type: PosCatalogItem["type"];
  name: string;
  variant: string;
  quantity: number;
  unitPrice: number;
  minimumSalePrice: number;
  selectedUnitIds: string[];
  unitLabel?: string;
};

type PaymentLine = {
  id: string;
  method: SalePaymentMethod;
  amount: number;
  reference: string;
};

const PAYMENT_LABELS: Record<SalePaymentMethod, string> = {
  CASH: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

function money(value: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 }).format(value || 0);
}

function stockFor(item: PosCatalogItem, warehouseId: string) {
  if (item.type === "SERVICE") return 999999;
  if (item.type === "PHONE" || item.type === "SERIALIZED") {
    return item.units.filter((unit) => unit.warehouseId === warehouseId).length;
  }
  return item.balances.find((balance) => balance.warehouseId === warehouseId)?.quantity ?? 0;
}

function unitLabel(unit: PosCatalogItem["units"][number]) {
  return unit.imei1 ? `IMEI ${unit.imei1}` : unit.serial ? `Serie ${unit.serial}` : "Equipo serializado";
}

export function PosForm({
  warehouses,
  catalog,
  customers,
}: {
  warehouses: PosWarehouse[];
  catalog: PosCatalogItem[];
  customers: PosCustomer[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [unitSelections, setUnitSelections] = useState<Record<string, string>>({});
  const [documentType, setDocumentType] = useState<SaleDocumentType>("RECEIPT");
  const [taxCondition, setTaxCondition] = useState<SaleTaxCondition>("TAXED");
  const [discount, setDiscount] = useState(0);
  const [customerId, setCustomerId] = useState("");
  const [customerDocumentType, setCustomerDocumentType] = useState<"DNI" | "RUC" | "CE" | "OTHER">("DNI");
  const [customerDocument, setCustomerDocument] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [payments, setPayments] = useState<PaymentLine[]>([
    { id: "payment-1", method: "CASH", amount: 0, reference: "" },
  ]);
  const [error, setError] = useState("");

  const filteredCatalog = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalog.filter((item) => {
      if (!normalized) return true;
      return [item.name, item.brand, item.variant, item.sku ?? "", item.category]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [catalog, query]);

  const gross = useMemo(() => cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0), [cart]);
  const total = Math.max(0, Math.round((gross - Number(discount || 0)) * 100) / 100);
  const subtotal = taxCondition === "TAXED" ? Math.round((total / 1.18) * 100) / 100 : total;
  const tax = taxCondition === "TAXED" ? Math.round((total - subtotal) * 100) / 100 : 0;
  const paid = Math.round(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) * 100) / 100;
  const balance = Math.round((total - paid) * 100) / 100;

  useEffect(() => {
    if (payments.length === 1) {
      setPayments((current) => [{ ...current[0], amount: total }]);
    }
  }, [total, payments.length]);

  function selectExistingCustomer(id: string) {
    setCustomerId(id);
    if (!id) return;
    const customer = customers.find((item) => item.id === id);
    if (!customer) return;
    if (customer.documentType === "RUC" || customer.documentType === "DNI" || customer.documentType === "CE") {
      setCustomerDocumentType(customer.documentType);
    }
    setCustomerDocument(customer.documentNumber ?? "");
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone ?? "");
  }

  function addItem(item: PosCatalogItem) {
    const stock = stockFor(item, warehouseId);
    if (item.type !== "SERVICE" && stock <= 0) return;

    if (item.type === "PHONE" || item.type === "SERIALIZED") {
      const availableUnits = item.units.filter((unit) => unit.warehouseId === warehouseId);
      const selectedId = unitSelections[item.variantId] || availableUnits[0]?.id;
      const selected = availableUnits.find((unit) => unit.id === selectedId);
      if (!selected) return;
      if (cart.some((line) => line.selectedUnitIds.includes(selected.id))) {
        setError("Ese IMEI/equipo ya está agregado a la venta.");
        return;
      }
      setCart((current) => [
        ...current,
        {
          key: selected.id,
          variantId: item.variantId,
          type: item.type,
          name: item.name,
          variant: item.variant,
          quantity: 1,
          unitPrice: item.salePrice,
          minimumSalePrice: item.minimumSalePrice,
          selectedUnitIds: [selected.id],
          unitLabel: unitLabel(selected),
        },
      ]);
      setError("");
      return;
    }

    setCart((current) => {
      const existing = current.find((line) => line.variantId === item.variantId && line.type === item.type);
      if (existing) {
        return current.map((line) =>
          line.key === existing.key
            ? { ...line, quantity: item.type === "SERVICE" ? line.quantity + 1 : Math.min(stock, line.quantity + 1) }
            : line,
        );
      }
      return [
        ...current,
        {
          key: item.variantId,
          variantId: item.variantId,
          type: item.type,
          name: item.name,
          variant: item.variant,
          quantity: 1,
          unitPrice: item.salePrice,
          minimumSalePrice: item.minimumSalePrice,
          selectedUnitIds: [],
        },
      ];
    });
    setError("");
  }

  function updateQuantity(key: string, quantity: number) {
    setCart((current) =>
      current.map((line) => {
        if (line.key !== key || line.type === "PHONE" || line.type === "SERIALIZED") return line;
        const item = catalog.find((catalogItem) => catalogItem.variantId === line.variantId);
        const max = item && line.type !== "SERVICE" ? stockFor(item, warehouseId) : 999999;
        return { ...line, quantity: Math.max(1, Math.min(max, Math.floor(quantity || 1))) };
      }),
    );
  }

  function updatePrice(key: string, value: number) {
    setCart((current) => current.map((line) => (line.key === key ? { ...line, unitPrice: Math.max(0, value || 0) } : line)));
  }

  function removeLine(key: string) {
    setCart((current) => current.filter((line) => line.key !== key));
  }

  function addPayment() {
    setPayments((current) => [
      ...current,
      { id: `payment-${Date.now()}`, method: "YAPE", amount: 0, reference: "" },
    ]);
  }

  function setPaymentAmount(id: string, amount: number) {
    setPayments((current) => current.map((payment) => (payment.id === id ? { ...payment, amount: Math.max(0, amount || 0) } : payment)));
  }

  function completePaymentBalance(id: string) {
    const otherPaid = payments.filter((payment) => payment.id !== id).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    setPaymentAmount(id, Math.max(0, Math.round((total - otherPaid) * 100) / 100));
  }

  function submitSale() {
    setError("");
    startTransition(async () => {
      try {
        const result = await createSaleAction({
          warehouseId,
          customerId: customerId || undefined,
          customer: customerId
            ? undefined
            : {
                documentType: customerDocumentType,
                documentNumber: customerDocument,
                name: customerName,
                phone: customerPhone,
              },
          documentType,
          taxCondition,
          discount: Number(discount || 0),
          lines: cart.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
            unitPrice: Number(line.unitPrice),
            selectedUnitIds: line.selectedUnitIds,
          })),
          payments: payments.map((payment) => ({
            method: payment.method,
            amount: Number(payment.amount),
            reference: payment.reference,
          })),
        });
        router.push(`/ventas/${result.id}?created=1`);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo completar la venta.");
      }
    });
  }

  return (
    <div className="pos-page page-stack">
      <section className="page-heading pos-heading">
        <div>
          <span className="eyebrow">VENTAS</span>
          <h1>Punto de venta</h1>
          <p>Venta rápida de celulares por IMEI, accesorios y servicios. Importes expresados en soles.</p>
        </div>
        <label className="pos-warehouse">
          <span>Sucursal / almacén</span>
          <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} disabled={cart.length > 0}>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>{warehouse.branchName} · {warehouse.name}</option>
            ))}
          </select>
        </label>
      </section>

      {error && <div className="error-banner"><strong>No se pudo completar la operación</strong><span>{error}</span></div>}

      <div className="pos-layout">
        <section className="pos-catalog-panel panel">
          <div className="pos-search">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto, marca, SKU o modelo..." />
          </div>
          <div className="pos-catalog-list">
            {filteredCatalog.map((item) => {
              const stock = stockFor(item, warehouseId);
              const availableUnits = item.units.filter((unit) => unit.warehouseId === warehouseId);
              const serialized = item.type === "PHONE" || item.type === "SERIALIZED";
              return (
                <article className="pos-product" key={item.variantId}>
                  <div className="pos-product-icon">{serialized ? <Smartphone size={18} /> : item.type === "SERVICE" ? <CreditCard size={18} /> : item.name.slice(0, 1)}</div>
                  <div className="pos-product-copy">
                    <strong>{item.name}</strong>
                    <span>{item.brand} · {item.variant}</span>
                    <small>{item.type === "SERVICE" ? "Servicio" : `${stock} disponible${stock === 1 ? "" : "s"}`}</small>
                  </div>
                  {serialized && (
                    <select
                      className="pos-unit-select"
                      value={unitSelections[item.variantId] ?? availableUnits[0]?.id ?? ""}
                      onChange={(event) => setUnitSelections((current) => ({ ...current, [item.variantId]: event.target.value }))}
                      disabled={!availableUnits.length}
                    >
                      {!availableUnits.length && <option value="">Sin equipos disponibles</option>}
                      {availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unitLabel(unit)}</option>)}
                    </select>
                  )}
                  <div className="pos-product-price"><strong>{money(item.salePrice)}</strong><span>Precio venta</span></div>
                  <button className="secondary-button pos-add" type="button" onClick={() => addItem(item)} disabled={item.type !== "SERVICE" && stock <= 0}>
                    <Plus size={15} /> Agregar
                  </button>
                </article>
              );
            })}
            {!filteredCatalog.length && <div className="purchase-empty"><Search size={22} /><strong>No encontramos productos</strong><span>Prueba con otra búsqueda.</span></div>}
          </div>
        </section>

        <aside className="pos-checkout">
          <section className="panel pos-cart-card">
            <div className="pos-card-title"><div><ShoppingCart size={18} /><strong>Venta actual</strong></div><span>{cart.length} línea{cart.length === 1 ? "" : "s"}</span></div>
            <div className="pos-cart-lines">
              {cart.map((line) => (
                <div className="pos-cart-line" key={line.key}>
                  <div className="pos-cart-line-head">
                    <div><strong>{line.name}</strong><span>{line.variant}</span>{line.unitLabel && <code>{line.unitLabel}</code>}</div>
                    <button className="row-menu danger" type="button" onClick={() => removeLine(line.key)}><Trash2 size={16} /></button>
                  </div>
                  <div className="pos-cart-controls">
                    {(line.type === "PHONE" || line.type === "SERIALIZED") ? (
                      <span className="fixed-qty">1 und.</span>
                    ) : (
                      <div className="qty-control">
                        <button type="button" onClick={() => updateQuantity(line.key, line.quantity - 1)}><Minus size={13} /></button>
                        <input type="number" min="1" value={line.quantity} onChange={(event) => updateQuantity(line.key, Number(event.target.value))} />
                        <button type="button" onClick={() => updateQuantity(line.key, line.quantity + 1)}><Plus size={13} /></button>
                      </div>
                    )}
                    <label className="price-control"><span>S/</span><input type="number" min={line.minimumSalePrice} step="0.01" value={line.unitPrice} onChange={(event) => updatePrice(line.key, Number(event.target.value))} /></label>
                    <strong>{money(line.quantity * line.unitPrice)}</strong>
                  </div>
                </div>
              ))}
              {!cart.length && <div className="pos-empty-cart"><ShoppingCart size={24} /><strong>Carrito vacío</strong><span>Agrega productos desde el catálogo.</span></div>}
            </div>
          </section>

          <section className="panel pos-customer-card">
            <div className="pos-card-title"><div><UserRound size={18} /><strong>Cliente y comprobante</strong></div></div>
            <div className="pos-form-grid">
              <label><span>Cliente existente</span><select value={customerId} onChange={(event) => selectExistingCustomer(event.target.value)}><option value="">Consumidor final / nuevo cliente</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.documentNumber ? ` · ${customer.documentNumber}` : ""}</option>)}</select></label>
              <div className="pos-two-cols">
                <label><span>Comprobante</span><select value={documentType} onChange={(event) => setDocumentType(event.target.value as SaleDocumentType)}><option value="RECEIPT">03 · Boleta de venta</option><option value="INVOICE">01 · Factura</option><option value="SALES_NOTE">Nota de venta</option></select></label>
                <label><span>Condición</span><select value={taxCondition} onChange={(event) => setTaxCondition(event.target.value as SaleTaxCondition)}><option value="TAXED">Gravado</option><option value="EXEMPT">Exonerado</option><option value="UNAFFECTED">Inafecto</option></select></label>
              </div>
              {!customerId && (
                <>
                  <div className="pos-doc-row"><select value={customerDocumentType} onChange={(event) => setCustomerDocumentType(event.target.value as typeof customerDocumentType)}><option value="DNI">DNI</option><option value="RUC">RUC</option><option value="CE">CE</option><option value="OTHER">Otro</option></select><input value={customerDocument} onChange={(event) => setCustomerDocument(event.target.value)} placeholder="N.º documento" /></div>
                  <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder={customerDocumentType === "RUC" ? "Razón social" : "Nombres del cliente"} />
                  <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Celular / WhatsApp (opcional)" />
                </>
              )}
            </div>
          </section>

          <section className="panel pos-payment-card">
            <div className="pos-card-title"><div><CreditCard size={18} /><strong>Pago</strong></div><button className="ghost-button" type="button" onClick={addPayment}><Plus size={14} /> Pago mixto</button></div>
            <div className="payment-lines">
              {payments.map((payment, index) => (
                <div className="payment-line" key={payment.id}>
                  <select value={payment.method} onChange={(event) => setPayments((current) => current.map((item) => item.id === payment.id ? { ...item, method: event.target.value as SalePaymentMethod } : item))}>{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                  <input type="number" min="0" step="0.01" value={payment.amount} onChange={(event) => setPaymentAmount(payment.id, Number(event.target.value))} />
                  <input value={payment.reference} onChange={(event) => setPayments((current) => current.map((item) => item.id === payment.id ? { ...item, reference: event.target.value } : item))} placeholder="Referencia" />
                  <button className="ghost-button" type="button" onClick={() => completePaymentBalance(payment.id)}>Saldo</button>
                  {payments.length > 1 && <button className="row-menu danger" type="button" onClick={() => setPayments((current) => current.filter((item) => item.id !== payment.id))}><Trash2 size={15} /></button>}
                  <span className="payment-index">{index + 1}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel pos-total-card">
            <label className="discount-row"><span>Descuento</span><div><span>S/</span><input type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} /></div></label>
            <div className="summary-row"><span>{taxCondition === "TAXED" ? "Valor de venta" : "Subtotal"}</span><strong>{money(subtotal)}</strong></div>
            <div className="summary-row"><span>IGV {taxCondition === "TAXED" ? "18%" : ""}</span><strong>{money(tax)}</strong></div>
            <div className="summary-row total"><span>Total</span><strong>{money(total)}</strong></div>
            <div className={`payment-balance ${Math.abs(balance) <= .01 ? "ok" : "pending"}`}><span>Pagado {money(paid)}</span><strong>{Math.abs(balance) <= .01 ? "Pago completo" : balance > 0 ? `Falta ${money(balance)}` : `Exceso ${money(Math.abs(balance))}`}</strong></div>
            <p className="tax-note">Los precios de venta de MOBIX se consideran precios finales. En operaciones gravadas el sistema desglosa el IGV del 18% incluido en el total.</p>
            <button className="primary-button wide pos-confirm" type="button" disabled={isPending || !cart.length || Math.abs(balance) > .01} onClick={submitSale}>{isPending ? "Procesando venta..." : "Confirmar venta"}</button>
            <p className="form-footnote">MOBIX genera el correlativo interno y registra stock, IMEI, Kardex, pagos y auditoría en una sola transacción. El envío electrónico a SUNAT se habilitará en el módulo de facturación electrónica.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
