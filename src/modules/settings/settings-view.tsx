"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Building2, Boxes, ImagePlus, Plus, Save, Settings2, Store, Trash2 } from "lucide-react";
import { saveBranchAction, saveWarehouseAction, updateCompanyAction, updateCompanySettingsAction } from "./settings-actions";

const LOGO_INPUT_MAX_BYTES = 5 * 1024 * 1024;
const LOGO_DATA_MAX_LENGTH = 800_000;
const LOGO_MAX_SIDE = 640;
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

async function loadBrowserImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("La imagen seleccionada no es válida."));
    image.src = src;
  });
}

async function optimizeLogo(file: File) {
  if (!LOGO_TYPES.has(file.type)) throw new Error("El logo debe ser PNG, JPG o WebP.");
  if (file.size > LOGO_INPUT_MAX_BYTES) throw new Error("El archivo del logo no debe superar 5 MB.");

  const original = await fileToDataUrl(file);
  const image = await loadBrowserImage(original);
  const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo procesar el logo.");
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const optimized = canvas.toDataURL("image/webp", 0.86);
  if (optimized.length > LOGO_DATA_MAX_LENGTH) throw new Error("El logo sigue siendo demasiado pesado. Usa una imagen más simple.");
  return optimized;
}

export function SettingsView({ data }: { data: any }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [company, setCompany] = useState(data.company);
  const [settings, setSettings] = useState(data.settings);
  const [newBranch, setNewBranch] = useState(false);
  const [newWarehouse, setNewWarehouse] = useState(false);

  function run(fn: () => Promise<any>, message: string) {
    setError("");
    setSuccess("");
    start(async () => {
      try {
        await fn();
        setSuccess(message);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo guardar la configuración.");
      }
    });
  }

  async function selectLogo(file?: File) {
    if (!file) return;
    setError("");
    setSuccess("");
    setLogoBusy(true);
    try {
      const logoUrl = await optimizeLogo(file);
      setCompany((current: any) => ({ ...current, logoUrl }));
      setSuccess("Logo listo. Pulsa Guardar empresa para aplicar el cambio.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo procesar el logo.");
    } finally {
      setLogoBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div><span className="eyebrow">CONFIGURACIÓN</span><h1>Empresa y operación</h1><p>Datos fiscales, comprobantes, impuestos, sucursales, almacenes y parámetros generales de MOBIX.</p></div>
      </section>
      {error && <div className="error-banner"><strong>No se pudo guardar</strong><span>{error}</span></div>}
      {success && <div className="cash-success-banner"><Save size={17} /><span>{success}</span></div>}

      <section className="settings-grid">
        <article className="panel settings-card">
          <div className="section-title"><div><h2>Datos de la empresa</h2><p>Información comercial y de identificación.</p></div><Building2 size={20} /></div>
          <div className="settings-form-grid">
            <Field label="Razón social" value={company.businessName} onChange={(v) => setCompany({ ...company, businessName: v })} />
            <Field label="Nombre comercial" value={company.tradeName} onChange={(v) => setCompany({ ...company, tradeName: v })} />
            <Field label="RUC" value={company.ruc} onChange={(v) => setCompany({ ...company, ruc: v })} />
            <Field label="Correo" value={company.email} onChange={(v) => setCompany({ ...company, email: v })} />
            <Field label="Teléfono" value={company.phone} onChange={(v) => setCompany({ ...company, phone: v })} />
            <Field label="Dirección" value={company.address} onChange={(v) => setCompany({ ...company, address: v })} />

            <div className="span-two" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 650, color: "#536174" }}>Logo de la empresa</span>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: 12, border: "1px solid #dbe2ea", borderRadius: 12, background: "#f8fafc" }}>
                <div style={{ width: 82, height: 64, display: "grid", placeItems: "center", overflow: "hidden", border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff" }}>
                  {company.logoUrl ? <img src={company.logoUrl} alt="Vista previa del logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <Building2 size={25} style={{ color: "#94a3b8" }} />}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 220, flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <label className="secondary-button" style={{ cursor: logoBusy ? "wait" : "pointer" }}>
                      <ImagePlus size={15} /> {logoBusy ? "Procesando..." : company.logoUrl ? "Cambiar logo" : "Subir logo"}
                      <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={logoBusy || pending} onChange={(e) => void selectLogo(e.target.files?.[0])} />
                    </label>
                    {company.logoUrl && <button className="ghost-button" type="button" disabled={pending || logoBusy} onClick={() => setCompany({ ...company, logoUrl: "" })}><Trash2 size={15} /> Quitar</button>}
                  </div>
                  <small style={{ color: "#748094", lineHeight: 1.4 }}>PNG, JPG o WebP. MOBIX optimiza el archivo automáticamente para mantener rápida la aplicación.</small>
                </div>
              </div>
            </div>

            <label><span>Moneda</span><select value={company.currency} onChange={(e) => setCompany({ ...company, currency: e.target.value })}><option value="PEN">PEN · Sol peruano</option><option value="USD">USD · Dólar</option></select></label>
            <label><span>Zona horaria</span><select value={company.timezone} onChange={(e) => setCompany({ ...company, timezone: e.target.value })}><option value="America/Lima">America/Lima</option></select></label>
          </div>
          <button className="primary-button" disabled={pending || logoBusy} onClick={() => run(() => updateCompanyAction(company), "Datos de empresa actualizados.")}><Save size={15} /> Guardar empresa</button>
        </article>

        <article className="panel settings-card">
          <div className="section-title"><div><h2>Parámetros de venta</h2><p>Series internas, IGV, garantía y ticket.</p></div><Settings2 size={20} /></div>
          <div className="settings-form-grid">
            <label><span>IGV / impuesto (%)</span><input type="number" min="0" max="100" step="0.001" value={settings.taxRate} onChange={(e) => setSettings({ ...settings, taxRate: Number(e.target.value) })} /></label>
            <label><span>Condición tributaria predeterminada</span><select value={settings.defaultTaxCondition} onChange={(e) => setSettings({ ...settings, defaultTaxCondition: e.target.value })}><option value="TAXED">Gravado</option><option value="EXEMPT">Exonerado</option><option value="UNAFFECTED">Inafecto</option></select></label>
            <Field label="Serie Boleta" value={settings.receiptSeries} onChange={(v) => setSettings({ ...settings, receiptSeries: v })} />
            <Field label="Serie Factura" value={settings.invoiceSeries} onChange={(v) => setSettings({ ...settings, invoiceSeries: v })} />
            <Field label="Serie Nota de venta" value={settings.salesNoteSeries} onChange={(v) => setSettings({ ...settings, salesNoteSeries: v })} />
            <label><span>Garantía predeterminada (días)</span><input type="number" min="0" value={settings.defaultWarrantyDays} onChange={(e) => setSettings({ ...settings, defaultWarrantyDays: Number(e.target.value) })} /></label>
            <label className="span-two"><span>Pie de ticket</span><textarea rows={3} value={settings.ticketFooter} onChange={(e) => setSettings({ ...settings, ticketFooter: e.target.value })} placeholder="Gracias por su compra..." /></label>
            <label className="settings-switch span-two"><input type="checkbox" checked={settings.requireCashSession} onChange={(e) => setSettings({ ...settings, requireCashSession: e.target.checked })} /><span><strong>Exigir caja abierta para vender</strong><small>Evita operaciones comerciales fuera de un turno de caja.</small></span></label>
          </div>
          <button className="primary-button" disabled={pending} onClick={() => run(() => updateCompanySettingsAction(settings), "Parámetros comerciales actualizados.")}><Save size={15} /> Guardar parámetros</button>
        </article>
      </section>

      <section className="panel settings-list-card">
        <div className="panel-heading"><div><h2>Sucursales</h2><p>Locales comerciales de la empresa.</p></div><button className="secondary-button" onClick={() => setNewBranch((v) => !v)}><Plus size={15} /> Nueva sucursal</button></div>
        {newBranch && <BranchEditor branch={{ name: "", code: "", address: "", phone: "", status: "ACTIVE" }} pending={pending} onSave={(v: any) => run(() => saveBranchAction(v), "Sucursal creada.")} />}
        <div className="settings-entity-list">{data.branches.map((b: any) => <BranchEditor key={b.id} branch={b} pending={pending} onSave={(v: any) => run(() => saveBranchAction(v), "Sucursal actualizada.")} />)}</div>
      </section>

      <section className="panel settings-list-card">
        <div className="panel-heading"><div><h2>Almacenes</h2><p>Existencias, ventas y transferencias por ubicación.</p></div><button className="secondary-button" onClick={() => setNewWarehouse((v) => !v)}><Plus size={15} /> Nuevo almacén</button></div>
        {newWarehouse && <WarehouseEditor warehouse={{ name: "", code: "", description: "", branchId: data.branches[0]?.id || "", isSaleable: true, status: "ACTIVE" }} branches={data.branches} pending={pending} onSave={(v: any) => run(() => saveWarehouseAction(v), "Almacén creado.")} />}
        <div className="settings-entity-list">{data.warehouses.map((w: any) => <WarehouseEditor key={w.id} warehouse={w} branches={data.branches} pending={pending} onSave={(v: any) => run(() => saveWarehouseAction(v), "Almacén actualizado.")} />)}</div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label><span>{label}</span><input value={value || ""} onChange={(e) => onChange(e.target.value)} /></label>;
}

function BranchEditor({ branch, pending, onSave }: { branch: any; pending: boolean; onSave: (v: any) => void }) {
  const [v, setV] = useState(branch);
  return <div className="settings-entity-row"><span className="settings-entity-icon"><Store size={18} /></span><input placeholder="Nombre" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /><input placeholder="Código" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} /><input placeholder="Dirección" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /><input placeholder="Teléfono" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /><select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}><option value="ACTIVE">Activa</option><option value="INACTIVE">Inactiva</option></select><button className="table-action-link" disabled={pending} onClick={() => onSave(v)}><Save size={14} /> Guardar</button></div>;
}

function WarehouseEditor({ warehouse, branches, pending, onSave }: { warehouse: any; branches: any[]; pending: boolean; onSave: (v: any) => void }) {
  const [v, setV] = useState(warehouse);
  return <div className="settings-entity-row warehouse"><span className="settings-entity-icon"><Boxes size={18} /></span><input placeholder="Nombre" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /><input placeholder="Código" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} /><select value={v.branchId} onChange={(e) => setV({ ...v, branchId: e.target.value })}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><input placeholder="Descripción" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /><label className="inline-check"><input type="checkbox" checked={v.isSaleable} onChange={(e) => setV({ ...v, isSaleable: e.target.checked })} /> Venta</label><select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}><option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option></select><button className="table-action-link" disabled={pending} onClick={() => onSave(v)}><Save size={14} /> Guardar</button></div>;
}
