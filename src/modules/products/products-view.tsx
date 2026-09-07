import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { PRODUCT_TYPE_LABELS } from "./product-types";
import type {
  ProductCatalogOption,
  ProductListItem,
  ProductTypeValue,
} from "./product-types";

type ProductSummary = {
  activeProducts: number;
  availableDevices: number;
  lowStock: number;
  inventoryValue: number;
};

type ActiveFilters = {
  q?: string;
  type?: string;
  brandId?: string;
  categoryId?: string;
  status?: string;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(value);
}

export function ProductsView({
  products,
  summary,
  brands,
  categories,
  filters,
  created,
  canManage,
}: {
  products: ProductListItem[];
  summary: ProductSummary;
  brands: ProductCatalogOption[];
  categories: ProductCatalogOption[];
  filters: ActiveFilters;
  created: boolean;
  canManage: boolean;
}) {
  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">INVENTARIO</span>
          <h1>Productos</h1>
          <p>Consulta celulares, accesorios, equipos serializados y servicios.</p>
        </div>
        {canManage && <Link href="/productos/nuevo" className="primary-button"><Plus size={18} /> Nuevo producto</Link>}
      </section>

      {created && canManage && (
        <div className="success-banner">
          <CheckCircle2 size={18} />
          <div>
            <strong>Producto guardado</strong>
            <span>El producto y sus variantes ya están registrados en PostgreSQL.</span>
          </div>
        </div>
      )}

      <section className="product-summary">
        <div><span>Productos activos</span><strong>{summary.activeProducts}</strong></div>
        <div><span>Equipos disponibles</span><strong>{summary.availableDevices}</strong></div>
        <div><span>Stock bajo</span><strong>{summary.lowStock}</strong></div>
        <div><span>Valor inventario</span><strong>{formatMoney(summary.inventoryValue)}</strong></div>
      </section>

      <section className="panel table-panel">
        <form className="table-toolbar" method="get">
          <div className="table-search">
            <Search size={17} />
            <input name="q" defaultValue={filters.q} placeholder="Buscar por producto, SKU, modelo..." />
          </div>
          <div className="filters">
            <label className="filter-select">
              <span className="sr-only">Tipo</span>
              <select name="type" defaultValue={filters.type ?? ""}>
                <option value="">Todos los tipos</option>
                {Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
              <ChevronDown size={15} />
            </label>

            <label className="filter-select">
              <span className="sr-only">Marca</span>
              <select name="brandId" defaultValue={filters.brandId ?? ""}>
                <option value="">Todas las marcas</option>
                {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
              <ChevronDown size={15} />
            </label>

            <label className="filter-select">
              <span className="sr-only">Categoría</span>
              <select name="categoryId" defaultValue={filters.categoryId ?? ""}>
                <option value="">Todas las categorías</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <ChevronDown size={15} />
            </label>

            <label className="filter-select">
              <span className="sr-only">Estado</span>
              <select name="status" defaultValue={filters.status ?? ""}>
                <option value="">Todos los estados</option>
                <option value="ACTIVE">Activo</option>
                <option value="INACTIVE">Inactivo</option>
              </select>
              <ChevronDown size={15} />
            </label>

            <button className="icon-button" type="submit" aria-label="Aplicar filtros"><SlidersHorizontal size={17} /></button>
            {(filters.q || filters.type || filters.brandId || filters.categoryId || filters.status) && <Link href="/productos" className="clear-filter">Limpiar</Link>}
          </div>
        </form>

        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Producto</th><th>Tipo</th><th>Marca</th><th className="right">Stock</th><th className="right">Precio</th><th>Estado</th></tr></thead>
            <tbody>
              {products.map((product) => {
                const lowStock = product.type !== "SERVICE" && product.stock <= product.minimumStock;
                return (
                  <tr key={product.id}>
                    <td><div className="product-cell"><div className="product-thumb">{product.name.slice(0, 1).toUpperCase()}</div><div><strong>{product.name}</strong><span>{product.variantSummary}{product.model ? ` · ${product.model}` : ""}</span></div></div></td>
                    <td>{PRODUCT_TYPE_LABELS[product.type as ProductTypeValue]}</td>
                    <td>{product.brand}</td>
                    <td className="right"><strong className={lowStock ? "stock-low" : undefined}>{product.type === "SERVICE" ? "—" : product.stock}</strong></td>
                    <td className="right"><strong>{formatMoney(product.price)}</strong></td>
                    <td><span className={`status-badge${product.status === "INACTIVE" ? " inactive" : ""}`}>{product.status === "ACTIVE" ? "Activo" : "Inactivo"}</span></td>
                  </tr>
                );
              })}
              {products.length === 0 && <tr><td colSpan={6}><div className="empty-table-state"><Search size={22} /><strong>No encontramos productos</strong><span>{canManage ? "Prueba otros filtros o registra un producto nuevo." : "Prueba con otros filtros de búsqueda."}</span></div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>{products.length} producto{products.length === 1 ? "" : "s"} encontrado{products.length === 1 ? "" : "s"}</span>
          <span>Stock de celulares calculado por unidades disponibles; accesorios por saldo de almacén.</span>
        </div>
      </section>
    </div>
  );
}
