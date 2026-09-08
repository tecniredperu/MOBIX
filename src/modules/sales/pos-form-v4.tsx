"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { roundMoney } from "@/lib/money";
import { createSaleWithChangeAction } from "./sale-payment-action";
import {
  calculatePaymentCoverage,
  calculateSaleTotals,
} from "./sales-calculations";
import type {
  PosCatalogItem,
  PosCustomer,
  PosWarehouse,
  SaleDocumentType,
  SalePaymentMethod,
  SaleTaxCondition,
} from "./sale-types";
import { PosCartCard } from "./pos/pos-cart-card";
import { PosCatalogPanel } from "./pos/pos-catalog-panel";
import { PosCustomerCard } from "./pos/pos-customer-card";
import { PosPaymentCard } from "./pos/pos-payment-card";
import { PosTotalCard } from "./pos/pos-total-card";
import {
  stockFor,
  unitLabel,
  type CartLine,
  type PaymentLine,
} from "./pos/pos-shared";

type CustomerDocumentType = "DNI" | "RUC" | "CE" | "OTHER";

export function PosFormV4({
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
  const [customerDocumentType, setCustomerDocumentType] = useState<CustomerDocumentType>("DNI");
  const [customerDocument, setCustomerDocument] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [payments, setPayments] = useState<PaymentLine[]>([
    { id: "payment-1", method: "CASH", amount: 0, reference: "" },
  ]);
  const [error, setError] = useState("");

  const filteredCatalog = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return catalog;
    return catalog.filter((item) =>
      [item.name, item.brand, item.variant, item.sku ?? "", item.category]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [catalog, query]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId) ?? null,
    [customers, customerId],
  );

  const totals = useMemo(
    () => calculateSaleTotals({
      lines: cart.map((line) => ({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
      discount,
      taxCondition,
      taxRatePercent: 18,
    }),
    [cart, discount, taxCondition],
  );

  const coverage = useMemo(
    () => calculatePaymentCoverage({
      total: totals.total,
      payments,
      creditEnabled: selectedCustomer?.creditEnabled,
      availableCredit: selectedCustomer?.availableCredit,
    }),
    [payments, selectedCustomer, totals.total],
  );

  useEffect(() => {
    if (payments.length === 1) {
      setPayments((current) => [{ ...current[0], amount: totals.total }]);
    }
  }, [totals.total, payments.length]);

  function selectExistingCustomer(id: string) {
    setCustomerId(id);
    if (!id) {
      setError("");
      return;
    }

    const customer = customers.find((item) => item.id === id);
    if (!customer) return;
    if (["RUC", "DNI", "CE"].includes(customer.documentType ?? "")) {
      setCustomerDocumentType(customer.documentType as CustomerDocumentType);
    }
    setCustomerDocument(customer.documentNumber ?? "");
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone ?? "");
    setError("");
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
      const existing = current.find(
        (line) => line.variantId === item.variantId && line.type === item.type,
      );
      if (existing) {
        return current.map((line) =>
          line.key === existing.key
            ? {
                ...line,
                quantity: item.type === "SERVICE"
                  ? line.quantity + 1
                  : Math.min(stock, line.quantity + 1),
              }
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
        if (line.key !== key || line.type === "PHONE" || line.type === "SERIALIZED") {
          return line;
        }
        const item = catalog.find((catalogItem) => catalogItem.variantId === line.variantId);
        const max = item && line.type !== "SERVICE" ? stockFor(item, warehouseId) : 999999;
        return {
          ...line,
          quantity: Math.max(1, Math.min(max, Math.floor(quantity || 1))),
        };
      }),
    );
  }

  function updatePrice(key: string, value: number) {
    setCart((current) =>
      current.map((line) =>
        line.key === key ? { ...line, unitPrice: Math.max(0, value || 0) } : line,
      ),
    );
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
    setPayments((current) =>
      current.map((payment) =>
        payment.id === id ? { ...payment, amount: Math.max(0, amount || 0) } : payment,
      ),
    );
  }

  function updatePaymentMethod(id: string, method: SalePaymentMethod) {
    if (method === "CREDIT" && !selectedCustomer?.creditEnabled) {
      setError("Selecciona un cliente con línea de crédito habilitada antes de usar Crédito.");
    } else {
      setError("");
    }
    setPayments((current) =>
      current.map((payment) => (payment.id === id ? { ...payment, method } : payment)),
    );
  }

  function updatePaymentReference(id: string, reference: string) {
    setPayments((current) =>
      current.map((payment) => (payment.id === id ? { ...payment, reference } : payment)),
    );
  }

  function completePaymentBalance(id: string) {
    const otherPaid = payments
      .filter((payment) => payment.id !== id)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    setPaymentAmount(id, Math.max(0, roundMoney(totals.total - otherPaid)));
  }

  function submitSale() {
    setError("");
    startTransition(async () => {
      try {
        const result = await createSaleWithChangeAction({
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
        router.push(`/ventas/${result.id}?created=1&change=${result.change.toFixed(2)}`);
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
          <select
            value={warehouseId}
            onChange={(event) => setWarehouseId(event.target.value)}
            disabled={cart.length > 0}
          >
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.branchName} · {warehouse.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && (
        <div className="error-banner">
          <strong>No se pudo completar la operación</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="pos-layout">
        <PosCatalogPanel
          items={filteredCatalog}
          query={query}
          warehouseId={warehouseId}
          unitSelections={unitSelections}
          onQueryChange={setQuery}
          onUnitSelectionChange={(variantId, unitId) =>
            setUnitSelections((current) => ({ ...current, [variantId]: unitId }))}
          onAdd={addItem}
        />

        <aside className="pos-checkout">
          <PosCartCard
            cart={cart}
            onQuantityChange={updateQuantity}
            onPriceChange={updatePrice}
            onRemove={removeLine}
          />

          <PosCustomerCard
            customers={customers}
            customerId={customerId}
            selectedCustomer={selectedCustomer}
            customerDocumentType={customerDocumentType}
            customerDocument={customerDocument}
            customerName={customerName}
            customerPhone={customerPhone}
            documentType={documentType}
            taxCondition={taxCondition}
            onExistingCustomerChange={selectExistingCustomer}
            onCustomerDocumentTypeChange={setCustomerDocumentType}
            onCustomerDocumentChange={setCustomerDocument}
            onCustomerNameChange={setCustomerName}
            onCustomerPhoneChange={setCustomerPhone}
            onDocumentTypeChange={setDocumentType}
            onTaxConditionChange={setTaxCondition}
          />

          <PosPaymentCard
            payments={payments}
            selectedCustomer={selectedCustomer}
            creditAmount={coverage.creditAmount}
            creditReady={coverage.creditReady}
            onAdd={addPayment}
            onMethodChange={updatePaymentMethod}
            onAmountChange={setPaymentAmount}
            onReferenceChange={updatePaymentReference}
            onCompleteBalance={completePaymentBalance}
            onRemove={(id) => setPayments((current) => current.filter((item) => item.id !== id))}
          />

          <PosTotalCard
            taxCondition={taxCondition}
            discount={discount}
            subtotal={totals.subtotal}
            tax={totals.tax}
            total={totals.total}
            tendered={coverage.tendered}
            cashReceived={coverage.cashReceived}
            creditAmount={coverage.creditAmount}
            pendingAmount={coverage.pendingAmount}
            change={coverage.change}
            creditReady={coverage.creditReady}
            invalidOverpayment={coverage.invalidOverpayment}
            paymentComplete={coverage.paymentComplete}
            isPending={isPending}
            hasCart={cart.length > 0}
            onDiscountChange={setDiscount}
            onConfirm={submitSale}
          />
        </aside>
      </div>
    </div>
  );
}
