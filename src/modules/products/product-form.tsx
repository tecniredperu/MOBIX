"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  Barcode,
  Boxes,
  Check,
  ChevronRight,
  CircleDollarSign,
  Info,
  PackageCheck,
  Plus,
  Save,
  Smartphone,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  createProductAction,
  initialProductActionState,
} from "./product-actions";
import { createCatalogOptionAction, type CatalogOptionKind } from "./catalog-actions";
import type { ProductCatalogOption, ProductTypeValue } from "./product-types";

const productTypes: Array<{
  value: ProductTypeValue;
  label: string;
  description: string;
  icon: typeof Smartphone;
}> = [
  {
    value: "PHONE",
    label: "Celular",
    description: "Control individual por IMEI y número de serie.",
    icon: Smartphone,
  },
  {
    value: "SERIALIZED",
    label: "Equipo serializado",
    description: "Tablets, laptops, relojes y otros equipos con serie.",
    icon: PackageCheck,
  },
  {
    value: "ACCESSORY",
    label: "Accesorio",
    description: "Control de existencias por cantidades.",
    icon: Boxes,
  },
  {
    value: "SERVICE",
    label: "Servicio",
    description: "Conceptos de venta que no manejan inventario.",
    icon: Wrench,
  },
];

type VariantDraft = {
  key: string;
  sku: string;
  barcode: string;
  color: string;
  ram: string;
  storage: string;
  purchasePrice: string;
  salePrice: string;
  minimumSalePrice: string;
};

const emptyVariant = (key = "variant-1"): VariantDraft => ({
  key,
  sku: "",
  barcode: "",
  color: "",
  ram: "",
  storage: "",
  purchasePrice: "0",
  salePrice: "0",
  minimumSalePrice: "0",
});

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <span className="field-error">{errors[0]}</span>;
}

