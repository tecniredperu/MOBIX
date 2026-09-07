"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowUpRight, CircleDollarSign, CreditCard, Save, UserRound } from "lucide-react";
import {
  registerReceivablePaymentAction,
  updateCustomerAction,
  updateCustomerCreditAction,
  type CollectionMethod,
} from "./customer-actions";

const COLLECTION_LABELS: Record<CollectionMethod, string> = {
  CASH: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

function money(value: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value || 0);
}

function date(value: string) {
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date(value));
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function CustomerDetailView({ customer }: { customer: {
  id: string;
  name: string;
  documentType: string | null;
  documentNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  status: string;
  createdAt: string;
  credit: { enabled: boolean; limit: number; days: number; notes: string | null; outstanding: number; overdue: number; available: number };
  summary: { salesCount: number; purchaseTotal: number; outstanding: number; overdue: number };
  sales: Array<{ id: string; saleNumber: string; document: string; total: number; status: string; itemCount: number; payments: string[]; createdAt: string }>;
  receivables: Array<{ id: string; saleId: string; saleNumber: string; document: string; status: string; originalAmount: number; paidAmount: number; balance: number; dueDate: string; createdAt: string; overdue: boolean }>;
  payments: Array<{ id: string; receivableId: string; amount: number; method: string; reference: string | null; notes: string | null; createdBy: string; paidAt: string }>;
} }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [creditEnabled, setCreditEnabled] = useState(customer.credit.enabled);
  const [creditLimit, setCreditLimit] = useState(customer.credit.limit);
  const [creditDays, setCreditDays] = useState(customer.credit.days);
  const [creditNotes, setCreditNotes] = useState(customer.credit.notes ?? "");
  const [selectedReceivable, setSelectedReceivable] = useState(customer.receivables.find((item) => item.balance > 0.009)?.id ?? "");
  const [paymentAmount, setPaymentAmount] = useState(customer.receivables.find((item) => item.balance > 0.009)?.balance ?? 0);
  const [paymentMethod, setPaymentMethod] = useState<CollectionMethod>("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const openReceivables = useMemo(() => customer.receivables.filter((item) => item.balance > 0.009), [customer.receivables]);
  const selectedDebt = openReceivables.find((item) => item.id === selectedReceivable) ?? null;

  function run(action: () => Promise<unknown>, success: string) {
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        await action();
        setMessage(success);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo completar la operación.");
      }
    });
  }

  function saveBasic(formData: FormData) {
    run(
      () => updateCustomerAction({
        customerId: customer.id,
        name: String(formData.get("name") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        email: String(formData.get("email") ?? ""),
        address: String(formData.get("address") ?? ""),
      }),
      "Datos del cliente actualizados.",
    );
  }

  function saveCredit() {
    run(
      () => updateCustomerCreditAction({
        customerId: customer.id,
        enabled: creditEnabled,
        limit: creditLimit,
        days: creditDays,
        notes: creditNotes,
      }),
      "Configuración de crédito actualizada.",
    );
  }

  function registerPayment() {
    if (!selectedReceivable) {
      setError("Selecciona una cuenta por cobrar.");
      return;
    }
    run(
      () => registerReceivablePaymentAction({
        receivableId: selectedReceivable,
        amount: paymentAmount,
        method: paymentMethod,
        reference: paymentReference,
        notes: paymentNotes,
      }),
      "Abono registrado correctamente. El saldo y la caja fueron actualizados.",
    );
  }

  return (
    <div className="page-stack customer-detail-page">
      <section className="page-heading customer-detail-heading">
        <div>
          <Link className="back-link" href="/clientes"><ArrowLeft size={14} /> Clientes</Link>
          <span className="eyebrow">FICHA DEL CLIENTE</span>
          <h1>{customer.name}</h1>
          <p>{customer.documentType && customer.documentNumber ? `${customer.documentType} · ${customer.documentNumber}` : "Cliente sin documento"} · Registrado {date(customer.createdAt)}</p>
        </div>
        <Link className="primary-button" href="/pos">Nueva venta <ArrowUpRight size={16} /></Link>
      </section>

      {error && <div className="error-banner"><strong>Revisa la operación</strong><span>{error}</span></div>}
      {message && <div className="customer-success-banner"><strong>Listo</strong><span>{message}</span></div>}

      <section className="customer-kpi-grid">
        <article><small>Compras</small><strong>{customer.summary.salesCount}</strong><span>{money(customer.summary.purchaseTotal)} acumulado</span></article>
        <article><small>Deuda pendiente</small><strong>{money(customer.summary.outstanding)}</strong><span>{customer.summary.overdue > 0 ? `${money(customer.summary.overdue)} vencido` : "Sin mora"}</span></article>
        <article><small>Límite de crédito</small><strong>{customer.credit.enabled ? money(customer.credit.limit) : "No habilitado"}</strong><span>{customer.credit.enabled ? `${customer.credit.days} días` : "Configurable"}</span></article>
        <article><small>Crédito disponible</small><strong>{money(customer.credit.available)}</strong><span>Después de deuda actual</span></article>
      </section>

      <div className="customer-detail-grid">
        <section className="panel customer-info-card">
          <div className="section-title"><div><h2>Datos comerciales</h2><p>Información utilizada en ventas y contacto.</p></div><UserRound size={20} /></div>
          <form action={saveBasic} className="customer-form-grid">
            <label className="span-two"><span>Nombre / razón social</span><input name="name" defaultValue={customer.name} /></label>
            <label><span>Celular / WhatsApp</span><input name="phone" defaultValue={customer.whatsapp ?? customer.phone ?? ""} /></label>
            <label><span>Correo</span><input name="email" type="email" defaultValue={customer.email ?? ""} /></label>
            <label className="span-two"><span>Dirección</span><input name="address" defaultValue={customer.address ?? ""} /></label>
            <div className="span-two customer-inline-actions"><button className="secondary-button" type="submit" disabled={isPending}><Save size={14} /> Guardar datos</button></div>
          </form>
        </section>

        <section className="panel customer-credit-card">
          <div className="section-title"><div><h2>Política de crédito</h2><p>Controla cuánto y por cuánto tiempo puede financiar.</p></div><CreditCard size={20} /></div>
          <div className="credit-toggle-row"><div><strong>Crédito habilitado</strong><span>{creditEnabled ? "El cliente puede comprar a crédito." : "Solo ventas pagadas al momento."}</span></div><label className="switch-control"><input type="checkbox" checked={creditEnabled} onChange={(event) => setCreditEnabled(event.target.checked)} /><span /></label></div>
          <div className="customer-form-grid credit-fields">
            <label><span>Límite</span><div className="money-input"><span>S/</span><input type="number" min="0" step="0.01" value={creditLimit} onChange={(event) => setCreditLimit(Number(event.target.value))} /></div></label>
            <label><span>Plazo</span><div className="suffix-input"><input type="number" min="0" max="3650" value={creditDays} onChange={(event) => setCreditDays(Number(event.target.value))} /><span>días</span></div></label>
            <label className="span-two"><span>Observaciones</span><textarea rows={3} value={creditNotes} onChange={(event) => setCreditNotes(event.target.value)} placeholder="Condiciones, referencias o acuerdos..." /></label>
          </div>
          <div className="credit-availability-row"><span>Deuda {money(customer.credit.outstanding)}</span><strong>Disponible {money(Math.max(0, creditLimit - customer.credit.outstanding))}</strong></div>
          <button className="secondary-button" type="button" onClick={saveCredit} disabled={isPending}><Save size={14} /> Guardar crédito</button>
        </section>
      </div>

      <section className="panel receivable-section">
        <div className="panel-heading"><div><h2>Cuentas por cobrar</h2><p>Ventas financiadas, vencimientos y saldos pendientes.</p></div></div>
        <div className="table-wrap"><table className="data-table receivable-table"><thead><tr><th>Venta</th><th>Emisión</th><th>Vencimiento</th><th>Original</th><th>Abonado</th><th>Saldo</th><th>Estado</th></tr></thead><tbody>
          {customer.receivables.map((item) => <tr key={item.id}><td><Link className="table-link" href={`/ventas/${item.saleId}`}>{item.saleNumber}</Link><small className="table-subline">{item.document}</small></td><td>{date(item.createdAt)}</td><td className={item.overdue ? "debt-overdue" : ""}>{date(item.dueDate)}</td><td>{money(item.originalAmount)}</td><td>{money(item.paidAmount)}</td><td><strong>{money(item.balance)}</strong></td><td><span className={`receivable-status ${item.balance <= 0.009 ? "paid" : item.overdue ? "overdue" : "open"}`}>{item.balance <= 0.009 ? "Pagado" : item.overdue ? "Vencido" : item.status === "PARTIAL" ? "Parcial" : "Pendiente"}</span></td></tr>)}
          {!customer.receivables.length && <tr><td colSpan={7}><div className="customers-empty"><CircleDollarSign size={22} /><strong>Sin cuentas por cobrar</strong><span>Las ventas a crédito aparecerán aquí automáticamente.</span></div></td></tr>}
        </tbody></table></div>
      </section>

      <div className="customer-detail-grid collection-grid">
        <section className="panel collection-card">
          <div className="section-title"><div><h2>Registrar abono</h2><p>El cobro quedará vinculado a la caja abierta.</p></div><CircleDollarSign size={20} /></div>
          {openReceivables.length ? <div className="customer-form-grid">
            <label className="span-two"><span>Cuenta por cobrar</span><select value={selectedReceivable} onChange={(event) => { const id = event.target.value; setSelectedReceivable(id); const item = openReceivables.find((row) => row.id === id); setPaymentAmount(item?.balance ?? 0); }}><option value="">Seleccionar...</option>{openReceivables.map((item) => <option value={item.id} key={item.id}>{item.saleNumber} · saldo {money(item.balance)}{item.overdue ? " · VENCIDO" : ""}</option>)}</select></label>
            <label><span>Importe</span><div className="money-input"><span>S/</span><input type="number" min="0.01" max={selectedDebt?.balance ?? undefined} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(Number(event.target.value))} /></div></label>
            <label><span>Medio de cobro</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as CollectionMethod)}>{Object.entries(COLLECTION_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span>Referencia</span><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder={paymentMethod === "CASH" ? "Opcional" : "N.º operación"} /></label>
            <label><span>Nota</span><input value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} placeholder="Opcional" /></label>
            <div className="span-two"><button className="primary-button wide" type="button" onClick={registerPayment} disabled={isPending || !selectedReceivable}>{isPending ? "Registrando..." : `Registrar abono ${money(paymentAmount)}`}</button></div>
          </div> : <div className="collection-empty"><strong>Cliente sin saldo pendiente</strong><span>No hay cuentas por cobrar abiertas.</span></div>}
        </section>

        <section className="panel collection-history-card">
          <div className="panel-heading"><div><h2>Últimos abonos</h2><p>Historial de cobranzas registradas.</p></div></div>
          <div className="collection-history-list">{customer.payments.slice(0, 10).map((payment) => <div className="collection-history-item" key={payment.id}><span className="collection-method">{COLLECTION_LABELS[payment.method as CollectionMethod] ?? payment.method}</span><div><strong>{money(payment.amount)}</strong><small>{dateTime(payment.paidAt)} · {payment.createdBy}</small>{payment.reference && <small>Ref. {payment.reference}</small>}</div></div>)}{!customer.payments.length && <div className="collection-empty"><span>Aún no hay abonos registrados.</span></div>}</div>
        </section>
      </div>

      <section className="panel customer-sales-section">
        <div className="panel-heading"><div><h2>Historial de ventas</h2><p>Últimas operaciones realizadas por el cliente.</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Venta</th><th>Fecha</th><th>Productos</th><th>Pago</th><th>Total</th><th></th></tr></thead><tbody>{customer.sales.map((sale) => <tr key={sale.id}><td><strong>{sale.saleNumber}</strong><small className="table-subline">{sale.document}</small></td><td>{dateTime(sale.createdAt)}</td><td>{sale.itemCount}</td><td>{sale.payments.join(" + ")}</td><td><strong>{money(sale.total)}</strong></td><td className="right"><Link className="row-detail-link" href={`/ventas/${sale.id}`}>Detalle <ArrowUpRight size={13} /></Link></td></tr>)}{!customer.sales.length && <tr><td colSpan={6}><div className="customers-empty"><span>Este cliente todavía no tiene ventas.</span></div></td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
