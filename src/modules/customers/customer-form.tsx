"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowLeft, Save, UserRound } from "lucide-react";
import { createCustomerAction } from "./customer-actions";

export function CustomerForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [documentType, setDocumentType] = useState<"DNI" | "RUC" | "CE" | "OTHER">("DNI");
  const [creditEnabled, setCreditEnabled] = useState(false);

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      try {
        await createCustomerAction({
          documentType,
          documentNumber: String(formData.get("documentNumber") ?? ""),
          name: String(formData.get("name") ?? ""),
          phone: String(formData.get("phone") ?? ""),
          email: String(formData.get("email") ?? ""),
          address: String(formData.get("address") ?? ""),
          creditEnabled,
          creditLimit: Number(formData.get("creditLimit") ?? 0),
          creditDays: Number(formData.get("creditDays") ?? 30),
          creditNotes: String(formData.get("creditNotes") ?? ""),
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo registrar el cliente.");
      }
    });
  }

  return (
    <div className="page-stack customer-form-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">CLIENTES</span>
          <h1>Nuevo cliente</h1>
          <p>Registra los datos comerciales y, si corresponde, configura su línea de crédito.</p>
        </div>
        <Link className="secondary-button" href="/clientes"><ArrowLeft size={15} /> Volver</Link>
      </section>

      {error && <div className="error-banner"><strong>No se pudo guardar</strong><span>{error}</span></div>}

      <form action={submit} className="customer-form-layout">
        <section className="panel customer-form-card">
          <div className="section-title"><div><h2>Datos del cliente</h2><p>Información para ventas, comprobantes y contacto.</p></div><UserRound size={20} /></div>
          <div className="customer-form-grid">
            <label><span>Tipo de documento</span><select value={documentType} onChange={(event) => setDocumentType(event.target.value as typeof documentType)}><option value="DNI">DNI</option><option value="RUC">RUC</option><option value="CE">Carné de extranjería</option><option value="OTHER">Otro</option></select></label>
            <label><span>N.º documento</span><input name="documentNumber" inputMode="numeric" placeholder={documentType === "RUC" ? "11 dígitos" : documentType === "DNI" ? "8 dígitos" : "Documento"} /></label>
            <label className="span-two"><span>{documentType === "RUC" ? "Razón social" : "Nombre completo"}</span><input name="name" required placeholder={documentType === "RUC" ? "Empresa S.A.C." : "Nombre y apellidos"} /></label>
            <label><span>Celular / WhatsApp</span><input name="phone" inputMode="tel" placeholder="999 999 999" /></label>
            <label><span>Correo</span><input name="email" type="email" placeholder="cliente@correo.com" /></label>
            <label className="span-two"><span>Dirección</span><input name="address" placeholder="Dirección del cliente (opcional)" /></label>
          </div>
        </section>

        <section className="panel customer-form-card credit-config-card">
          <div className="credit-toggle-row"><div><strong>Línea de crédito</strong><span>Permite ventas financiadas y control de saldos.</span></div><label className="switch-control"><input type="checkbox" checked={creditEnabled} onChange={(event) => setCreditEnabled(event.target.checked)} /><span /></label></div>
          <div className="customer-form-grid credit-fields">
            <label><span>Límite de crédito</span><div className="money-input"><span>S/</span><input name="creditLimit" type="number" min="0" step="0.01" defaultValue="0" disabled={!creditEnabled} /></div></label>
            <label><span>Plazo habitual</span><div className="suffix-input"><input name="creditDays" type="number" min="0" max="3650" defaultValue="30" disabled={!creditEnabled} /><span>días</span></div></label>
            <label className="span-two"><span>Observaciones de crédito</span><textarea name="creditNotes" rows={3} disabled={!creditEnabled} placeholder="Condiciones acordadas, referencias u observaciones..." /></label>
          </div>
          <p className="credit-help">El límite controla cuánto puede financiar el cliente considerando toda su deuda pendiente. Los abonos posteriores liberan crédito automáticamente.</p>
        </section>

        <div className="customer-form-actions"><Link className="secondary-button" href="/clientes">Cancelar</Link><button className="primary-button" type="submit" disabled={isPending}><Save size={16} /> {isPending ? "Guardando..." : "Guardar cliente"}</button></div>
      </form>
    </div>
  );
}
