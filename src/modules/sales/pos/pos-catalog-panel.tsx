import { CreditCard, LoaderCircle, Plus, Search, Smartphone } from "lucide-react";
import type { PosCatalogItem, PosUnit } from "../sale-types";
import { formatPen, stockFor, unitLabel } from "./pos-shared";

export function PosCatalogPanel({
  items,
  query,
  warehouseId,
  unitSelections,
  unitsByVariant,
  loadingUnits,
  onQueryChange,
  onLoadUnits,
  onUnitSelectionChange,
  onAdd,
}: {
  items: PosCatalogItem[];
  query: string;
  warehouseId: string;
  unitSelections: Record<string, string>;
  unitsByVariant: Record<string, PosUnit[]>;
  loadingUnits: Record<string, boolean>;
  onQueryChange: (value: string) => void;
  onLoadUnits: (variantId: string) => Promise<PosUnit[]>;
  onUnitSelectionChange: (variantId: string, unitId: string) => void;
  onAdd: (item: PosCatalogItem) => void | Promise<void>;
}) {
  return (
    <section className="pos-catalog-panel panel">
      <div className="pos-search">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar producto, marca, SKU o modelo..."
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="pos-catalog-list">
        {items.map((item) => {
          const stock = stockFor(item, warehouseId);
          const serialized = item.type === "PHONE" || item.type === "SERIALIZED";
          const cacheKey = `${item.variantId}:${warehouseId}`;
          const availableUnits = unitsByVariant[cacheKey] ?? [];
          const isLoadingUnits = Boolean(loadingUnits[cacheKey]);
          const loadedUnits = Object.prototype.hasOwnProperty.call(unitsByVariant, cacheKey);

          return (
            <article className="pos-product" key={item.variantId}>
              <div className="pos-product-icon">
                {serialized ? <Smartphone size={18} /> : item.type === "SERVICE" ? <CreditCard size={18} /> : item.name.slice(0, 1)}
              </div>
              <div className="pos-product-copy">
                <strong>{item.name}</strong>
                <span>{item.brand} · {item.variant}</span>
                <small>
                  {item.type === "SERVICE" ? "Servicio" : `${stock} disponible${stock === 1 ? "" : "s"}`}
                </small>
              </div>

              {serialized && (
                <select
                  className="pos-unit-select"
                  value={unitSelections[item.variantId] ?? availableUnits[0]?.id ?? ""}
                  onFocus={() => { if (!loadedUnits && !isLoadingUnits) void onLoadUnits(item.variantId); }}
                  onChange={(event) => onUnitSelectionChange(item.variantId, event.target.value)}
                  disabled={stock <= 0 || isLoadingUnits}
                  aria-label={`Seleccionar IMEI o serie de ${item.name}`}
                >
                  {isLoadingUnits && <option value="">Cargando equipos...</option>}
                  {!isLoadingUnits && !loadedUnits && stock > 0 && <option value="">Seleccionar IMEI / serie</option>}
                  {!isLoadingUnits && loadedUnits && !availableUnits.length && <option value="">Sin equipos disponibles</option>}
                  {availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unitLabel(unit)}</option>)}
                </select>
              )}

              <div className="pos-product-price">
                <strong>{formatPen(item.salePrice)}</strong>
                <span>Precio venta</span>
              </div>
              <button
                className="secondary-button pos-add"
                type="button"
                onClick={() => void onAdd(item)}
                disabled={(item.type !== "SERVICE" && stock <= 0) || isLoadingUnits}
              >
                {isLoadingUnits ? <LoaderCircle className="mobix-spin" size={15} /> : <Plus size={15} />}
                {isLoadingUnits ? "Cargando" : "Agregar"}
              </button>
            </article>
          );
        })}

        {!items.length && (
          <div className="purchase-empty">
            <Search size={22} />
            <strong>No encontramos productos</strong>
            <span>Prueba con otra búsqueda.</span>
          </div>
        )}
      </div>
    </section>
  );
}
