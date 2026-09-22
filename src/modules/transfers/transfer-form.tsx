"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Boxes, Smartphone } from "lucide-react";
import { createTransferAction } from "./transfer-actions";

type WarehouseOption = {
  id: string;
  name: string;
  branch: string;
};

type ProductOption = {
  variantId: string;
  name: string;
  type: string;
  variant: string;
  brand: string;
  balances: Array<{ warehouseId: string; quantity: number }>;
};

type TransferUnit = {
  id: string;
  identifier: string;
};

type Selection = {
  checked: boolean;
  quantity: number;
  unitIds: string[];
};

export function TransferForm({
  warehouses,
  products,
}: {
  warehouses: WarehouseOption[];
  products: ProductOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [from, setFrom] = useState(warehouses[0]?.id ?? "");
  const [to, setTo] = useState(warehouses[1]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Record<string, Selection>>({});
  const [unitsByKey, setUnitsByKey] = useState<Record<string, TransferUnit[]>>({});
  const [loadingUnits, setLoadingUnits] = useState<Record<string, boolean>>({});

  const visible = useMemo(
    () =>
      products
        .map((product) => {
          const balance = product.balances.find((item) => item.warehouseId === from);
          return {
            ...product,
            available: Number(balance?.quantity ?? 0),
          };
        })
        .filter((product) => product.available > 0),
    [products, from],
  );

  function patch(variantId: string, data: Partial<Selection>) {
    setSelected((previous) => {
      const current = previous[variantId] ?? {
        checked: false,
        quantity: 1,
        unitIds: [],
      };
      return {
        ...previous,
        [variantId]: { ...current, ...data },
      };
    });
  }

  function unitCacheKey(variantId: string) {
    return `${variantId}:${from}`;
  }

  async function loadUnits(variantId: string) {
    const key = unitCacheKey(variantId);
    if (Object.prototype.hasOwnProperty.call(unitsByKey, key) || loadingUnits[key]) return;

    setLoadingUnits((previous) => ({ ...previous, [key]: true }));
    try {
      const params = new URLSearchParams({ variantId, warehouseId: from });
      const response = await fetch(`/api/transfers/units?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("No se pudieron cargar los IMEI/series disponibles.");
      const payload = await response.json() as { items: TransferUnit[] };
      setUnitsByKey((previous) => ({ ...previous, [key]: payload.items }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los equipos.");
    } finally {
      setLoadingUnits((previous) => ({ ...previous, [key]: false }));
    }
  }

  function toggleUnit(variantId: string, id: string, checked: boolean) {
    const current = selected[variantId] ?? {
      checked: true,
      quantity: 1,
      unitIds: [],
    };
    const unitIds = checked
      ? [...current.unitIds, id]
      : current.unitIds.filter((unitId) => unitId !== id);
    patch(variantId, {
      checked: true,
      unitIds,
      quantity: unitIds.length,
    });
  }

  function changeOrigin(nextFrom: string) {
    setFrom(nextFrom);
    setSelected({});
    const nextDestination = warehouses.find((warehouse) => warehouse.id !== nextFrom);
    if (to === nextFrom && nextDestination) setTo(nextDestination.id);
  }

  function submit() {
    setError("");

    const lines = visible
      .filter((product) => selected[product.variantId]?.checked)
      .map((product) => ({
        variantId: product.variantId,
        quantity:
          product.type === "ACCESSORY"
            ? Number(selected[product.variantId]?.quantity ?? 0)
            : selected[product.variantId]?.unitIds.length ?? 0,
        unitIds:
          product.type === "ACCESSORY"
            ? undefined
            : selected[product.variantId]?.unitIds,
      }))
      .filter((line) => line.quantity > 0);

    start(async () => {
      try {
        const result = await createTransferAction({
          fromWarehouseId: from,
          toWarehouseId: to,
          notes,
          lines,
        });
        router.push(`/transferencias?created=${result.transferNumber}`);
        router.refresh();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo crear la transferencia.",
        );
      }
    });
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <Link href="/transferencias" className="back-link">
            <ArrowLeft size={15} /> Volver
          </Link>
          <span className="eyebrow">INVENTARIO</span>
          <h1>Nueva transferencia</h1>
          <p>Selecciona el inventario que saldrá del almacén origen.</p>
        </div>
      </section>

      {error && (
        <div className="error-banner">
          <strong>No se pudo transferir</strong>
          <span>{error}</span>
        </div>
      )}

      <section className="panel transfer-route">
        <label>
          <span>Almacén origen</span>
          <select value={from} onChange={(event) => changeOrigin(event.target.value)}>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.branch} · {warehouse.name}
              </option>
            ))}
          </select>
        </label>

        <ArrowRight size={24} />

        <label>
          <span>Almacén destino</span>
          <select value={to} onChange={(event) => setTo(event.target.value)}>
            {warehouses
              .filter((warehouse) => warehouse.id !== from)
              .map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.branch} · {warehouse.name}
                </option>
              ))}
          </select>
        </label>
      </section>

      <div className="transfer-layout">
        <section className="panel transfer-products">
          <div className="section-title">
            <div>
              <h2>Inventario disponible</h2>
              <p>{visible.length} variantes con existencia en origen</p>
            </div>
            <Boxes size={19} />
          </div>

          <div className="transfer-product-list">
            {visible.map((product) => {
              const state = selected[product.variantId] ?? {
                checked: false,
                quantity: 1,
                unitIds: [],
              };
              const serialized = product.type !== "ACCESSORY";
              const key = unitCacheKey(product.variantId);
              const sourceUnits = unitsByKey[key] ?? [];
              const unitsLoaded = Object.prototype.hasOwnProperty.call(unitsByKey, key);
              const isLoadingUnits = Boolean(loadingUnits[key]);

              return (
                <article
                  key={product.variantId}
                  className={state.checked ? "selected" : ""}
                >
                  <div className="transfer-product-head">
                    <input
                      type="checkbox"
                      checked={state.checked}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        patch(product.variantId, {
                          checked,
                          ...(checked ? {} : { unitIds: [], quantity: 1 }),
                        });
                        if (checked && serialized) void loadUnits(product.variantId);
                      }}
                    />
                    <span className="transfer-product-icon">
                      {product.type === "ACCESSORY"
                        ? <Boxes size={17} />
                        : <Smartphone size={17} />}
                    </span>
                    <div>
                      <strong>{product.name}</strong>
                      <span>{product.brand} · {product.variant}</span>
                      <small>Disponible: {product.available}</small>
                    </div>

                    {product.type === "ACCESSORY" && (
                      <input
                        className="transfer-qty"
                        disabled={!state.checked}
                        type="number"
                        min="1"
                        max={product.available}
                        value={state.quantity}
                        onChange={(event) =>
                          patch(product.variantId, {
                            quantity: Number(event.target.value),
                          })}
                      />
                    )}
                  </div>

                  {serialized && state.checked && (
                    <div className="transfer-unit-grid">
                      {isLoadingUnits && <small>Cargando IMEI/series…</small>}
                      {!isLoadingUnits && unitsLoaded && sourceUnits.length === 0 && (
                        <small>No quedan unidades disponibles.</small>
                      )}
                      {!isLoadingUnits && sourceUnits.map((unit) => (
                        <label key={unit.id}>
                          <input
                            type="checkbox"
                            checked={state.unitIds.includes(unit.id)}
                            onChange={(event) =>
                              toggleUnit(product.variantId, unit.id, event.target.checked)}
                          />
                          <code>{unit.identifier}</code>
                        </label>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}

            {!visible.length && (
              <div className="empty-table-state">
                El almacén origen no tiene inventario transferible.
              </div>
            )}
          </div>
        </section>

        <aside className="panel transfer-summary">
          <h2>Confirmar traslado</h2>
          <label>
            <span>Observación</span>
            <textarea
              rows={5}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Motivo, transportista, referencia interna..."
            />
          </label>
          <div className="transfer-summary-row">
            <span>Productos</span>
            <strong>{Object.values(selected).filter((item) => item.checked).length}</strong>
          </div>
          <div className="transfer-summary-row">
            <span>Unidades</span>
            <strong>
              {Object.values(selected)
                .filter((item) => item.checked)
                .reduce(
                  (sum, item) =>
                    sum + (item.unitIds.length || Number(item.quantity || 0)),
                  0,
                )}
            </strong>
          </div>
          <p>
            Al confirmar, los IMEI quedarán bloqueados como <strong>En transferencia</strong>{" "}
            hasta que el destino registre la recepción.
          </p>
          <button
            className="primary-button wide"
            disabled={pending || from === to || warehouses.length < 2}
            onClick={submit}
          >
            {pending ? "Procesando..." : "Enviar transferencia"}
          </button>
        </aside>
      </div>
    </div>
  );
}
