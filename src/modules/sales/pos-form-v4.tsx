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
  PosUnit,
  PosWarehouse,
  SaleDocumentType,
  SalePaymentMethod,
  SaleTaxCondition,
} from "./sale-types";
import { PosCartCard } from "./pos/pos-cart-card";
import { PosCatalogPanel } from "./pos/pos-catalog-panel";
import { PosCustomerCard } from "./pos/pos-customer-card";
import { PosCustomerModal } from "./pos/pos-customer-modal";
import { PosPaymentCard } from "./pos/pos-payment-card";
import { PosTotalCard } from "./pos/pos-total-card";
import {
  stockFor,
  unitLabel,
  type CartLine,
  type PaymentLine,
} from "./pos/pos-shared";

function registryFrom(items: PosCatalogItem[]) {
  return Object.fromEntries(items.map((item) => [item.variantId, item]));
}

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
  const [catalogItems, setCatalogItems] = useState<PosCatalogItem[]>(catalog);
  const [catalogRegistry, setCatalogRegistry] = useState<Record<string, PosCatalogItem>>(() => registryFrom(catalog));
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [unitSelections, setUnitSelections] = useState<Record<string, string>>({});
  const [unitCache, setUnitCache] = useState<Record<string, PosUnit[]>>({});
  const [unitLoading, setUnitLoading] = useState<Record<string, boolean>>({});
  const [documentType, setDocumentType] = useState<SaleDocumentType>("RECEIPT");
  const [taxCondition, setTaxCondition] = useState<SaleTaxCondition>("TAXED");
  const [discount, setDiscount] = useState(0);
  const [customerId, setCustomerId] = useState("");
  const [availableCustomers, setAvailableCustomers] = useState<PosCustomer[]>(customers);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [payments, setPayments] = useState<PaymentLine[]>([
    { id: "payment-1", method: "CASH", amount: 0, reference: "" },
  ]);
  const [error, setError] = useState("");

  useEffect(() => {
    const normalized = query.trim();

    if (!normalized) {
      setCatalogItems(catalog);
      setCatalogLoading(false);
      return;
    }

    if (normalized.length < 2) {
      const local = catalog.filter((item) =>
        [item.name, item.brand, item.variant, item.sku ?? "", item.category]
          .join(" ")
          .toLowerCase()
          .includes(normalized.toLowerCase()),
      );
      setCatalogItems(local);
      setCatalogLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCatalogLoading(true);
      try {
        const response = await fetch(`/api/pos/catalog?q=${encodeURIComponent(normalized)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "No se pudo buscar el catálogo.");
        const items = (body.items ?? []) as PosCatalogItem[];
        setCatalogItems(items);
        setCatalogRegistry((current) => ({ ...current, ...registryFrom(items) }));
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "No se pudo buscar el catálogo.");
      } finally {
        setCatalogLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [catalog, query]);

  const visibleCatalog = useMemo(
    () => catalogItems.map((item) => ({
      ...item,
      units: unitCache[`${item.variantId}:${warehouseId}`] ?? [],
    })),
    [catalogItems, unitCache, warehouseId],
  );

  const selectedCustomer = useMemo(
    () => availableCustomers.find((customer) => customer.id === customerId) ?? null,
    [availableCustomers, customerId],
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

  function selectExistingCustomer(id: string) {
    setCustomerId(id);
    setError("");
  }

  function handleCustomerCreated(customer: PosCustomer) {
    setAvailableCustomers((current) => {
      const exists = current.some((item) => item.id === customer.id);
      return exists ? current : [customer, ...current];
    });
    setCustomerId(customer.id);
    setError("");
  }

  async function loadUnits(item: PosCatalogItem) {
    const cacheKey = `${item.variantId}:${warehouseId}`;
    const cached = unitCache[cacheKey];
    if (cached) return cached;

    setUnitLoading((current) => ({ ...current, [cacheKey]: true }));
    try {
      const response = await fetch(
        `/api/pos/units?variantId=${encodeURIComponent(item.variantId)}&warehouseId=${encodeURIComponent(warehouseId)}`,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar los IMEI disponibles.");
      const units = (body.units ?? []) as PosUnit[];
      setUnitCache((current) => ({ ...current, [cacheKey]: units }));
      if (units[0]) {
        setUnitSelections((current) => current[item.variantId]
          ? current
          : { ...current, [item.variantId]: units[0].id });
      }
      return units;
    } finally {
      setUnitLoading((current) => ({ ...current, [cacheKey]: false }));
    }
  }

  async function addItem(item: PosCatalogItem) {
    const stock = stockFor(item, warehouseId);
    if (item.type !== "SERVICE" && stock <= 0) return;

    if (item.type === "PHONE" || item.type === "SERIALIZED") {
      try {
        const availableUnits = await loadUnits(item);
        const selectedId = unitSelections[item.variantId] || availableUnits[0]?.id;
        const selected = availableUnits.find((unit) => unit.id === selectedId) ?? availableUnits[0];
        if (!selected) {
          setError("No quedan equipos disponibles en este almacén. Actualiza la venta e inténtalo nuevamente.");
          return;
        }
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
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo consultar el IMEI del equipo.");
      }
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
        const item = catalogRegistry[line.variantId];
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

    if (totals.total > 0.01 && !payments.some((payment) => Number(payment.amount) > 0.009)) {
      setError("Ingresa el monto recibido antes de confirmar la venta.");
      return;
    }
    if (!coverage.paymentComplete) {
      setError(`El cobro está incompleto. Falta S/ ${coverage.pendingAmount.toFixed(2)}.`);
      return;
    }

    startTransition(async () => {
      try {
        const result = await createSaleWithChangeAction({
          warehouseId,
          customerId: customerId || undefined,
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
          items={visibleCatalog}
          query={query}
          warehouseId={warehouseId}
          unitSelections={unitSelections}
          loading={catalogLoading}
          unitLoading={unitLoading}
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
            customers={availableCustomers}
            customerId={customerId}
            selectedCustomer={selectedCustomer}
            documentType={documentType}
            taxCondition={taxCondition}
            onExistingCustomerChange={selectExistingCustomer}
            onAddCustomer={() => setCustomerModalOpen(true)}
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

      <PosCustomerModal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        onCreated={handleCustomerCreated}
      />
    </div>
  );
}
