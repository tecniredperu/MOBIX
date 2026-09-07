"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { createPurchaseAction } from "./purchase-actions";
import { PURCHASE_TAX_LABELS } from "./purchase-types";
import type { PurchaseCatalogItem, PurchaseLineInput, PurchaseTaxCondition } from "./purchase-types";

type WarehouseOption = { id: string; name: string; branchName: string };

type EditableLine = PurchaseLineInput & { key: string };

function money(value: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value || 0);
}

function todayPeru() {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" });
  return formatter.format(new Date());
}

function emptyUnits(quantity: number) {
  return Array.from({ length: quantity }, () => ({ imei1: "", imei2: "", serial: "" }));
}

export function PurchaseForm({ catalog, warehouses }: { catalog: PurchaseCatalogItem[]; warehouses: WarehouseOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [supplierDocumentType, setSupplierDocumentType] = useState<"RUC" | "DNI" | "CE" | "OTHER">("RUC");
  const [supplierDocumentNumber, setSupplierDocumentNumber] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [documentType, setDocumentType] = useState<"FACTURA" | "BOLETA" | "GUIA" | "OTRO">("FACTURA");
  const [documentSeries, setDocumentSeries] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayPeru());
  const [taxCondition, setTaxCondition] = useState<PurchaseTaxCondition>("TAXED");
  const [notes, setNotes] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState(catalog[0]?.variantId ?? "");
  const [lines, setLines] = useState<EditableLine[]>([]);

  const catalogMap = useMemo(() => new Map(catalog.map((item) => [item.variantId, item])), [catalog]);
  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0), [lines]);
  const tax = taxCondition === "TAXED" ? subtotal * 0.18 : 0;
  const total = subtotal + tax;

  function addLine() {
    const item = catalogMap.get(selectedVariantId);
    if (!item) return;
    const existing = lines.find((line) => line.variantId === item.variantId);
    if (existing) {
      setLines((current) => current.map((line) => line.key === existing.key ? resizeLine(line, line.quantity + 1, item) : line));
      return;
    }
    const serialized = item.type === "PHONE" || item.type === "SERIALIZED";
    setLines((current) => [...current, {
      key: `${item.variantId}-${Date.now()}`,
      variantId: item.variantId,
      quantity: 1,
      unitCost: item.purchasePrice,
      units: serialized ? emptyUnits(1) : undefined,
    }]);
  }

  function resizeLine(line: EditableLine, quantity: number, item: PurchaseCatalogItem): EditableLine {
    const safeQuantity = Math.max(1, Math.min(200, Math.trunc(quantity || 1)));
    const serialized = item.type === "PHONE" || item.type === "SERIALIZED";
    if (!serialized) return { ...line, quantity: safeQuantity, units: undefined };
    const current = line.units ?? [];
    const units = Array.from({ length: safeQuantity }, (_, index) => current[index] ?? { imei1: "", imei2: "", serial: "" });
    return { ...line, quantity: safeQuantity, units };
  }

  function updateQuantity(key: string, quantity: number) {
    setLines((current) => current.map((line) => {
      if (line.key !== key) return line;
      const item = catalogMap.get(line.variantId);
      return item ? resizeLine(line, quantity, item) : line;
    }));
  }

  function updateUnit(key: string, index: number, field: "imei1" | "imei2" | "serial", value: string) {
    setLines((current) => current.map((line) => {
      if (line.key !== key) return line;
      const units = [...(line.units ?? [])];
      units[index] = { ...units[index], [field]: value };
      return { ...line, units };
    }));
  }

  function submit() {
    setError("");
    startTransition(async () => {
      try {
        const result = await createPurchaseAction({
          supplier: { documentType: supplierDocumentType, documentNumber: supplierDocumentNumber, businessName: supplierName, phone: supplierPhone },
          warehouseId,
          documentType,
          documentSeries,
          documentNumber,
          issueDate,
          taxCondition,
          notes,
          lines: lines.map(({ key: _key, ...line }) => line),
        });
        router.push(`/compras?created=1&number=${encodeURIComponent(result.number)}`);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo registrar la compra.");
      }
    });
  }

  return (
    <div className="page-stack purchase-form-page">
      <section className="page-heading">
        <div><span className="eyebrow">COMPRAS · PERÚ</span><h1>Nueva compra</h1><p>Ingresa el comprobante, proveedor y mercadería. MOBIX actualizará stock, IMEI y Kardex.</p></div>
        <Link href="/compras" className="ghost-button"><ArrowLeft size={17} /> Volver</Link>
      </section>

      {error && <div className="error-banner"><strong>No se pudo guardar</strong><span>{error}</span></div>}

      <div className="purchase-layout">
        <div className="page-stack">
          <section className="panel mobix-form-section">
            <div className="section-title"><div><h2>Proveedor</h2><p>Datos del proveedor que entrega la mercadería.</p></div></div>
            <div className="mobix-form-grid four">
              <label><span>Tipo documento</span><select value={supplierDocumentType} onChange={(e) => setSupplierDocumentType(e.target.value as typeof supplierDocumentType)}><option value="RUC">RUC</option><option value="DNI">DNI</option><option value="CE">Carné de extranjería</option><option value="OTHER">Otro</option></select></label>
              <label><span>N.º documento</span><input value={supplierDocumentNumber} onChange={(e) => setSupplierDocumentNumber(e.target.value)} placeholder={supplierDocumentType === "RUC" ? "20123456789" : "Documento"} /></label>
              <label className="span-two"><span>Razón social / nombre</span><input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Distribuciones Perú S.A.C." /></label>
              <label><span>Teléfono</span><input value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} placeholder="999 999 999" /></label>
              <label className="span-three"><span>Almacén de destino</span><select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.branchName} · {warehouse.name}</option>)}</select></label>
            </div>
          </section>

          <section className="panel mobix-form-section">
            <div className="section-title"><div><h2>Comprobante de compra</h2><p>Configurado para operaciones habituales en Perú.</p></div></div>
            <div className="mobix-form-grid four">
              <label><span>Documento</span><select value={documentType} onChange={(e) => setDocumentType(e.target.value as typeof documentType)}><option value="FACTURA">Factura (01)</option><option value="BOLETA">Boleta de venta (03)</option><option value="GUIA">Guía / ingreso</option><option value="OTRO">Otro</option></select></label>
              <label><span>Serie</span><input value={documentSeries} onChange={(e) => setDocumentSeries(e.target.value.toUpperCase())} placeholder="F001" /></label>
              <label><span>Número</span><input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} placeholder="00001234" /></label>
              <label><span>Fecha emisión</span><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
              <label className="span-two"><span>Condición tributaria</span><select value={taxCondition} onChange={(e) => setTaxCondition(e.target.value as PurchaseTaxCondition)}>{Object.entries(PURCHASE_TAX_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="span-two"><span>Observaciones</span><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></label>
            </div>
          </section>

          <section className="panel mobix-form-section">
            <div className="section-title"><div><h2>Productos</h2><p>Los celulares y equipos serializados solicitarán sus identificadores por unidad.</p></div></div>
            <div className="purchase-add-row">
              <select value={selectedVariantId} onChange={(e) => setSelectedVariantId(e.target.value)}>
                {catalog.map((item) => <option key={item.variantId} value={item.variantId}>{item.name} · {[item.ram, item.storage, item.color].filter(Boolean).join(" / ") || "Variante base"} · {item.brand}</option>)}
              </select>
              <button type="button" className="secondary-button" onClick={addLine}><Plus size={17} /> Agregar</button>
            </div>

            <div className="purchase-lines">
              {lines.map((line) => {
                const item = catalogMap.get(line.variantId)!;
                const serialized = item.type === "PHONE" || item.type === "SERIALIZED";
                return (
                  <article className="purchase-line" key={line.key}>
                    <div className="purchase-line-head">
                      <div><strong>{item.name}</strong><span>{item.brand} · {[item.ram, item.storage, item.color].filter(Boolean).join(" / ") || item.model || "Variante base"}</span></div>
                      <button className="row-menu danger" type="button" onClick={() => setLines((current) => current.filter((value) => value.key !== line.key))}><Trash2 size={17} /></button>
                    </div>
                    <div className="line-fields">
                      <label><span>Cantidad</span><input type="number" min="1" max="200" value={line.quantity} onChange={(e) => updateQuantity(line.key, Number(e.target.value))} /></label>
                      <label><span>Costo unitario S/</span><input type="number" min="0" step="0.01" value={line.unitCost} onChange={(e) => setLines((current) => current.map((value) => value.key === line.key ? { ...value, unitCost: Number(e.target.value) } : value))} /></label>
                      <div className="line-total"><span>Subtotal</span><strong>{money(line.quantity * line.unitCost)}</strong></div>
                    </div>

                    {serialized && <div className="imei-grid"><div className="imei-head"><span>#</span><span>IMEI 1{item.requiresImei ? " *" : ""}</span><span>IMEI 2</span><span>Serie{item.requiresSerial ? " *" : ""}</span></div>{(line.units ?? []).map((unit, index) => <div className="imei-row" key={index}><span>{index + 1}</span><input inputMode="numeric" maxLength={15} value={unit.imei1 ?? ""} onChange={(e) => updateUnit(line.key, index, "imei1", e.target.value.replace(/\D/g, ""))} placeholder="15 dígitos" /><input inputMode="numeric" maxLength={15} value={unit.imei2 ?? ""} onChange={(e) => updateUnit(line.key, index, "imei2", e.target.value.replace(/\D/g, ""))} placeholder="Opcional" /><input value={unit.serial ?? ""} onChange={(e) => updateUnit(line.key, index, "serial", e.target.value.toUpperCase())} placeholder="N.º de serie" /></div>)}</div>}
                  </article>
                );
              })}
              {!lines.length && <div className="purchase-empty"><ShoppingBagIcon /><strong>Aún no agregaste productos</strong><span>Selecciona un producto del catálogo y pulsa Agregar.</span></div>}
            </div>
          </section>
        </div>

        <aside className="purchase-summary-card panel">
          <span className="eyebrow">RESUMEN</span>
          <h2>Totales</h2>
          <div className="summary-row"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
          <div className="summary-row"><span>{taxCondition === "TAXED" ? "IGV 18%" : "IGV"}</span><strong>{money(tax)}</strong></div>
          <div className="summary-row total"><span>Total</span><strong>{money(total)}</strong></div>
          <div className="tax-note">{PURCHASE_TAX_LABELS[taxCondition]} · Moneda PEN (S/)</div>
          <button className="primary-button wide" type="button" onClick={submit} disabled={pending || !lines.length}>{pending ? "Registrando..." : <><Save size={18} /> Confirmar compra</>}</button>
          <p className="form-footnote">Al confirmar se crean los equipos/IMEI, el saldo de accesorios y los movimientos de Kardex en una sola transacción.</p>
        </aside>
      </div>
    </div>
  );
}

function ShoppingBagIcon() {
  return <div className="purchase-empty-icon">+</div>;
}
