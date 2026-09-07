"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Landmark,
  LockKeyhole,
  MinusCircle,
  Plus,
  PlusCircle,
  ReceiptText,
  Smartphone,
  WalletCards,
} from "lucide-react";
import {
  addCashMovementAction,
  closeCashSessionAction,
  openCashSessionAction,
} from "./cash-actions";
import { CashCloseReport, type CashCloseReportData } from "./cash-close-report";
import type {
  CashBranchOption,
  CashMovementKind,
  CashOpenSession,
  CashSessionHistoryItem,
} from "./cash-types";

const MOVEMENT_OPTIONS: Array<{ value: CashMovementKind; label: string }> = [
  { value: "INCOME", label: "Ingreso de efectivo" },
  { value: "EXPENSE", label: "Egreso / gasto" },
  { value: "WITHDRAWAL", label: "Retiro de caja" },
  { value: "ADJUSTMENT_IN", label: "Ajuste de entrada" },
  { value: "ADJUSTMENT_OUT", label: "Ajuste de salida" },
];

const PAYMENT_CARDS = [
  { key: "CASH" as const, label: "Efectivo", icon: Banknote },
  { key: "YAPE" as const, label: "Yape", icon: Smartphone },
  { key: "PLIN" as const, label: "Plin", icon: Smartphone },
  { key: "CARD" as const, label: "Tarjeta", icon: CreditCard },
  { key: "TRANSFER" as const, label: "Transferencia", icon: Landmark },
];

