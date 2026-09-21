"use client";

import Link from "next/link";
import { ArrowLeft, Barcode, ImagePlus, Save, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { PRODUCT_TYPE_LABELS, type ProductCatalogOption, type ProductTypeValue } from "./product-types";

type EditableVariant = {
  id: string;
  sku: string | null;
  barcode: string | null;
  color: string | null;
  ram: string | null;
  storage: string | null;
  purchasePrice: number;
  salePrice: number;
  minimumSalePrice: number;
  status: "ACTIVE" | "INACTIVE";
};

export type EditableProduct = {
  id: string;
  type: ProductTypeValue;
  name: string;
  model: string | null;
  categoryId: string | null;
  brandId: string | null;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  warrantyDays: number;
  minimumStock: number;
  status: "ACTIVE" | "INACTIVE";
  imageUrl: string | null;
  variants: EditableVariant[];
};

type VariantDraft = {
  id?: string;
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

function readImageAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

async function compressProductImage(file: File) {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) throw new Error("Usa una imagen JPG, PNG o WebP.");
  if (file.size > 6 * 1024 * 1024) throw new Error("La imagen original no puede superar 6 MB.");

  const source = await readImageAsDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new window.Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("No se pudo procesar la imagen."));
    element.src = source;
  });

  const scale = Math.min(1, 720 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar la imagen.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let dataUrl = canvas.toDataURL("image/webp", 0.82);
  if (dataUrl.length > 1_050_000) dataUrl = canvas.toDataURL("image/webp", 0.68);
  if (dataUrl.length > 1_050_000) throw new Error("La imagen sigue siendo demasiado pesada. Prueba otra foto.");

  const comma = dataUrl.indexOf(",");
  return {
    preview: dataUrl,
    data: dataUrl.slice(comma + 1),
    mimeType: "image/webp",
  };
}

