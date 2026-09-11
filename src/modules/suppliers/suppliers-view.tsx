"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, Edit3, Plus, Save, Search, Truck, UserRound, X } from "lucide-react";
import { saveSupplierAction } from "./supplier-actions";

type SupplierRow = {
  id: string;
  documentType: string | null;
  documentNumber: string | null;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: string;
  purchasesCount: number;
  lastPurchase: { date: string; total: number; number: string } | null;
};

type SupplierDraft = {
  id?: string;
  documentType: "RUC" | "DNI" | "CE" | "OTHER";
  documentNumber: string;
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  status: "ACTIVE" | "INACTIVE";
};

const EMPTY_SUPPLIER: SupplierDraft = {
  documentType: "RUC",
  documentNumber: "",
  businessName: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  status: "ACTIVE",
};

function money(value: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value || 0);
}

function datePeru(value: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function toDraft(supplier: SupplierRow): SupplierDraft {
  return {
    id: supplier.id,
    documentType: (["RUC", "DNI", "CE", "OTHER"].includes(supplier.documentType ?? "") ? supplier.documentType : "OTHER") as SupplierDraft["documentType"],
    documentNumber: supplier.documentNumber ?? "",
    businessName: supplier.businessName,
    contactName: supplier.contactName ?? "",
    phone: supplier.phone ?? "",
    email: supplier.email ?? "",
    address: supplier.address ?? "",
    status: supplier.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
  };
}

export function SuppliersView({
  suppliers,
  summary,
  filters,
  canEdit,
}: {
  suppliers: SupplierRow[];
  summary: { total: number; active: number; inactive: number };
  filters: { q?: string; status?: string };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<SupplierDraft | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function openNew() {
    setError("");
    setSuccess("");
    setDraft({ ...EMPTY_SUPPLIER });
  }

  function openEdit(supplier: SupplierRow) {
    setError("");
    setSuccess("");
    setDraft(toDraft(supplier));
  }

  function save() {
    if (!draft) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        const wasEditing = Boolean(draft.id);
        await saveSupplierAction(draft);
        setDraft(null);
        setSuccess(wasEditing ? "Proveedor actualizado correctamente." : "Proveedor registrado correctamente.");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo guardar el proveedor.");
      }
    });
  }

  return (
    <div className="page-stack suppliers-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">COMPRAS · PROVEEDORES</span>
          <h1>Proveedores</h1>
          <p>Administra proveedores, datos fiscales y contactos para reutilizarlos en cada compra.</p>
        </div>
        {canEdit && <button className="primary-button" type="button" onClick={openNew}><Plus size={16} /> Nuevo proveedor</button>}
      </section>

      {error && <div className="error-banner"><strong>No se pudo guardar</strong><span>{error}</span></div>}
      {success && <div className="cash-success-banner"><CheckCircle2 size={17} /><span>{success}</span></div>}

      <section className="customer-summary-grid">
        <article><span className="customer-summary-icon"><Truck size={18} /></span><div><small>Proveedores</small><strong>{summary.total}</strong><p>Registrados en la empresa</p></div></article>
        <article><span className="customer-summary-icon"><CheckCircle2 size={18} /></span><div><small>Activos</small><strong>{summary.active}</strong><p>Disponibles para compras</p></div></article>
        <article><span className="customer-summary-icon"><Building2 size={18} /></span><div><small>Inactivos</small><strong>{summary.inactive}</strong><p>Conservados en el historial</p></div></article>
        <article><span className="customer-summary-icon"><UserRound size={18} /></span><div><small>Mostrados</small><strong>{suppliers.length}</strong><p>Según el filtro actual</p></div></article>
      </section>

      {draft && (
        <section className="panel customer-form-card">
          <div className="panel-heading">
            <div><h2>{draft.id ? "Editar proveedor" : "Nuevo proveedor"}</h2><p>Los datos quedarán disponibles automáticamente al registrar compras.</p></div>
            <button className="ghost-button" type="button" onClick={() => setDraft(null)} disabled={pending}><X size={16} /> Cerrar</button>
          </div>
          <div className="customer-form-grid">
            <label><span>Tipo de documento</span><select value={draft.documentType} onChange={(e) => setDraft({ ...draft, documentType: e.target.value as SupplierDraft["documentType"] })}><option value="RUC">RUC</option><option value="DNI">DNI</option><option value="CE">Carné de extranjería</option><option value="OTHER">Otro</option></select></label>
            <label><span>N.º de documento</span><input value={draft.documentNumber} onChange={(e) => setDraft({ ...draft, documentNumber: e.target.value })} placeholder={draft.documentType === "RUC" ? "20123456789" : "Documento"} /></label>
            <label className="span-two"><span>Razón social / nombre</span><input value={draft.businessName} onChange={(e) => setDraft({ ...draft, businessName: e.target.value })} placeholder="Distribuciones Perú S.A.C." /></label>
            <label><span>Persona de contacto</span><input value={draft.contactName} onChange={(e) => setDraft({ ...draft, contactName: e.target.value })} placeholder="Nombre del contacto" /></label>
            <label><span>Teléfono</span><input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="999 999 999" /></label>
            <label><span>Correo</span><input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="ventas@proveedor.pe" /></label>
            <label><span>Estado</span><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as SupplierDraft["status"] })}><option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option></select></label>
            <label className="span-two"><span>Dirección</span><input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Dirección fiscal o comercial" /></label>
            <div className="customer-form-actions"><button className="ghost-button" type="button" onClick={() => setDraft(null)} disabled={pending}>Cancelar</button><button className="primary-button" type="button" onClick={save} disabled={pending}><Save size={16} /> {pending ? "Guardando..." : "Guardar proveedor"}</button></div>
          </div>
        </section>
      )}

      <section className="panel customers-table-panel">
        <form className="customers-toolbar" method="get">
          <label className="customers-search"><Search size={17} /><input name="q" defaultValue={filters.q ?? ""} placeholder="Buscar proveedor, RUC, contacto, teléfono..." /></label>
          <select name="status" defaultValue={filters.status ?? ""}><option value="">Todos los estados</option><option value="ACTIVE">Activos</option><option value="INACTIVE">Inactivos</option></select>
          <button className="secondary-button" type="submit">Filtrar</button>
        </form>

        <div className="table-wrap">
          <table className="data-table customers-table">
            <thead><tr><th>Proveedor</th><th>Contacto</th><th>Dirección</th><th>Compras</th><th>Última compra</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td><div className="customer-name-cell"><span>{supplier.businessName.slice(0, 1).toUpperCase()}</span><div><strong>{supplier.businessName}</strong><small>{supplier.documentNumber ? `${supplier.documentType ?? "DOC"} · ${supplier.documentNumber}` : "Sin documento"}</small></div></div></td>
                  <td><div className="stacked-cell"><span>{supplier.contactName ?? supplier.phone ?? "—"}</span><small>{supplier.email ?? (supplier.contactName && supplier.phone ? supplier.phone : "Sin correo")}</small></div></td>
                  <td><span className="table-subline">{supplier.address ?? "—"}</span></td>
                  <td><strong>{supplier.purchasesCount}</strong></td>
                  <td>{supplier.lastPurchase ? <div className="stacked-cell"><strong>{money(supplier.lastPurchase.total)}</strong><small>{supplier.lastPurchase.number} · {datePeru(supplier.lastPurchase.date)}</small></div> : <span className="table-subline">Sin compras</span>}</td>
                  <td><span className={`status-badge ${supplier.status === "ACTIVE" ? "credit-enabled" : "credit-disabled"}`}>{supplier.status === "ACTIVE" ? "Activo" : "Inactivo"}</span></td>
                  <td className="right">{canEdit && <button className="row-detail-link" type="button" onClick={() => openEdit(supplier)}><Edit3 size={14} /> Editar</button>}</td>
                </tr>
              ))}
              {!suppliers.length && <tr><td colSpan={7}><div className="customers-empty"><Truck size={25} /><strong>No hay proveedores que coincidan</strong><span>Registra un proveedor o cambia los filtros.</span></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