function money(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function CashView({
  companyName,
  currentUser,
  branches,
  openSession,
  history,
}: {
  companyName: string;
  currentUser: { id: string; name: string; defaultBranchId: string | null };
  branches: CashBranchOption[];
  openSession: CashOpenSession | null;
  history: CashSessionHistoryItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [closedReport, setClosedReport] = useState<CashCloseReportData | null>(null);

  const [branchId, setBranchId] = useState(
    currentUser.defaultBranchId ?? branches[0]?.id ?? "",
  );
  const [openingAmount, setOpeningAmount] = useState("0");
  const [openingNotes, setOpeningNotes] = useState("");

  const [movementType, setMovementType] = useState<CashMovementKind>("EXPENSE");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementConcept, setMovementConcept] = useState("");
  const [movementReference, setMovementReference] = useState("");

  const [actualCash, setActualCash] = useState("");
  const [closingNotes, setClosingNotes] = useState("");

  const closeDifference = useMemo(() => {
    if (!openSession || actualCash.trim() === "") return null;
    const actual = Number(actualCash);
    if (!Number.isFinite(actual)) return null;
    return Math.round((actual - openSession.expectedCash) * 100) / 100;
  }, [actualCash, openSession]);

  function runAction(action: () => Promise<void>) {
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo completar la operación.");
      }
    });
  }

  function openCash() {
    runAction(async () => {
      await openCashSessionAction({
        branchId,
        openingAmount: Number(openingAmount || 0),
        notes: openingNotes,
      });
      setSuccess("Caja abierta correctamente.");
    });
  }

  function addMovement() {
    if (!openSession) return;
    runAction(async () => {
      await addCashMovementAction({
        sessionId: openSession.id,
        type: movementType,
        amount: Number(movementAmount),
        concept: movementConcept,
        reference: movementReference,
      });
      setMovementAmount("");
      setMovementConcept("");
      setMovementReference("");
      setSuccess("Movimiento registrado.");
    });
  }

  function closeCash() {
    if (!openSession) return;
    const sessionSnapshot = openSession;
    const notesSnapshot = closingNotes;

    runAction(async () => {
      const result = await closeCashSessionAction({
        sessionId: sessionSnapshot.id,
        actualAmount: Number(actualCash),
        notes: notesSnapshot,
      });

      setClosedReport({
        sessionId: result.sessionId,
        companyName,
        branchName: sessionSnapshot.branchName,
        userName: sessionSnapshot.userName,
        openedAt: sessionSnapshot.openedAt,
        closedAt: result.closedAt,
        openingAmount: sessionSnapshot.openingAmount,
        salesCount: sessionSnapshot.salesCount,
        salesTotal: sessionSnapshot.salesTotal,
        paymentTotals: sessionSnapshot.paymentTotals,
        manualIncome: sessionSnapshot.manualIncome,
        manualOut: sessionSnapshot.manualOut,
        expectedAmount: result.expectedAmount,
        actualAmount: result.actualAmount,
        difference: result.difference,
        closingNotes: notesSnapshot,
      });

      setSuccess(
        Math.abs(result.difference) <= 0.01
          ? "Caja cerrada y cuadrada correctamente."
          : `Caja cerrada con diferencia de ${money(result.difference)}.`,
      );
      setActualCash("");
      setClosingNotes("");
    });
  }

  return (
    <div className="cash-page page-stack">
      {closedReport && <CashCloseReport report={closedReport} onClose={() => setClosedReport(null)} />}

      <section className="page-heading cash-heading">
        <div>
          <span className="eyebrow">FINANZAS</span>
          <h1>Caja</h1>
          <p>Controla apertura, ventas cobradas, movimientos de efectivo, arqueo y cierre de turno.</p>
        </div>
        {openSession ? (
          <div className="cash-open-chip">
            <span className="cash-live-dot" />
            <div><strong>Caja abierta</strong><small>{openSession.branchName}</small></div>
          </div>
        ) : (
          <div className="cash-closed-chip"><LockKeyhole size={16} /><span>Caja cerrada</span></div>
        )}
      </section>

      {error && <div className="error-banner"><strong>No se pudo completar la operación</strong><span>{error}</span></div>}
      {success && <div className="cash-success-banner"><CheckCircle2 size={17} /><span>{success}</span></div>}

      {!openSession ? (
        <section className="cash-opening-layout">
          <article className="panel cash-opening-card">
            <div className="cash-section-title">
              <span className="cash-section-icon"><WalletCards size={20} /></span>
              <div><span className="eyebrow">INICIO DE TURNO</span><h2>Abrir caja</h2><p>Registra el efectivo con el que comienzas la jornada.</p></div>
            </div>

            <div className="cash-form-grid">
              <label>
                <span>Sucursal</span>
                <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} · {branch.code}</option>)}
                </select>
              </label>
              <label>
                <span>Responsable</span>
                <input value={currentUser.name} disabled />
              </label>
              <label>
                <span>Fondo inicial de efectivo</span>
                <div className="money-input"><span>S/</span><input type="number" min="0" step="0.01" value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} /></div>
              </label>
              <label className="cash-span-full">
                <span>Observación de apertura</span>
                <textarea value={openingNotes} onChange={(event) => setOpeningNotes(event.target.value)} placeholder="Opcional: detalle del fondo, denominaciones u observaciones..." />
              </label>
            </div>

            <button className="primary-button cash-open-button" type="button" disabled={isPending || !branchId} onClick={openCash}>
              <PlusCircle size={18} /> {isPending ? "Abriendo caja..." : "Abrir caja"}
            </button>
          </article>

          <aside className="panel cash-opening-info">
            <span className="cash-info-icon"><CircleDollarSign size={24} /></span>
            <span className="eyebrow">CONTROL DE CAJA</span>
            <h2>Empieza cada turno con una apertura</h2>
            <p>MOBIX separará el efectivo físico de Yape, Plin, tarjeta y transferencias. Al cerrar podrás comparar el efectivo esperado con el dinero contado realmente.</p>
            <div className="cash-info-list">
              <span><CheckCircle2 size={15} /> Fondo inicial</span>
              <span><CheckCircle2 size={15} /> Cobros de ventas</span>
              <span><CheckCircle2 size={15} /> Ingresos y egresos</span>
              <span><CheckCircle2 size={15} /> Diferencia de arqueo</span>
            </div>
          </aside>
        </section>
      ) : (
        <>
          <section className="cash-summary-grid">
            <article className="cash-summary-card emphasis">
              <span>Efectivo esperado</span><strong>{money(openSession.expectedCash)}</strong><small>Disponible teórico en caja</small>
            </article>
            <article className="cash-summary-card">
              <span>Fondo inicial</span><strong>{money(openSession.openingAmount)}</strong><small>Inicio {shortTime(openSession.openedAt)}</small>
            </article>
            <article className="cash-summary-card">
              <span>Ventas del turno</span><strong>{money(openSession.salesTotal)}</strong><small>{openSession.salesCount} operación{openSession.salesCount === 1 ? "" : "es"}</small>
            </article>
            <article className="cash-summary-card">
              <span>Movimientos netos</span><strong>{money(openSession.manualIncome - openSession.manualOut)}</strong><small>Ingresos {money(openSession.manualIncome)} · Salidas {money(openSession.manualOut)}</small>
            </article>
          </section>

          <section className="cash-payment-strip">
            {PAYMENT_CARDS.map(({ key, label, icon: Icon }) => (
              <article className={`cash-payment-card ${key === "CASH" ? "cash-main" : ""}`} key={key}>
                <span className="cash-payment-icon"><Icon size={17} /></span>
                <div><span>{label}</span><strong>{money(openSession.paymentTotals[key])}</strong></div>
              </article>
            ))}
          </section>

          <section className="cash-work-grid">
            <article className="panel cash-activity-panel">
              <div className="panel-heading cash-panel-heading">
                <div><h2>Movimientos del turno</h2><p>Ventas cobradas y movimientos manuales de caja</p></div>
                <span className="cash-turn-meta">{openSession.userName} · {dateTime(openSession.openedAt)}</span>
              </div>
              <div className="cash-activity-list">
                {openSession.activity.map((item) => (
                  <div className="cash-activity-row" key={item.id}>
                    <span className={`cash-direction-icon ${item.direction.toLowerCase()}`}>
                      {item.direction === "IN" ? <ArrowDownLeft size={16} /> : item.direction === "OUT" ? <ArrowUpRight size={16} /> : <ReceiptText size={16} />}
                    </span>
                    <div className="cash-activity-copy"><strong>{item.label}</strong><span>{item.detail || "Sin detalle"}</span></div>
                    <time>{shortTime(item.createdAt)}</time>
                    <strong className={`cash-activity-amount ${item.direction.toLowerCase()}`}>{item.direction === "OUT" ? "−" : "+"}{money(item.amount)}</strong>
                  </div>
                ))}
                {!openSession.activity.length && <div className="cash-empty-state"><ReceiptText size={24} /><strong>Aún no hay movimientos</strong><span>Las ventas y movimientos de caja aparecerán aquí.</span></div>}
              </div>
            </article>

            <aside className="cash-side-stack">
              <article className="panel cash-movement-card">
                <div className="cash-card-heading"><div><Plus size={17} /><strong>Movimiento manual</strong></div><span>Solo afecta efectivo físico</span></div>
                <div className="cash-form-stack">
                  <label><span>Tipo</span><select value={movementType} onChange={(event) => setMovementType(event.target.value as CashMovementKind)}>{MOVEMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label><span>Importe</span><div className="money-input"><span>S/</span><input type="number" min="0.01" step="0.01" value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} placeholder="0.00" /></div></label>
                  <label><span>Concepto / motivo</span><input value={movementConcept} onChange={(event) => setMovementConcept(event.target.value)} placeholder="Ej. compra de útiles, retiro del dueño..." /></label>
                  <label><span>Referencia</span><input value={movementReference} onChange={(event) => setMovementReference(event.target.value)} placeholder="Opcional" /></label>
                  <button className="secondary-button cash-movement-submit" type="button" disabled={isPending} onClick={addMovement}>Registrar movimiento</button>
                </div>
              </article>

              <article className="panel cash-close-card">
                <div className="cash-card-heading danger"><div><LockKeyhole size={17} /><strong>Cerrar caja</strong></div><span>Arqueo de turno</span></div>
                <div className="cash-close-expected"><span>Efectivo esperado</span><strong>{money(openSession.expectedCash)}</strong></div>
                <div className="cash-form-stack">
                  <label><span>Efectivo contado</span><div className="money-input"><span>S/</span><input type="number" min="0" step="0.01" value={actualCash} onChange={(event) => setActualCash(event.target.value)} placeholder="Cuenta el efectivo real" /></div></label>
                  {closeDifference !== null && (
                    <div className={`cash-difference ${Math.abs(closeDifference) <= .01 ? "balanced" : closeDifference > 0 ? "positive" : "negative"}`}>
                      <span>Diferencia</span><strong>{closeDifference > 0 ? "+" : ""}{money(closeDifference)}</strong><small>{Math.abs(closeDifference) <= .01 ? "Caja cuadrada" : closeDifference > 0 ? "Sobrante" : "Faltante"}</small>
                    </div>
                  )}
                  <label><span>Observación de cierre</span><textarea value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} placeholder="Opcional" /></label>
                  <button className="cash-close-button" type="button" disabled={isPending || actualCash.trim() === ""} onClick={closeCash}>{isPending ? "Procesando..." : "Confirmar cierre de caja"}</button>
                </div>
              </article>
            </aside>
          </section>
        </>
      )}

      <section className="panel cash-history-panel">
        <div className="panel-heading"><div><h2>Historial de cierres</h2><p>Últimos turnos de caja registrados en {companyName}</p></div></div>
        <div className="table-wrap">
          <table className="data-table cash-history-table">
            <thead><tr><th>Apertura</th><th>Cierre</th><th>Sucursal</th><th>Responsable</th><th className="right">Inicial</th><th className="right">Esperado</th><th className="right">Contado</th><th className="right">Diferencia</th></tr></thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{dateTime(item.openedAt)}</td><td>{dateTime(item.closedAt)}</td><td><strong>{item.branchName}</strong></td><td>{item.userName}</td><td className="right">{money(item.openingAmount)}</td><td className="right">{money(item.expectedAmount)}</td><td className="right">{money(item.closingAmount)}</td><td className={`right cash-history-diff ${Math.abs(item.difference) <= .01 ? "balanced" : item.difference > 0 ? "positive" : "negative"}`}>{item.difference > 0 ? "+" : ""}{money(item.difference)}</td>
                </tr>
              ))}
              {!history.length && <tr><td colSpan={8}><div className="cash-empty-state compact"><MinusCircle size={20} /><strong>Aún no hay cierres de caja</strong></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
