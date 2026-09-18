"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { roundMoney } from "@/lib/money";
import { createSaleWithChangeAction } from "./sale-payment-action";
import { calculatePaymentCoverage, calculateSaleTotals } from "./sales-calculations";
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
  itemMatchesPosSearch,
  stockFor,
  unitLabel,
  type CartLine,
  type PaymentLine,
  type PosCatalogFilter,
} from "./pos/pos-shared";

const FAVORITES_STORAGE_KEY = "mobix:pos:favorites";

export function PosFormV4({ warehouses, catalog, customers }: {
  warehouses: PosWarehouse[];
  catalog: PosCatalogItem[];
  customers: PosCustomer[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<PosCatalogFilter>("ALL");
  const [favoriteVariantIds, setFavoriteVariantIds] = useState<Set<string>>(new Set());
  const [searchResults, setSearchResults] = useState<PosCatalogItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [unitSelections, setUnitSelections] = useState<Record<string, string>>({});
  const [unitsByVariant, setUnitsByVariant] = useState<Record<string, PosUnit[]>>({});
  const [loadingUnits, setLoadingUnits] = useState<Record<string, boolean>>({});
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
    try {
      const stored = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setFavoriteVariantIds(new Set(parsed.filter((value): value is string => typeof value === "string")));
      }
    } catch {
      // El POS sigue funcionando aunque el navegador bloquee localStorage.
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        document.getElementById("pos-product-search")?.focus();
      }
      if (event.key === "F4") {
        event.preventDefault();
        setCustomerModalOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const params = new URLSearchParams({ q: normalized });
        if (warehouseId) params.set("warehouseId", warehouseId);

        const response = await fetch(`/api/pos/catalog?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("No se pudo buscar el catálogo.");
        const data = await response.json() as { items: PosCatalogItem[] };
        setSearchResults(data.items);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "No se pudo buscar el catálogo.");
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query, warehouseId]);

  const filteredCatalog = useMemo(() => {
    const merged = new Map<string, PosCatalogItem>();

    if (query.trim().length >= 2) {
      for (const item of searchResults) merged.set(item.variantId, item);
    }
    for (const item of catalog) {
      if (!merged.has(item.variantId)) merged.set(item.variantId, item);
    }

    let items = [...merged.values()];

    if (query.trim()) {
      items = items.filter((item) => itemMatchesPosSearch(item, query));
    }

    if (activeFilter === "PHONE") {
      items = items.filter((item) => item.type === "PHONE" || item.type === "SERIALIZED");
    } else if (activeFilter === "ACCESSORY") {
      items = items.filter((item) => item.type === "ACCESSORY");
    } else if (activeFilter === "SERVICE") {
      items = items.filter((item) => item.type === "SERVICE");
    } else if (activeFilter === "FAVORITES") {
      items = items.filter((item) => favoriteVariantIds.has(item.variantId));
    }

    return items.slice(0, 80);
  }, [activeFilter, catalog, favoriteVariantIds, query, searchResults]);

  const knownCatalog = useMemo(() => {
    const merged = new Map<string, PosCatalogItem>();
    for (const item of catalog) merged.set(item.variantId, item);
    for (const item of searchResults) merged.set(item.variantId, item);
    return merged;
  }, [catalog, searchResults]);

  const selectedCustomer = useMemo(
    () => availableCustomers.find((customer) => customer.id === customerId) ?? null,
    [availableCustomers, customerId],
  );

  const totals = useMemo(() => calculateSaleTotals({
    lines: cart.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice })),
    discount,
    taxCondition,
    taxRatePercent: 18,
  }), [cart, discount, taxCondition]);

  const coverage = useMemo(() => calculatePaymentCoverage({
    total: totals.total,
    payments,
    creditEnabled: selectedCustomer?.creditEnabled,
    availableCredit: selectedCustomer?.availableCredit,
  }), [payments, selectedCustomer, totals.total]);

  function toggleFavorite(variantId: string) {
    setFavoriteVariantIds((current) => {
      const next = new Set(current);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);

      try {
        window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Favoritos son una mejora local y nunca deben bloquear una venta.
      }

      return next;
    });
  }

  async function loadUnits(variantId: string): Promise<PosUnit[]> {
    const cacheKey = `${variantId}:${warehouseId}`;
    if (unitsByVariant[cacheKey]) return unitsByVariant[cacheKey];
    if (loadingUnits[cacheKey]) return [];

    setLoadingUnits((current) => ({ ...current, [cacheKey]: true }));
    try {
      const response = await fetch(`/api/pos/units?variantId=${encodeURIComponent(variantId)}&warehouseId=${encodeURIComponent(warehouseId)}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("No se pudieron cargar los IMEI disponibles.");
      const data = await response.json() as { units: PosUnit[] };
      setUnitsByVariant((current) => ({ ...current, [cacheKey]: data.units }));
      if (data.units[0]) {
        setUnitSelections((current) => ({ ...current, [variantId]: current[variantId] || data.units[0].id }));
      }
      return data.units;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los equipos disponibles.");
      return [];
    } finally {
      setLoadingUnits((current) => ({ ...current, [cacheKey]: false }));
    }
  }

  function selectExistingCustomer(id: string) {
    setCustomerId(id);
    setError("");
  }

  function handleCustomerCreated(customer: PosCustomer) {
    setAvailableCustomers((current) => current.some((item) => item.id === customer.id) ? current : [customer, ...current]);
    setCustomerId(customer.id);
    setError("");
  }

  async function addItem(item: PosCatalogItem) {
    const stock = stockFor(item, warehouseId);
    if (item.type !== "SERVICE" && stock <= 0) {
      setError("Este producto no tiene stock disponible en la sucursal seleccionada.");
      return;
    }

    if (item.type === "PHONE" || item.type === "SERIALIZED") {
      const cacheKey = `${item.variantId}:${warehouseId}`;
      const preferredMatchedUnit = item.units.find((unit) => unit.warehouseId === warehouseId);
      const availableUnits = unitsByVariant[cacheKey] ?? await loadUnits(item.variantId);
      const selectedId = unitSelections[item.variantId] || preferredMatchedUnit?.id || availableUnits[0]?.id;
      const selected = availableUnits.find((unit) => unit.id === selectedId);

      if (!selected) {
        setError("Selecciona un IMEI o serie disponible.");
        return;
      }
      if (cart.some((line) => line.selectedUnitIds.includes(selected.id))) {
        setError("Ese IMEI/equipo ya está agregado a la venta.");
        return;
      }

      setUnitSelections((current) => ({ ...current, [item.variantId]: selected.id }));
      setCart((current) => [...current, {
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
      }]);
      setError("");
      return;
    }

    setCart((current) => {
      const existing = current.find((line) => line.variantId === item.variantId && line.type === item.type);
      if (existing) {
        return current.map((line) => line.key === existing.key ? {
          ...line,
          quantity: item.type === "SERVICE" ? line.quantity + 1 : Math.min(stock, line.quantity + 1),
        } : line);
      }
      return [...current, {
        key: item.variantId,
        variantId: item.variantId,
        type: item.type,
        name: item.name,
        variant: item.variant,
        quantity: 1,
        unitPrice: item.salePrice,
        minimumSalePrice: item.minimumSalePrice,
        selectedUnitIds: [],
      }];
    });
    setError("");
  }

  function updateQuantity(key: string, quantity: number) {
    setCart((current) => current.map((line) => {
      if (line.key !== key || line.type === "PHONE" || line.type === "SERIALIZED") return line;
      const item = knownCatalog.get(line.variantId);
      const max = item && line.type !== "SERVICE" ? stockFor(item, warehouseId) : 999999;
      return { ...line, quantity: Math.max(1, Math.min(max, Math.floor(quantity || 1))) };
    }));
  }

  function updatePrice(key: string, value: number) {
    setCart((current) => current.map((line) => line.key === key ? { ...line, unitPrice: Math.max(0, value || 0) } : line));
  }

  function removeLine(key: string) {
    setCart((current) => current.filter((line) => line.key !== key));
  }

  function addPayment() {
    setPayments((current) => [...current, { id: `payment-${Date.now()}`, method: "YAPE", amount: 0, reference: "" }]);
  }

  function setPaymentAmount(id: string, amount: number) {
    setPayments((current) => current.map((payment) => payment.id === id ? { ...payment, amount: Math.max(0, amount || 0) } : payment));
  }

  function updatePaymentMethod(id: string, method: SalePaymentMethod) {
    setError(method === "CREDIT" && !selectedCustomer?.creditEnabled
      ? "Selecciona un cliente con línea de crédito habilitada antes de usar Crédito."
      : "");
    setPayments((current) => current.map((payment) => payment.id === id ? { ...payment, method } : payment));
  }

  function updatePaymentReference(id: string, reference: string) {
    setPayments((current) => current.map((payment) => payment.id === id ? { ...payment, reference } : payment));
  }

  function completePaymentBalance(id: string) {
    const otherPaid = payments.filter((payment) => payment.id !== id).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    setPaymentAmount(id, Math.max(0, roundMoney(totals.total - otherPaid)));
  }

  function submitSale() {
    setError("");
    if (!cart.length) {
      setError("Agrega al menos un producto o servicio antes de cobrar.");
      return;
    }
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
          payments: payments.map((payment) => ({ method: payment.method, amount: Number(payment.amount), reference: payment.reference })),
        });
        router.push(`/ventas/${result.id}?created=1&change=${result.change.toFixed(2)}`);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo completar la venta.");
      }
    });
  }

  return (
    <div className="pos-page pos-v5 page-stack">
      <section className="page-heading pos-heading">
        <div>
          <span className="eyebrow">VENTAS</span>
          <h1>Punto de venta</h1>
          <p>Busca, agrega y cobra sin salir de esta pantalla.</p>
        </div>
        <label className="pos-warehouse">
          <span>Sucursal / almacén</span>
          <select value={warehouseId} onChange={(event) => {
            setWarehouseId(event.target.value);
            setUnitsByVariant({});
            setUnitSelections({});
            setSearchResults([]);
          }} disabled={cart.length > 0}>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.branchName} · {warehouse.name}</option>)}
          </select>
        </label>
      </section>

      {error && <div className="error-banner"><strong>Revisa la operación</strong><span>{error}</span></div>}

      <div className="pos-layout">
        <PosCatalogPanel
          items={filteredCatalog}
          query={query}
          activeFilter={activeFilter}
          favoriteVariantIds={favoriteVariantIds}
          warehouseId={warehouseId}
          unitSelections={unitSelections}
          unitsByVariant={unitsByVariant}
          loadingUnits={loadingUnits}
          isSearching={isSearching}
          onQueryChange={setQuery}
          onFilterChange={setActiveFilter}
          onToggleFavorite={toggleFavorite}
          onLoadUnits={loadUnits}
          onUnitSelectionChange={(variantId, unitId) => setUnitSelections((current) => ({ ...current, [variantId]: unitId }))}
          onAdd={addItem}
        />

        <aside className="pos-checkout">
          <PosCartCard cart={cart} onQuantityChange={updateQuantity} onPriceChange={updatePrice} onRemove={removeLine} />
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

      <PosCustomerModal open={customerModalOpen} onClose={() => setCustomerModalOpen(false)} onCreated={handleCustomerCreated} />
    </div>
  );
}
