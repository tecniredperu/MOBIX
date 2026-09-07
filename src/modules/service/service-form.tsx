"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarClock, ShieldCheck, Smartphone, Wrench } from "lucide-react";
import { createServiceOrderAction } from "./service-actions";
import type { ServiceCustomerOption, ServiceType, SoldUnitOption } from "./service-types";

function date(value: string | null) {
  if (!value) return "Sin garantía";
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date(value));
}

export function ServiceForm({
  customers,
  soldUnits,
}: {
  customers: ServiceCustomerOption[];
  soldUnits: SoldUnitOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState<"SOLD" | "EXTERNAL">("SOLD");
  const [unitId, setUnitId] = useState(soldUnits[0]?.id ?? "");
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [serviceType, setServiceType] = useState<ServiceType>("TECHNICAL_SERVICE");
  const [reportedIssue, setReportedIssue] = useState("");
  const [accessories, setAccessories] = useState("");
  const [physicalCondition, setPhysicalCondition] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("0");
  const [expectedAt, setExpectedAt] = useState("");

  const selectedUnit = useMemo(() => soldUnits.find((unit) => unit.id === unitId) ?? null, [soldUnits, unitId]);

  function changeOrigin(value: "SOLD" | "EXTERNAL") {
    setOrigin(value);
    if (value === "EXTERNAL") setServiceType("TECHNICAL_SERVICE");
  }

  function submit() {
    setError("");
    startTransition(async () => {
      try {
        const result = await createServiceOrderAction({
          customerId: origin === "EXTERNAL" ? customerId : undefined,
          productUnitId: origin === "SOLD" ? unitId : undefined,
          serviceType,
          deviceName: origin === "EXTERNAL" ? deviceName : undefined,
          brand: origin === "EXTERNAL" ? brand : undefined,
          model: origin === "EXTERNAL" ? model : undefined,
          identifier: origin === "EXTERNAL" ? identifier : undefined,
          reportedIssue,
          accessories,
          physicalCondition,
          estimatedCost: Number(estimatedCost || 0),
          expectedAt,
        });
        router.push(`/servicio-tecnico/${result.id}?created=1`);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo registrar la recepción.");
      }
    });
  }

  return (
    <div className="page-stack service-form-page">
      <section className="page-heading">
        <div>
          <Link href="/servicio-tecnico" className="back-link"><ArrowLeft size={15} /> Volver a postventa</Link>
          <span className="eyebrow">POSTVENTA</span>
          <h1>Nueva atención</h1>
          <p>Registra el equipo, condición de ingreso, falla reportada y fecha estimada de entrega.</p>
        </div>
      </section>

      {error && <div className="error-banner"><strong>No se pudo registrar</strong><span>{error}</span></div>}

      <section className="service-origin-switch">
        <button className={origin === "SOLD" ? "active" : ""} type="button" onClick={() => changeOrigin("SOLD")}><Smartphone size={17} /><span><strong>Equipo vendido por la tienda</strong><small>Usar venta, cliente e IMEI registrados</small></span></button>
        <button className={origin === "EXTERNAL" ? "active" : ""} type="button" onClick={() => changeOrigin("EXTERNAL")}><Wrench size={17} /><span><strong>Equipo externo</strong><small>Servicio técnico sin venta previa</small></span></button>
      </section>

      <div className="service-form-layout">
        <section className="panel service-form-card">
          <div className="section-title"><div><h2>Equipo y cliente</h2><p>Identifica el dispositivo que ingresa al taller.</p></div><Smartphone size={20} /></div>

          {origin === "SOLD" ? (
            <div className="service-field-stack">
              <label><span>Equipo vendido / IMEI</span><select value={unitId} onChange={(event) => { setUnitId(event.target.value); setServiceType("TECHNICAL_SERVICE"); }}>
                {!soldUnits.length && <option value="">No hay equipos vendidos disponibles</option>}
                {soldUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.identifier} · {unit.productName} · {unit.customerName}</option>)}
              </select></label>
              {selectedUnit && (
                <div className="service-unit-preview">
                  <div><span>Equipo</span><strong>{selectedUnit.productName}</strong><small>{selectedUnit.brand} · {selectedUnit.variant}</small></div>
                  <div><span>Cliente</span><strong>{selectedUnit.customerName}</strong><small>Venta {selectedUnit.saleNumber}</small></div>
                  <div><span>Identificador</span><strong>{selectedUnit.identifier}</strong><small>Vendido {date(selectedUnit.soldAt)}</small></div>
                  <div className={selectedUnit.withinWarranty ? "warranty-ok" : "warranty-expired"}><span>Garantía</span><strong>{selectedUnit.withinWarranty ? "Vigente" : "No vigente"}</strong><small>{selectedUnit.warrantyExpiresAt ? `Hasta ${date(selectedUnit.warrantyExpiresAt)}` : "Sin plazo configurado"}</small></div>
                </div>
              )}
            </div>
          ) : (
            <div className="customer-form-grid">
              <label className="span-two"><span>Cliente</span><select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.document ? ` · ${customer.document}` : ""}</option>)}</select></label>
              <label className="span-two"><span>Equipo</span><input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="Ej. Samsung Galaxy A55" /></label>
              <label><span>Marca</span><input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Samsung" /></label>
              <label><span>Modelo</span><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="SM-A556E" /></label>
              <label className="span-two"><span>IMEI / serie</span><input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Identificador del equipo (opcional)" /></label>
            </div>
          )}
        </section>

        <section className="panel service-form-card">
          <div className="section-title"><div><h2>Tipo de atención</h2><p>Define si corresponde a garantía o reparación particular.</p></div><ShieldCheck size={20} /></div>
          <div className="service-type-options">
            <button type="button" className={serviceType === "TECHNICAL_SERVICE" ? "active" : ""} onClick={() => setServiceType("TECHNICAL_SERVICE")}><Wrench size={18} /><span><strong>Servicio técnico</strong><small>Diagnóstico y reparación particular</small></span></button>
            <button type="button" disabled={origin === "EXTERNAL" || !selectedUnit?.withinWarranty} className={serviceType === "WARRANTY" ? "active warranty" : "warranty"} onClick={() => setServiceType("WARRANTY")}><ShieldCheck size={18} /><span><strong>Garantía</strong><small>{origin === "SOLD" && selectedUnit?.withinWarranty ? "Cobertura vigente" : "Requiere garantía vigente"}</small></span></button>
          </div>

          <div className="service-field-stack service-reception-fields">
            <label><span>Falla reportada *</span><textarea rows={4} value={reportedIssue} onChange={(event) => setReportedIssue(event.target.value)} placeholder="Describe lo que indica el cliente y cuándo ocurre la falla..." /></label>
            <label><span>Estado físico al recibir</span><textarea rows={3} value={physicalCondition} onChange={(event) => setPhysicalCondition(event.target.value)} placeholder="Ej. pantalla con rayones leves, marco sin golpes..." /></label>
            <label><span>Accesorios entregados</span><input value={accessories} onChange={(event) => setAccessories(event.target.value)} placeholder="Ej. cargador, cable, funda / Ninguno" /></label>
          </div>
        </section>

        <aside className="panel service-planning-card">
          <div className="section-title"><div><h2>Planificación</h2><p>Información inicial para el cliente.</p></div><CalendarClock size={20} /></div>
          <div className="service-field-stack">
            <label><span>Costo estimado</span><div className="money-input"><span>S/</span><input type="number" min="0" step="0.01" value={estimatedCost} onChange={(event) => setEstimatedCost(event.target.value)} disabled={serviceType === "WARRANTY"} /></div></label>
            <label><span>Entrega estimada</span><input type="date" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} /></label>
          </div>
          <div className="service-form-note"><ShieldCheck size={17} /><span>Al registrar un equipo vendido, MOBIX lo cambia temporalmente de <strong>Vendido</strong> a <strong>{serviceType === "WARRANTY" ? "Garantía" : "Servicio técnico"}</strong> hasta que sea entregado.</span></div>
          <button className="primary-button wide service-submit" type="button" disabled={isPending || (origin === "SOLD" && !unitId) || (origin === "EXTERNAL" && (!customerId || !deviceName))} onClick={submit}>{isPending ? "Registrando..." : "Registrar recepción"}</button>
        </aside>
      </div>
    </div>
  );
}