function money(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function addCatalogOption(current: ProductCatalogOption[], option: ProductCatalogOption) {
  const next = current.some((item) => item.id === option.id)
    ? current.map((item) => item.id === option.id ? option : item)
    : [...current, option];
  return next.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function ProductForm({
  categories,
  brands,
}: {
  categories: ProductCatalogOption[];
  brands: ProductCatalogOption[];
}) {
  const [state, formAction, pending] = useActionState(
    createProductAction,
    initialProductActionState,
  );
  const [catalogPending, startCatalogTransition] = useTransition();
  const [type, setType] = useState<ProductTypeValue>("PHONE");
  const [variants, setVariants] = useState<VariantDraft[]>([emptyVariant()]);
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [brandOptions, setBrandOptions] = useState(brands);
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newBrandOpen, setNewBrandOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [catalogErrors, setCatalogErrors] = useState<{ category?: string; brand?: string }>({});

  const typeRule = useMemo(() => {
    if (type === "PHONE") {
      return {
        stock: true,
        serial: true,
        imei: true,
        message: "Cada equipo se ingresará después con IMEI 1, IMEI 2 y serie.",
      };
    }
    if (type === "SERIALIZED") {
      return {
        stock: true,
        serial: true,
        imei: false,
        message: "Cada unidad se identificará por su número de serie.",
      };
    }
    if (type === "ACCESSORY") {
      return {
        stock: true,
        serial: false,
        imei: false,
        message: "El stock se administrará por cantidades y almacén.",
      };
    }
    return {
      stock: false,
      serial: false,
      imei: false,
      message: "Los servicios pueden venderse sin generar movimientos de inventario.",
    };
  }, [type]);

  const updateVariant = (key: string, field: keyof VariantDraft, value: string) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.key === key ? { ...variant, [field]: value } : variant,
      ),
    );
  };

  const addVariant = () => {
    setVariants((current) => [
      ...current,
      emptyVariant(`variant-${Date.now()}-${current.length}`),
    ]);
  };

  const removeVariant = (key: string) => {
    setVariants((current) =>
      current.length === 1 ? current : current.filter((variant) => variant.key !== key),
    );
  };

  const saveCatalogOption = (kind: CatalogOptionKind) => {
    const isCategory = kind === "category";
    const rawName = isCategory ? newCategoryName : newBrandName;
    const name = rawName.trim();
    setCatalogErrors((current) => ({ ...current, [kind]: undefined }));

    if (name.length < 2) {
      setCatalogErrors((current) => ({ ...current, [kind]: "Ingresa un nombre válido." }));
      return;
    }

    startCatalogTransition(async () => {
      try {
        const option = await createCatalogOptionAction(kind, name);
        if (isCategory) {
          setCategoryOptions((current) => addCatalogOption(current, option));
          setCategoryId(option.id);
          setNewCategoryName("");
          setNewCategoryOpen(false);
        } else {
          setBrandOptions((current) => addCatalogOption(current, option));
          setBrandId(option.id);
          setNewBrandName("");
          setNewBrandOpen(false);
        }
      } catch (error) {
        setCatalogErrors((current) => ({
          ...current,
          [kind]: error instanceof Error ? error.message : "No se pudo crear el registro.",
        }));
      }
    });
  };

  const serializedVariants = JSON.stringify(
    variants.map(({ key: _key, ...variant }) => ({
      ...variant,
      purchasePrice: Number(variant.purchasePrice || 0),
      salePrice: Number(variant.salePrice || 0),
      minimumSalePrice: Number(variant.minimumSalePrice || 0),
    })),
  );

  return (
    <div className="page-stack product-form-page">
      <div className="breadcrumb-row">
        <Link href="/productos" className="back-link">
          <ArrowLeft size={16} /> Productos
        </Link>
        <ChevronRight size={14} />
        <span>Nuevo producto</span>
      </div>

      <section className="page-heading product-form-heading">
        <div>
          <span className="eyebrow">CATÁLOGO</span>
          <h1>Nuevo producto</h1>
          <p>
            Define el producto y sus variantes. El ingreso de IMEI y existencias se hará
            desde compras o inventario para mantener trazabilidad.
          </p>
        </div>
      </section>

      <form action={formAction} className="product-editor">
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="variants" value={serializedVariants} />

        <div className="editor-main">
          {state.status === "error" && (
            <div className="form-alert" role="alert">
              <Info size={18} />
              <div>
                <strong>No se pudo guardar</strong>
                <span>{state.message}</span>
              </div>
            </div>
          )}

          <section className="editor-card">
            <div className="editor-card-heading">
              <span className="step-number">01</span>
              <div>
                <h2>Tipo de producto</h2>
                <p>MOBIX ajustará automáticamente las reglas de inventario.</p>
              </div>
            </div>

            <div className="product-type-grid">
              {productTypes.map((item) => {
                const Icon = item.icon;
                const active = type === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    className={`product-type-card${active ? " active" : ""}`}
                    onClick={() => setType(item.value)}
                  >
                    <span className="product-type-icon"><Icon size={20} /></span>
                    <span className="product-type-copy">
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                    <span className="type-check">{active && <Check size={14} />}</span>
                  </button>
                );
              })}
            </div>
            <FieldError errors={state.fieldErrors?.type} />
          </section>

          <section className="editor-card">
            <div className="editor-card-heading">
              <span className="step-number">02</span>
              <div>
                <h2>Información principal</h2>
                <p>Datos con los que el producto aparecerá en catálogo y POS.</p>
              </div>
            </div>

            <div className="form-grid two-columns">
              <label className="form-field span-2">
                <span>Nombre del producto <b>*</b></span>
                <input name="name" placeholder="Ej. Samsung Galaxy A56 5G" required />
                <FieldError errors={state.fieldErrors?.name} />
              </label>

              <div className="form-field">
                <span>Categoría</span>
                <select
                  name="categoryId"
                  value={categoryId}
                  onChange={(event) => {
                    if (event.target.value === "__create__") {
                      setCategoryId("");
                      setNewCategoryOpen(true);
                      setCatalogErrors((current) => ({ ...current, category: undefined }));
                    } else {
                      setCategoryId(event.target.value);
                      setNewCategoryOpen(false);
                    }
                  }}
                >
                  <option value="">Seleccionar categoría</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                  <option value="__create__">＋ Crear nueva categoría…</option>
                </select>
                {newCategoryOpen && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                    <input
                      value={newCategoryName}
                      onChange={(event) => setNewCategoryName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          saveCatalogOption("category");
                        }
                      }}
                      placeholder="Nombre de la nueva categoría"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={catalogPending}
                      onClick={() => saveCatalogOption("category")}
                    >
                      <Plus size={15} /> Crear
                    </button>
                    <button
                      type="button"
                      className="cancel-button"
                      disabled={catalogPending}
                      onClick={() => {
                        setNewCategoryOpen(false);
                        setNewCategoryName("");
                        setCatalogErrors((current) => ({ ...current, category: undefined }));
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
                {catalogErrors.category && <span className="field-error">{catalogErrors.category}</span>}
                <FieldError errors={state.fieldErrors?.categoryId} />
              </div>

              <div className="form-field">
                <span>Marca</span>
                <select
                  name="brandId"
                  value={brandId}
                  onChange={(event) => {
                    if (event.target.value === "__create__") {
                      setBrandId("");
                      setNewBrandOpen(true);
                      setCatalogErrors((current) => ({ ...current, brand: undefined }));
                    } else {
                      setBrandId(event.target.value);
                      setNewBrandOpen(false);
                    }
                  }}
                >
                  <option value="">Seleccionar marca</option>
                  {brandOptions.map((brand) => (
                    <option key={brand.id} value={brand.id}>{brand.name}</option>
                  ))}
                  <option value="__create__">＋ Crear nueva marca…</option>
                </select>
                {newBrandOpen && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                    <input
                      value={newBrandName}
                      onChange={(event) => setNewBrandName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          saveCatalogOption("brand");
                        }
                      }}
                      placeholder="Nombre de la nueva marca"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={catalogPending}
                      onClick={() => saveCatalogOption("brand")}
                    >
                      <Plus size={15} /> Crear
                    </button>
                    <button
                      type="button"
                      className="cancel-button"
                      disabled={catalogPending}
                      onClick={() => {
                        setNewBrandOpen(false);
                        setNewBrandName("");
                        setCatalogErrors((current) => ({ ...current, brand: undefined }));
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
                {catalogErrors.brand && <span className="field-error">{catalogErrors.brand}</span>}
                <FieldError errors={state.fieldErrors?.brandId} />
              </div>

              <label className="form-field">
                <span>Modelo</span>
                <input name="model" placeholder="Ej. SM-A566E" />
              </label>

              <label className="form-field">
                <span>SKU general</span>
                <input name="sku" placeholder="Ej. SAM-A56-5G" />
              </label>

              <label className="form-field">
                <span>Código de barras</span>
                <div className="input-with-icon">
                  <Barcode size={16} />
                  <input name="barcode" placeholder="Escanea o escribe el código" />
                </div>
              </label>

              <label className="form-field">
                <span>Garantía</span>
                <div className="input-suffix">
                  <input name="warrantyDays" type="number" min="0" defaultValue="365" />
                  <span>días</span>
                </div>
              </label>

              <label className="form-field span-2">
                <span>Descripción</span>
                <textarea
                  name="description"
                  rows={3}
                  placeholder="Descripción breve, características comerciales u observaciones..."
                />
              </label>
            </div>
          </section>

          <section className="editor-card">
            <div className="editor-card-heading variant-heading">
              <div className="heading-with-step">
                <span className="step-number">03</span>
                <div>
                  <h2>Variantes y precios</h2>
                  <p>Color, memoria y precios pueden cambiar por variante.</p>
                </div>
              </div>
              <button type="button" className="secondary-button" onClick={addVariant}>
                <Plus size={16} /> Agregar variante
              </button>
            </div>

            <div className="variants-stack">
              {variants.map((variant, index) => {
                const cost = Number(variant.purchasePrice || 0);
                const price = Number(variant.salePrice || 0);
                const profit = price - cost;
                const margin = cost > 0 ? (profit / cost) * 100 : 0;

                return (
                  <div className="variant-card" key={variant.key}>
                    <div className="variant-card-top">
                      <div>
                        <strong>Variante {index + 1}</strong>
                        <span>
                          {[variant.ram, variant.storage, variant.color].filter(Boolean).join(" · ") ||
                            "Completa sus características"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="danger-icon-button"
                        disabled={variants.length === 1}
                        onClick={() => removeVariant(variant.key)}
                        aria-label={`Eliminar variante ${index + 1}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="form-grid variant-grid">
                      {(type === "PHONE" || type === "SERIALIZED") && (
                        <label className="form-field">
                          <span>Color</span>
                          <input
                            value={variant.color}
                            onChange={(event) => updateVariant(variant.key, "color", event.target.value)}
                            placeholder="Negro"
                          />
                        </label>
                      )}

                      {type === "PHONE" && (
                        <>
                          <label className="form-field">
                            <span>RAM</span>
                            <input
                              value={variant.ram}
                              onChange={(event) => updateVariant(variant.key, "ram", event.target.value)}
                              placeholder="8 GB"
                            />
                          </label>
                          <label className="form-field">
                            <span>Almacenamiento</span>
                            <input
                              value={variant.storage}
                              onChange={(event) => updateVariant(variant.key, "storage", event.target.value)}
                              placeholder="256 GB"
                            />
                          </label>
                        </>
                      )}

                      <label className="form-field">
                        <span>SKU variante</span>
                        <input
                          value={variant.sku}
                          onChange={(event) => updateVariant(variant.key, "sku", event.target.value)}
                          placeholder="SAM-A56-256-BLK"
                        />
                      </label>

                      <label className="form-field">
                        <span>Código de barras</span>
                        <input
                          value={variant.barcode}
                          onChange={(event) => updateVariant(variant.key, "barcode", event.target.value)}
                          placeholder="Opcional"
                        />
                      </label>

                      <label className="form-field money-field">
                        <span>Costo</span>
                        <div className="input-prefix">
                          <span>S/</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={variant.purchasePrice}
                            onChange={(event) =>
                              updateVariant(variant.key, "purchasePrice", event.target.value)
                            }
                          />
                        </div>
                      </label>

                      <label className="form-field money-field">
                        <span>Precio de venta <b>*</b></span>
                        <div className="input-prefix">
                          <span>S/</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={variant.salePrice}
                            onChange={(event) =>
                              updateVariant(variant.key, "salePrice", event.target.value)
                            }
                          />
                        </div>
                      </label>

                      <label className="form-field money-field">
                        <span>Precio mínimo</span>
                        <div className="input-prefix">
                          <span>S/</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={variant.minimumSalePrice}
                            onChange={(event) =>
                              updateVariant(variant.key, "minimumSalePrice", event.target.value)
                            }
                          />
                        </div>
                      </label>

                      <div className="margin-preview">
                        <CircleDollarSign size={18} />
                        <div>
                          <span>Utilidad estimada</span>
                          <strong>{money(profit)}</strong>
                          <small>{margin.toFixed(1)}% sobre costo</small>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <FieldError errors={state.fieldErrors?.variants} />
          </section>
        </div>

        <aside className="editor-sidebar">
          <section className="editor-card sticky-card">
            <h3>Reglas de inventario</h3>
            <p className="side-card-copy">Se configuran según el tipo seleccionado.</p>

            <div className="rule-list">
              <div className={typeRule.stock ? "rule-row enabled" : "rule-row"}>
                <span><Check size={13} /></span>
                <div><strong>Control de stock</strong><small>{typeRule.stock ? "Activo" : "No aplica"}</small></div>
              </div>
              <div className={typeRule.serial ? "rule-row enabled" : "rule-row"}>
                <span><Check size={13} /></span>
                <div><strong>Número de serie</strong><small>{typeRule.serial ? "Requerido" : "No requerido"}</small></div>
              </div>
              <div className={typeRule.imei ? "rule-row enabled" : "rule-row"}>
                <span><Check size={13} /></span>
                <div><strong>IMEI</strong><small>{typeRule.imei ? "Requerido" : "No requerido"}</small></div>
              </div>
            </div>

            <div className="rule-note">
              <Info size={15} />
              <span>{typeRule.message}</span>
            </div>

            {typeRule.stock && (
              <label className="form-field compact-field">
                <span>Alerta de stock mínimo</span>
                <input name="minimumStock" type="number" min="0" defaultValue="2" />
              </label>
            )}
            {!typeRule.stock && <input type="hidden" name="minimumStock" value="0" />}

            <div className="editor-actions">
              <button type="submit" className="primary-button save-button" disabled={pending || catalogPending}>
                <Save size={17} /> {pending ? "Guardando..." : "Guardar producto"}
              </button>
              <Link href="/productos" className="cancel-button">Cancelar</Link>
            </div>
          </section>
        </aside>
      </form>
    </div>
  );
}
