"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { roundMoney } from "@/lib/money";
import { createSaleWithChangeAction } from "./sale-payment-action";
import { calculatePaymentCoverage, calculateSaleTotals } from "./sales-calculations";
import type {
  PosCatalogItem,
  PosCustomer,
  PosExchangeCredit,
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

type PosScanMatch = {
  matchType: "IDENTIFIER" | "BARCODE" | "SKU";
  identifierType: string | null;
  matchedValue: string | null;
  item: PosCatalogItem;
};

function normalizeCustomerSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-PE")
    .trim();
}

function customerMatchesQuery(customer: PosCustomer, query: string) {
  const tokens = normalizeCustomerSearch(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = normalizeCustomerSearch([
    customer.name,
    customer.documentType ?? "",
    customer.documentNumber ?? "",
    customer.phone ?? "",
  ].join(" "));
  return tokens.every((token) => haystack.includes(token));
}

export function PosFormV4({
  warehouses,
  catalog,
  customers,
  initialExchangeCredit = null,
}: {
  warehouses: PosWarehouse[];
  catalog: PosCatalogItem[];
  customers: PosCustomer[];
  initialExchangeCredit?: PosExchangeCredit | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const previousTotalRef = useRef(0);
  const productSearchCacheRef = useRef(new Map<string, PosCatalogItem[]>());
  const customerSearchCacheRef = useRef(new Map<string, PosCustomer[]>());
  const scanNoticeTimeoutRef = useRef<number | null>(null);

  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<PosCatalogFilter>("ALL");
  const [favoriteVariantIds, setFavoriteVariantIds] = useState<Set<string>>(new Set());
  const [searchResults, setSearchResults] = useState<PosCatalogItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolvingScan, setIsResolvingScan] = useState(false);
  const [scanNotice, setScanNotice] = useState("");

  const [cart, setCart] = useState<CartLine[]>([]);
  const [unitSelections, setUnitSelections] = useState<Record<string, string>>({});
  const [unitsByVariant, setUnitsByVariant] = useState<Record<string, PosUnit[]>>({});
  const [loadingUnits, setLoadingUnits] = useState<Record<string, boolean>>({});

  const [documentType, setDocumentType] = useState<SaleDocumentType>("RECEIPT");
  const [taxCondition, setTaxCondition] = useState<SaleTaxCondition>("TAXED");
  const [discount, setDiscount] = useState(0);

  const [customerId, setCustomerId] = useState(initialExchangeCredit?.customer?.id ?? "");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerSearchResults, setCustomerSearchResults] = useState<PosCustomer[]>([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [availableCustomers, setAvailableCustomers] = useState<PosCustomer[]>(() => {
    const merged = new Map(customers.map((customer) => [customer.id, customer]));
    if (initialExchangeCredit?.customer) {
      merged.set(initialExchangeCredit.customer.id, initialExchangeCredit.customer);
    }
    return [...merged.values()];
  });
  const [customerModalOpen, setCustomerModalOpen] = useState(false);

  const [payments, setPayments] = useState<PaymentLine[]>([
    { id: "payment-1", method: "CASH", amount: 0, reference: "" },
  ]);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (scanNoticeTimeoutRef.current !== null) {
        window.clearTimeout(scanNoticeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setFavoriteVariantIds(new Set(parsed.filter((value): value is string => typeof value === "string")));
      }
    } catch {
      // El POS nunca debe bloquear una venta por preferencias locales.
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        document.getElementById("pos-product-search")?.focus();
      } else if (event.key === "F4") {
        event.preventDefault();
        document.getElementById("pos-customer-search")?.focus();
      } else if (event.key === "F6") {
        event.preventDefault();
        const paymentAmount = document.getElementById("pos-payment-amount") as HTMLInputElement | null;
        paymentAmount?.focus();
        paymentAmount?.select();
      } else if (event.key === "F8") {
        event.preventDefault();
        const firstDocument = document.querySelector("#pos-document-types button") as HTMLButtonElement | null;
        firstDocument?.focus();
      } else if (event.key === "F9") {
        event.preventDefault();
        (document.getElementById("pos-confirm-sale") as HTMLButtonElement | null)?.click();
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

    const cacheKey = warehouseId + "|" + normalizeCustomerSearch(normalized);
    const cached = productSearchCacheRef.current.get(cacheKey);
    if (cached) {
      setSearchResults(cached);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const params = new URLSearchParams({ q: normalized });
        if (warehouseId) params.set("warehouseId", warehouseId);

        const response = await fetch("/api/pos/catalog?" + params.toString(), {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("No se pudo buscar el catálogo.");
        const data = await response.json() as { items: PosCatalogItem[] };
        productSearchCacheRef.current.set(cacheKey, data.items);
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

  useEffect(() => {
    const normalized = customerQuery.trim();
    if (normalized.length < 2) {
      setCustomerSearchResults([]);
      setIsSearchingCustomers(false);
      return;
    }

    const cacheKey = normalizeCustomerSearch(normalized);
    const cached = customerSearchCacheRef.current.get(cacheKey);
    if (cached) {
      setCustomerSearchResults(cached);
      setIsSearchingCustomers(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearchingCustomers(true);
      try {
        const response = await fetch("/api/pos/customers?q=" + encodeURIComponent(normalized), {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("No se pudo buscar clientes.");

        const data = await response.json() as { items: PosCustomer[] };
        customerSearchCacheRef.current.set(cacheKey, data.items);
        setCustomerSearchResults(data.items);
        setAvailableCustomers((current) => {
          const merged = new Map(current.map((customer) => [customer.id, customer]));
          for (const customer of data.items) merged.set(customer.id, customer);
          return [...merged.values()];
        });
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "No se pudo buscar clientes.");
      } finally {
        if (!controller.signal.aborted) setIsSearchingCustomers(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [customerQuery]);

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

  const customerMatches = useMemo(() => {
    if (customerQuery.trim().length < 2) return [];
    const merged = new Map<string, PosCustomer>();
    for (const customer of customerSearchResults) merged.set(customer.id, customer);
    for (const customer of availableCustomers) {
      if (!merged.has(customer.id) && customerMatchesQuery(customer, customerQuery)) {
        merged.set(customer.id, customer);
      }
    }
    return [...merged.values()].slice(0, 12);
  }, [availableCustomers, customerQuery, customerSearchResults]);

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

  const exchangeApplied = useMemo(
    () => roundMoney(Math.min(initialExchangeCredit?.balance ?? 0, totals.total)),
    [initialExchangeCredit, totals.total],
  );
  const exchangeRemaining = useMemo(
    () => roundMoney(Math.max(0, (initialExchangeCredit?.balance ?? 0) - exchangeApplied)),
    [exchangeApplied, initialExchangeCredit],
  );
  const amountDue = useMemo(
    () => roundMoney(Math.max(0, totals.total - exchangeApplied)),
    [exchangeApplied, totals.total],
  );
  const effectivePayments = useMemo(() => {
    const normalPayments = payments.filter((payment) => Number(payment.amount || 0) > 0.009);
    if (!initialExchangeCredit || exchangeApplied <= 0.009) return normalPayments;
    return [
      ...normalPayments,
      {
        id: "exchange-credit",
        method: "EXCHANGE_CREDIT" as SalePaymentMethod,
        amount: exchangeApplied,
        reference: initialExchangeCredit.id,
      },
    ];
  }, [exchangeApplied, initialExchangeCredit, payments]);

  useEffect(() => {
    const previousDue = previousTotalRef.current;
    setPayments((current) => {
      if (current.length !== 1) return current;
      const payment = current[0];
      if (payment.method === "CASH") return current;
      const amount = Number(payment.amount || 0);
      const wasAutoAmount = amount <= 0.009 || Math.abs(amount - previousDue) <= 0.009;
      if (!wasAutoAmount) return current;
      return [{ ...payment, amount: amountDue }];
    });
    previousTotalRef.current = amountDue;
  }, [amountDue]);

  const coverage = useMemo(() => calculatePaymentCoverage({
    total: totals.total,
    payments: effectivePayments,
    creditEnabled: selectedCustomer?.creditEnabled,
    availableCredit: selectedCustomer?.availableCredit,
  }), [effectivePayments, selectedCustomer, totals.total]);

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
    const cacheKey = variantId + ":" + warehouseId;
    if (unitsByVariant[cacheKey]) return unitsByVariant[cacheKey];
    if (loadingUnits[cacheKey]) return [];

    setLoadingUnits((current) => ({ ...current, [cacheKey]: true }));
    try {
      const response = await fetch(
        "/api/pos/units?variantId=" + encodeURIComponent(variantId)
          + "&warehouseId=" + encodeURIComponent(warehouseId),
        { method: "GET", cache: "no-store" },
      );
      if (!response.ok) throw new Error("No se pudieron cargar los IMEI disponibles.");
      const data = await response.json() as { units: PosUnit[] };
      setUnitsByVariant((current) => ({ ...current, [cacheKey]: data.units }));
      return data.units;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los equipos disponibles.");
      return [];
    } finally {
      setLoadingUnits((current) => ({ ...current, [cacheKey]: false }));
    }
  }

  function selectExistingCustomer(id: string) {
    if (
      initialExchangeCredit?.customer
      && id !== initialExchangeCredit.customer.id
    ) {
      setError("Este vale de cambio pertenece a " + initialExchangeCredit.customer.name + " y debe usarse con el mismo cliente.");
      return;
    }
    setCustomerId(id);
    setCustomerQuery("");
    setCustomerSearchResults([]);
    setError("");
  }

  function handleCustomerCreated(customer: PosCustomer) {
    if (
      initialExchangeCredit?.customer
      && customer.id !== initialExchangeCredit.customer.id
    ) {
      setError("Este vale de cambio ya está asociado a " + initialExchangeCredit.customer.name + ".");
      return;
    }
    setAvailableCustomers((current) => current.some((item) => item.id === customer.id)
      ? current
      : [customer, ...current]);
    setCustomerId(customer.id);
    setCustomerQuery("");
    setError("");
  }

  function showScanNotice(message: string) {
    setScanNotice(message);
    if (scanNoticeTimeoutRef.current !== null) {
      window.clearTimeout(scanNoticeTimeoutRef.current);
    }
    scanNoticeTimeoutRef.current = window.setTimeout(() => {
      setScanNotice("");
      scanNoticeTimeoutRef.current = null;
    }, 1800);
  }

  function resetProductSearchAfterAdd() {
    setQuery("");
    setSearchResults([]);
    window.requestAnimationFrame(() => {
      document.getElementById("pos-product-search")?.focus();
    });
  }

  async function addItem(item: PosCatalogItem, directUnit?: PosUnit): Promise<boolean> {
    const stock = stockFor(item, warehouseId);
    if (item.type !== "SERVICE" && stock <= 0) {
      setError("Este producto no tiene stock disponible en la sucursal seleccionada.");
      return false;
    }

    if (item.type === "PHONE" || item.type === "SERIALIZED") {
      const cacheKey = item.variantId + ":" + warehouseId;
      const matchedUnit = directUnit
        ?? item.units.find((unit) => unit.warehouseId === warehouseId);

      let selected = matchedUnit;

      if (!selected) {
        let availableUnits = unitsByVariant[cacheKey];
        if (!availableUnits) {
          availableUnits = await loadUnits(item.variantId);
        }

        const selectedId = unitSelections[item.variantId];
        selected = availableUnits.find((unit) => unit.id === selectedId);

        if (!selected) {
          setError("Selecciona el IMEI o serie exacto del equipo antes de agregarlo.");
          return false;
        }
      }

      if (cart.some((line) => line.selectedUnitIds.includes(selected.id))) {
        setError("Ese IMEI/equipo ya está agregado a la venta.");
        return false;
      }

      setUnitSelections((current) => ({ ...current, [item.variantId]: selected.id }));
      setUnitsByVariant((current) => {
        const existing = current[cacheKey] ?? [];
        return existing.some((unit) => unit.id === selected.id)
          ? current
          : { ...current, [cacheKey]: [selected, ...existing] };
      });
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
      resetProductSearchAfterAdd();
      return true;
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
    resetProductSearchAfterAdd();
    return true;
  }

  async function submitProductSearch(value: string, fallback?: PosCatalogItem) {
    const normalized = value.trim();
    if (!normalized || isResolvingScan) return;

    setIsResolvingScan(true);
    setError("");

    try {
      const params = new URLSearchParams({
        value: normalized,
        warehouseId,
      });
      const response = await fetch("/api/pos/scan?" + params.toString(), {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("No se pudo resolver el código escaneado.");
      }

      const data = await response.json() as { match: PosScanMatch | null };

      if (data.match) {
        const scannedUnit = data.match.matchType === "IDENTIFIER"
          ? data.match.item.units.find((unit) => unit.warehouseId === warehouseId)
          : undefined;

        const added = await addItem(data.match.item, scannedUnit);

        if (added) {
          if (data.match.matchType === "IDENTIFIER" && scannedUnit) {
            showScanNotice(unitLabel(scannedUnit) + " agregado a la venta.");
          } else {
            showScanNotice(data.match.item.name + " agregado a la venta.");
          }
        }
        return;
      }

      if (fallback) {
        await addItem(fallback);
        return;
      }

      setError("No encontramos un producto, IMEI, serie o código disponible con ese valor.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo procesar el escaneo.");
    } finally {
      setIsResolvingScan(false);
    }
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
    setCart((current) => current.map((line) => line.key === key
      ? { ...line, unitPrice: Math.max(0, value || 0) }
      : line));
  }

  function removeLine(key: string) {
    setCart((current) => current.filter((line) => line.key !== key));
  }

  function clearSale() {
    setCart([]);
    setDiscount(0);
    setCustomerId(initialExchangeCredit?.customer?.id ?? "");
    setCustomerQuery("");
    setCustomerSearchResults([]);
    setDocumentType("RECEIPT");
    setTaxCondition("TAXED");
    setPayments([{ id: "payment-1", method: "CASH", amount: 0, reference: "" }]);
    previousTotalRef.current = 0;
    setError("");
    document.getElementById("pos-product-search")?.focus();
  }

  function setSinglePaymentMethod(method: SalePaymentMethod) {
    if (method === "EXCHANGE_CREDIT") return;
    if (method === "CREDIT" && !selectedCustomer?.creditEnabled) {
      setError("Selecciona un cliente con línea de crédito habilitada antes de usar Crédito.");
      return;
    }
    setPayments([{
      id: "payment-1",
      method,
      amount: method === "CASH" ? 0 : amountDue,
      reference: "",
    }]);
    setError("");
  }

  function enableMixedPayment() {
    setPayments((current) => {
      if (current.length > 1) return current;
      const first = current[0] ?? {
        id: "payment-1",
        method: "CASH" as SalePaymentMethod,
        amount: amountDue,
        reference: "",
      };
      const secondMethod: SalePaymentMethod = first.method === "YAPE" ? "CASH" : "YAPE";
      return [
        { ...first },
        { id: "payment-2", method: secondMethod, amount: 0, reference: "" },
      ];
    });
  }

  function addPayment() {
    setPayments((current) => [
      ...current,
      { id: "payment-" + Date.now(), method: "YAPE", amount: 0, reference: "" },
    ]);
  }

  function setPaymentAmount(id: string, amount: number) {
    setPayments((current) => current.map((payment) => payment.id === id
      ? { ...payment, amount: Math.max(0, amount || 0) }
      : payment));
  }

  function updatePaymentMethod(id: string, method: SalePaymentMethod) {
    if (method === "EXCHANGE_CREDIT") return;
    if (method === "CREDIT" && !selectedCustomer?.creditEnabled) {
      setError("Selecciona un cliente con línea de crédito habilitada antes de usar Crédito.");
    } else {
      setError("");
    }

    setPayments((current) => current.map((payment) => payment.id === id
      ? { ...payment, method }
      : payment));
  }

  function updatePaymentReference(id: string, reference: string) {
    setPayments((current) => current.map((payment) => payment.id === id
      ? { ...payment, reference }
      : payment));
  }

  function completePaymentBalance(id: string) {
    const otherPaid = payments
      .filter((payment) => payment.id !== id)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    setPaymentAmount(id, Math.max(0, roundMoney(amountDue - otherPaid)));
  }

  function submitSale() {
    setError("");

    if (!cart.length) {
      setError("Agrega al menos un producto o servicio antes de cobrar.");
      return;
    }

    const invalidPrice = cart.find((line) =>
      line.minimumSalePrice > 0 && Number(line.unitPrice) < Number(line.minimumSalePrice));
    if (invalidPrice) {
      setError(
        "El precio de " + invalidPrice.name + " no puede ser menor a S/ "
          + Number(invalidPrice.minimumSalePrice).toFixed(2) + ".",
      );
      return;
    }

    if (documentType === "INVOICE") {
      const validRuc = selectedCustomer?.documentType === "RUC"
        && (selectedCustomer.documentNumber ?? "").replace(/\D/g, "").length === 11;
      if (!validRuc) {
        setError("Para emitir Factura selecciona un cliente con RUC válido de 11 dígitos.");
        document.getElementById("pos-customer-search")?.focus();
        return;
      }
    }

    if (totals.total > 0.01 && !effectivePayments.some((payment) => Number(payment.amount) > 0.009)) {
      setError("Ingresa el monto recibido antes de confirmar la venta.");
      return;
    }

    if (coverage.invalidOverpayment) {
      setError("El exceso de pago solo puede entregarse como vuelto cuando proviene de efectivo.");
      return;
    }

    if (!coverage.creditReady) {
      setError("El crédito seleccionado supera la línea disponible del cliente.");
      return;
    }

    if (!coverage.paymentComplete) {
      setError("El cobro está incompleto. Falta S/ " + coverage.pendingAmount.toFixed(2) + ".");
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
          payments: effectivePayments.map((payment) => ({
            method: payment.method,
            amount: Number(payment.amount),
            reference: payment.reference,
          })),
        });

        const completionParams = new URLSearchParams({
          created: "1",
          change: result.change.toFixed(2),
        });
        if (initialExchangeCredit) {
          completionParams.set("exchangeCredit", initialExchangeCredit.id);
          completionParams.set("exchangeBalance", exchangeRemaining.toFixed(2));
        }
        router.push("/ventas/" + result.id + "?" + completionParams.toString());
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
          <select
            value={warehouseId}
            onChange={(event) => {
              setWarehouseId(event.target.value);
              setUnitsByVariant({});
              setUnitSelections({});
              setSearchResults([]);
              productSearchCacheRef.current.clear();
            }}
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
          <strong>Revisa la operación</strong>
          <span>{error}</span>
        </div>
      )}

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
          isResolvingScan={isResolvingScan}
          scanNotice={scanNotice}
          onQueryChange={setQuery}
          onFilterChange={setActiveFilter}
          onToggleFavorite={toggleFavorite}
          onLoadUnits={loadUnits}
          onUnitSelectionChange={(variantId, unitId) =>
            setUnitSelections((current) => ({ ...current, [variantId]: unitId }))}
          onAdd={addItem}
          onSubmitSearch={submitProductSearch}
        />

        <aside className="pos-checkout">
          <PosCartCard
            cart={cart}
            onQuantityChange={updateQuantity}
            onPriceChange={updatePrice}
            onRemove={removeLine}
            onClear={clearSale}
          />

          <PosCustomerCard
            customers={customerMatches}
            customerId={customerId}
            customerQuery={customerQuery}
            isSearchingCustomers={isSearchingCustomers}
            selectedCustomer={selectedCustomer}
            documentType={documentType}
            taxCondition={taxCondition}
            customerLocked={Boolean(initialExchangeCredit?.customer)}
            onCustomerQueryChange={setCustomerQuery}
            onExistingCustomerChange={selectExistingCustomer}
            onAddCustomer={() => setCustomerModalOpen(true)}
            onDocumentTypeChange={setDocumentType}
            onTaxConditionChange={setTaxCondition}
          />

          <PosPaymentCard
            payments={payments}
            total={totals.total}
            change={coverage.change}
            pendingAmount={coverage.pendingAmount}
            selectedCustomer={selectedCustomer}
            creditAmount={coverage.creditAmount}
            creditReady={coverage.creditReady}
            exchangeCredit={initialExchangeCredit}
            exchangeApplied={exchangeApplied}
            exchangeRemaining={exchangeRemaining}
            amountDue={amountDue}
            onSetSingleMethod={setSinglePaymentMethod}
            onEnableMixed={enableMixedPayment}
            onAdd={addPayment}
            onMethodChange={updatePaymentMethod}
            onAmountChange={setPaymentAmount}
            onReferenceChange={updatePaymentReference}
            onCompleteBalance={completePaymentBalance}
            onRemove={(id) =>
              setPayments((current) => current.filter((item) => item.id !== id))}
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
