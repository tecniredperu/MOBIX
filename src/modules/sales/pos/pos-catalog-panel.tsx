import {
  BadgeCheck,
  CreditCard,
  Headphones,
  LoaderCircle,
  Package,
  Plus,
  ScanLine,
  Search,
  Smartphone,
  Star,
  Wrench,
} from "lucide-react";
import type { PosCatalogItem, PosUnit } from "../sale-types";
import { formatPen, stockFor, unitLabel, type PosCatalogFilter } from "./pos-shared";

const FILTERS: Array<{ value: PosCatalogFilter; label: string; icon: typeof Package }> = [
  { value: "ALL", label: "Todos", icon: Package },
  { value: "PHONE", label: "Celulares", icon: Smartphone },
  { value: "ACCESSORY", label: "Accesorios", icon: Headphones },
  { value: "SERVICE", label: "Servicios", icon: Wrench },
  { value: "FAVORITES", label: "Favoritos", icon: Star },
];

export function PosCatalogPanel({
  items,
  query,
  activeFilter,
  favoriteVariantIds,
  warehouseId,
  unitSelections,
  unitsByVariant,
  loadingUnits,
  isSearching,
  isResolvingScan,
  scanNotice,
  onQueryChange,
  onFilterChange,
  onToggleFavorite,
  onLoadUnits,
  onUnitSelectionChange,
  onAdd,
  onSubmitSearch,
}: {
  items: PosCatalogItem[];
  query: string;
  activeFilter: PosCatalogFilter;
  favoriteVariantIds: Set<string>;
  warehouseId: string;
  unitSelections: Record<string, string>;
  unitsByVariant: Record<string, PosUnit[]>;
  loadingUnits: Record<string, boolean>;
  isSearching: boolean;
  isResolvingScan: boolean;
  scanNotice: string;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: PosCatalogFilter) => void;
  onToggleFavorite: (variantId: string) => void;
  onLoadUnits: (variantId: string) => Promise<PosUnit[]>;
  onUnitSelectionChange: (variantId: string, unitId: string) => void;
  onAdd: (item: PosCatalogItem) => unknown | Promise<unknown>;
  onSubmitSearch: (value: string, fallback?: PosCatalogItem) => void | Promise<void>;
}) {
  function focusSearch() {
    document.getElementById("pos-product-search")?.focus();
  }

  return (
    <section className="pos-catalog-panel panel">
      <div className="pos-v5-search-zone">
        <div className="pos-search">
          {isSearching || isResolvingScan
            ? <LoaderCircle className="mobix-spin" size={19} />
            : <Search size={19} />}
          <input
            id="pos-product-search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && query.trim()) {
                event.preventDefault();
                void onSubmitSearch(query, items[0]);
              }
            }}
            placeholder="Buscar producto, código, IMEI, serie, marca o modelo..."
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          <kbd>Enter</kbd>
          <kbd>F2</kbd>
          {(isSearching || isResolvingScan) && (
            <span className="pos-search-state">
              {isResolvingScan ? "Resolviendo escaneo…" : "Buscando…"}
            </span>
          )}
        </div>

        <button
          className="pos-scan-button"
          type="button"
          onClick={focusSearch}
          title="Escanear código, IMEI o serie"
        >
          <ScanLine size={18} />
          <span>Escanear</span>
        </button>

        {scanNotice && (
          <div className="pos-scan-notice" role="status" aria-live="polite">
            <BadgeCheck size={14} />
            <span>{scanNotice}</span>
          </div>
        )}
      </div>

      <div className="pos-v5-catalog-toolbar">
        <div className="pos-quick-filters" role="tablist" aria-label="Filtrar catálogo">
          {FILTERS.map((filter) => {
            const Icon = filter.icon;
            const active = activeFilter === filter.value;
            return (
              <button
                key={filter.value}
                className={active ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onFilterChange(filter.value)}
              >
                <Icon size={15} />
                <span>{filter.label}</span>
              </button>
            );
          })}
        </div>
        <span className="pos-results-count">
          {items.length} resultado{items.length === 1 ? "" : "s"}
        </span>
      </div>

      <div
        className="pos-catalog-list pos-v5-product-grid"
        aria-busy={isSearching || isResolvingScan}
      >
        {items.map((item) => {
          const stock = stockFor(item, warehouseId);
          const serialized = item.type === "PHONE" || item.type === "SERIALIZED";
          const cacheKey = `${item.variantId}:${warehouseId}`;
          const availableUnits = unitsByVariant[cacheKey] ?? [];
          const isLoadingUnits = Boolean(loadingUnits[cacheKey]);
          const loadedUnits = Object.prototype.hasOwnProperty.call(unitsByVariant, cacheKey);
          const favorite = favoriteVariantIds.has(item.variantId);
          const matchedUnit = item.units[0];

          return (
            <article className="pos-product pos-v5-product-card" key={item.variantId}>
              <button
                className={favorite ? "pos-favorite active" : "pos-favorite"}
                type="button"
                onClick={() => onToggleFavorite(item.variantId)}
                aria-label={favorite ? `Quitar ${item.name} de favoritos` : `Agregar ${item.name} a favoritos`}
                title={favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
              >
                <Star size={17} fill={favorite ? "currentColor" : "none"} />
              </button>

              <div className={item.imageUrl ? "pos-product-visual has-image" : "pos-product-visual"}>
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                  />
                ) : serialized ? (
                  <Smartphone size={34} />
                ) : item.type === "SERVICE" ? (
                  <CreditCard size={32} />
                ) : (
                  <Package size={32} />
                )}
              </div>

              <div className="pos-product-copy">
                <strong title={item.name}>{item.name}</strong>
                <span>{item.brand} · {item.variant}</span>
                {item.sku && <small className="pos-product-sku">{item.sku}</small>}
              </div>

              <div className="pos-product-price">
                <strong>{formatPen(item.salePrice)}</strong>
                <span>{item.type === "SERVICE" ? "Servicio" : stock > 0 ? `Stock: ${stock}` : "Sin stock"}</span>
              </div>

              {matchedUnit && (
                <div className="pos-identifier-match">
                  <ScanLine size={13} />
                  <span>{unitLabel(matchedUnit)}</span>
                </div>
              )}

              {serialized && (
                <select
                  className="pos-unit-select"
                  value={unitSelections[item.variantId] ?? matchedUnit?.id ?? ""}
                  onFocus={() => { if (!loadedUnits && !isLoadingUnits) void onLoadUnits(item.variantId); }}
                  onChange={(event) => onUnitSelectionChange(item.variantId, event.target.value)}
                  disabled={stock <= 0 || isLoadingUnits}
                  aria-label={`Seleccionar IMEI o serie de ${item.name}`}
                >
                  {isLoadingUnits && <option value="">Cargando equipos...</option>}
                  {!isLoadingUnits && !matchedUnit && stock > 0 && (
                    <option value="">Seleccionar IMEI / serie</option>
                  )}
                  {matchedUnit && !loadedUnits && (
                    <option value={matchedUnit.id}>{unitLabel(matchedUnit)}</option>
                  )}
                  {!isLoadingUnits && loadedUnits && !availableUnits.length && (
                    <option value="">Sin equipos disponibles</option>
                  )}
                  {availableUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>{unitLabel(unit)}</option>
                  ))}
                </select>
              )}

              <button
                className="primary-button pos-add"
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

        {!isSearching && !items.length && (
          <div className="purchase-empty pos-v5-empty">
            <Search size={24} />
            <strong>No encontramos productos</strong>
            <span>Busca por nombre, código, IMEI, serie, marca o modelo.</span>
          </div>
        )}
      </div>
    </section>
  );
}