export function ProductEditForm({
  product,
  categories,
  brands,
}: {
  product: EditableProduct;
  categories: ProductCatalogOption[];
  brands: ProductCatalogOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [name, setName] = useState(product.name);
  const [model, setModel] = useState(product.model ?? "");
  const [categoryId, setCategoryId] = useState(product.categoryId ?? "");
  const [brandId, setBrandId] = useState(product.brandId ?? "");
  const [sku, setSku] = useState(product.sku ?? "");
  const [barcode, setBarcode] = useState(product.barcode ?? "");
  const [description, setDescription] = useState(product.description ?? "");
  const [warrantyDays, setWarrantyDays] = useState(String(product.warrantyDays));
  const [minimumStock, setMinimumStock] = useState(String(product.minimumStock));
  const [imagePreview, setImagePreview] = useState(product.imageUrl ?? "");
  const [imageData, setImageData] = useState("");
  const [imageMimeType, setImageMimeType] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [variants, setVariants] = useState<VariantDraft[]>(
    product.variants.map((variant, index) => ({
      id: variant.id,
      key: variant.id || `variant-${index}`,
      sku: variant.sku ?? "",
      barcode: variant.barcode ?? "",
      color: variant.color ?? "",
      ram: variant.ram ?? "",
      storage: variant.storage ?? "",
      purchasePrice: String(variant.purchasePrice),
      salePrice: String(variant.salePrice),
      minimumSalePrice: String(variant.minimumSalePrice),
    })),
  );

  const typeLabel = PRODUCT_TYPE_LABELS[product.type];

  const updateVariant = (key: string, field: keyof VariantDraft, value: string) => {
    setVariants((current) => current.map((variant) => variant.key === key ? { ...variant, [field]: value } : variant));
  };

  const addVariant = () => {
    setVariants((current) => [
      ...current,
      {
        key: `new-${Date.now()}-${current.length}`,
        sku: "",
        barcode: "",
        color: "",
        ram: "",
        storage: "",
        purchasePrice: "0",
        salePrice: "0",
        minimumSalePrice: "0",
      },
    ]);
  };

  const payloadVariants = useMemo(() => variants.map((variant) => ({
    id: variant.id ?? null,
    sku: variant.sku,
    barcode: variant.barcode,
    color: variant.color,
    ram: variant.ram,
    storage: variant.storage,
    purchasePrice: Number(variant.purchasePrice || 0),
    salePrice: Number(variant.salePrice || 0),
    minimumSalePrice: Number(variant.minimumSalePrice || 0),
  })), [variants]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/products/${product.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            categoryId,
            brandId,
            name,
            model,
            sku,
            barcode,
            description,
            warrantyDays: Number(warrantyDays || 0),
            minimumStock: Number(minimumStock || 0),
            imageData: imageData || null,
            imageMimeType: imageMimeType || null,
            removeImage,
            variants: payloadVariants,
          }),
          cache: "no-store",
        });

        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(body.error ?? "No se pudo actualizar el producto.");

        window.location.assign("/productos?updated=1");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo actualizar el producto.");
      }
    });
  }

  return (
    <div className="page-stack product-form-page">
      <div className="breadcrumb-row">
        <Link href="/productos" className="back-link"><ArrowLeft size={16} /> Productos</Link>
        <span>Editar producto</span>
      </div>

      <section className="page-heading product-form-heading">
        <div>
          <span className="eyebrow">INVENTARIO</span>
          <h1>Editar producto</h1>
          <p>Actualiza información comercial, precios, variantes e imagen sin perder trazabilidad.</p>
        </div>
        <span className={`status-badge${product.status === "INACTIVE" ? " inactive" : ""}`}>
          {product.status === "ACTIVE" ? "Activo" : "Inactivo"}
        </span>
      </section>

      <form className="product-editor" onSubmit={submit}>
        <div className="editor-main">
          {error && <div className="form-alert" role="alert"><strong>No se pudo guardar</strong><span>{error}</span></div>}

          <section className="editor-card">
            <div className="editor-card-heading">
              <span className="step-number">01</span>
              <div>
                <h2>Información principal</h2>
                <p>Tipo: <strong>{typeLabel}</strong>. El tipo no se cambia para proteger la trazabilidad.</p>
              </div>
            </div>

            <div className="form-grid two-columns">
              <div className="product-image-field span-2">
                <div className={imagePreview ? "product-image-preview has-image" : "product-image-preview"}>
                  {imagePreview ? <img src={imagePreview} alt="Vista previa del producto" /> : <ImagePlus size={28} />}
                </div>
                <div className="product-image-copy">
                  <strong>Imagen del producto</strong>
                  <span>Puedes reemplazarla o quitarla sin afectar ventas anteriores.</span>
                  <div className="product-image-actions">
                    <label className="secondary-button product-image-select">
                      <ImagePlus size={15} />
                      {imagePreview ? "Cambiar imagen" : "Seleccionar imagen"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={pending || imageProcessing}
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          setImageProcessing(true);
                          setError("");
                          try {
                            const optimized = await compressProductImage(file);
                            setImagePreview(optimized.preview);
                            setImageData(optimized.data);
                            setImageMimeType(optimized.mimeType);
                            setRemoveImage(false);
                          } catch (cause) {
                            setError(cause instanceof Error ? cause.message : "No se pudo procesar la imagen.");
                          } finally {
                            setImageProcessing(false);
                            event.target.value = "";
                          }
                        }}
                      />
                    </label>
                    {imagePreview && (
                      <button
                        type="button"
                        className="cancel-button"
                        onClick={() => {
                          setImagePreview("");
                          setImageData("");
                          setImageMimeType("");
                          setRemoveImage(true);
                        }}
                      >
                        <Trash2 size={14} /> Quitar imagen
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <label className="form-field span-2">
                <span>Nombre del producto <b>*</b></span>
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>

              <label className="form-field">
                <span>Categoría</span>
                <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">Sin categoría</option>
                  {categories.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </label>

              <label className="form-field">
                <span>Marca</span>
                <select value={brandId} onChange={(event) => setBrandId(event.target.value)}>
                  <option value="">Sin marca</option>
                  {brands.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </label>

              <label className="form-field">
                <span>Modelo</span>
                <input value={model} onChange={(event) => setModel(event.target.value)} />
              </label>

              <label className="form-field">
                <span>SKU general</span>
                <input value={sku} onChange={(event) => setSku(event.target.value)} />
              </label>

              <label className="form-field">
                <span>Código de barras</span>
                <div className="input-with-icon">
                  <Barcode size={16} />
                  <input value={barcode} onChange={(event) => setBarcode(event.target.value)} />
                </div>
              </label>

              <label className="form-field">
                <span>Garantía</span>
                <div className="input-suffix">
                  <input type="number" min="0" value={warrantyDays} onChange={(event) => setWarrantyDays(event.target.value)} />
                  <span>días</span>
                </div>
              </label>

              <label className="form-field span-2">
                <span>Descripción</span>
                <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
              </label>
            </div>
          </section>

          <section className="editor-card">
            <div className="editor-card-heading variant-heading">
              <div>
                <h2>Variantes y precios</h2>
                <p>Las variantes existentes se conservan para no romper ventas o compras históricas.</p>
              </div>
              <button type="button" className="secondary-button" onClick={addVariant}>+ Agregar variante</button>
            </div>

            <div className="variants-stack">
              {variants.map((variant, index) => (
                <div className="variant-card" key={variant.key}>
                  <div className="variant-card-top">
                    <div>
                      <strong>Variante {index + 1}</strong>
                      <span>{variant.id ? "Existente" : "Nueva"}</span>
                    </div>
                  </div>
                  <div className="form-grid variant-grid">
                    {(product.type === "PHONE" || product.type === "SERIALIZED") && (
                      <label className="form-field"><span>Color</span><input value={variant.color} onChange={(event) => updateVariant(variant.key, "color", event.target.value)} /></label>
                    )}
                    {product.type === "PHONE" && (
                      <>
                        <label className="form-field"><span>RAM</span><input value={variant.ram} onChange={(event) => updateVariant(variant.key, "ram", event.target.value)} /></label>
                        <label className="form-field"><span>Almacenamiento</span><input value={variant.storage} onChange={(event) => updateVariant(variant.key, "storage", event.target.value)} /></label>
                      </>
                    )}
                    <label className="form-field"><span>SKU variante</span><input value={variant.sku} onChange={(event) => updateVariant(variant.key, "sku", event.target.value)} /></label>
                    <label className="form-field"><span>Código de barras</span><input value={variant.barcode} onChange={(event) => updateVariant(variant.key, "barcode", event.target.value)} /></label>
                    <label className="form-field money-field"><span>Costo</span><div className="input-prefix"><span>S/</span><input type="number" min="0" step="0.01" value={variant.purchasePrice} onChange={(event) => updateVariant(variant.key, "purchasePrice", event.target.value)} /></div></label>
                    <label className="form-field money-field"><span>Precio de venta</span><div className="input-prefix"><span>S/</span><input type="number" min="0" step="0.01" value={variant.salePrice} onChange={(event) => updateVariant(variant.key, "salePrice", event.target.value)} /></div></label>
                    <label className="form-field money-field"><span>Precio mínimo</span><div className="input-prefix"><span>S/</span><input type="number" min="0" step="0.01" value={variant.minimumSalePrice} onChange={(event) => updateVariant(variant.key, "minimumSalePrice", event.target.value)} /></div></label>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="editor-sidebar">
          <section className="editor-card sticky-card">
            <h3>Control del producto</h3>
            <p className="side-card-copy">El estado se administra desde la lista de Productos.</p>
            <div className="rule-list">
              <div className="rule-row enabled"><div><strong>Tipo</strong><small>{typeLabel}</small></div></div>
              <div className="rule-row enabled"><div><strong>Estado</strong><small>{product.status === "ACTIVE" ? "Activo" : "Inactivo"}</small></div></div>
            </div>

            {product.type !== "SERVICE" && (
              <label className="form-field compact-field">
                <span>Alerta de stock mínimo</span>
                <input type="number" min="0" value={minimumStock} onChange={(event) => setMinimumStock(event.target.value)} />
              </label>
            )}

            <div className="editor-actions">
              <button type="submit" className="primary-button save-button" disabled={pending || imageProcessing}>
                <Save size={17} /> {pending ? "Guardando..." : "Guardar cambios"}
              </button>
              <Link href="/productos" className="cancel-button">Cancelar</Link>
            </div>
          </section>
        </aside>
      </form>
    </div>
  );
}
