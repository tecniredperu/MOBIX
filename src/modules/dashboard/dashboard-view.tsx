import Link from "next/link";
import {
  ArrowLeftRight, ArrowUpRight, Boxes, ChartNoAxesCombined, CircleDollarSign, History,
  PackagePlus, ReceiptText, Repeat2, ScanLine, ShoppingCart, Smartphone, TriangleAlert, Users, Wrench,
} from "lucide-react";

const quickActions = [
  { label: "Nueva venta", description: "Abrir POS y registrar una venta", href: "/pos", icon: ShoppingCart, priority: "primary", permission: "sales.create" },
  { label: "Nueva compra", description: "Ingresar mercadería, costos e IMEI", href: "/compras/nueva", icon: PackagePlus, priority: "primary", permission: "purchases.create" },
  { label: "Reportes", description: "Ventas, utilidad, stock y desempeño", href: "/reportes", icon: ChartNoAxesCombined, priority: "normal", permission: "reports.view" },
  { label: "Transferencias", description: "Mover stock e IMEI entre almacenes", href: "/transferencias", icon: ArrowLeftRight, priority: "normal", permission: "inventory.transfer" },
  { label: "Devoluciones / cambios", description: "Reingresos, cambios y reembolsos", href: "/devoluciones", icon: Repeat2, priority: "normal", permission: "returns.manage" },
  { label: "Nuevo producto", description: "Crear celular, accesorio o servicio", href: "/productos/nuevo", icon: Boxes, priority: "normal", permission: "inventory.manage" },
  { label: "Caja", description: "Apertura, movimientos, arqueo y cierre", href: "/caja", icon: CircleDollarSign, priority: "normal", permission: "cash.manage" },
  { label: "Clientes y crédito", description: "Historial, deuda, límites y cobranzas", href: "/clientes", icon: Users, priority: "normal", permission: "customers.manage" },
  { label: "Servicio técnico", description: "Garantías, diagnósticos y reparaciones", href: "/servicio-tecnico", icon: Wrench, priority: "normal", permission: "service.manage" },
  { label: "Ventas", description: "Consultar ventas y comprobantes", href: "/ventas", icon: ReceiptText, priority: "normal", permission: "sales.view" },
  { label: "Equipos / IMEI", description: "Ver stock individual y trazabilidad", href: "/equipos", icon: ScanLine, priority: "normal", permission: "inventory.view" },
  { label: "Kardex", description: "Revisar entradas y salidas de inventario", href: "/kardex", icon: History, priority: "normal", permission: "inventory.view" },
];

const PAYMENT_LABELS: Record<string, string> = { CASH: "Efectivo", YAPE: "Yape", PLIN: "Plin", CARD: "Tarjeta", TRANSFER: "Transferencia", CREDIT: "Crédito", OTHER: "Otro" };
function money(value: number) { return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 }).format(value || 0); }
function time(value: string) { return new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

type DashboardData = { summary: { todayTotal: number; todayCount: number; availableUnits: number; activeProducts: number; lowStock: number }; chart: Array<{ key: string; label: string; total: number; count: number }>; recentSales: Array<{ id: string; saleNumber: string; customer: string; total: number; paymentMethods: string[]; createdAt: string }>; cashStatus: | { open: true; branchName: string; openedAt: string } | { open: false; branchName: null; openedAt: null } };

export function DashboardView({ data, isSystem, permissions }: { data: DashboardData; isSystem: boolean; permissions: string[] }) {
  const permissionSet = new Set(permissions);
  const can = (code: string) => isSystem || permissionSet.has(code);
  const actions = quickActions.filter((action) => can(action.permission));
  const canCash = can("cash.manage");
  const canSell = can("sales.create");
  const canReports = can("reports.view");
  const canSalesView = can("sales.view");
  const stats = [
    { label: "Ventas de hoy", value: money(data.summary.todayTotal), hint: `${data.summary.todayCount} operación${data.summary.todayCount === 1 ? "" : "es"} completada${data.summary.todayCount === 1 ? "" : "s"}`, icon: CircleDollarSign },
    { label: "Equipos disponibles", value: String(data.summary.availableUnits), hint: "Celulares/equipos con unidad disponible", icon: Smartphone },
    { label: "Productos activos", value: String(data.summary.activeProducts), hint: "Catálogo habilitado para operar", icon: Boxes },
    { label: "Alertas de stock", value: String(data.summary.lowStock), hint: data.summary.lowStock ? "Productos en mínimo o por debajo" : "Stock dentro de mínimos configurados", icon: TriangleAlert },
  ];
  const maxChart = Math.max(1, ...data.chart.map((item) => item.total));
  return (
    <div className="page-stack">
      <section className="page-heading dashboard-heading-pro">
        <div><span className="eyebrow">MOBIX · OPERACIÓN DEL DÍA</span><h1>Panel de control</h1><p>Ventas, inventario, caja y accesos principales de tu tienda en una sola vista.</p></div>
        <div className="dashboard-heading-actions">
          {canCash && <Link className={`dashboard-cash-status ${data.cashStatus.open ? "open" : "closed"}`} href="/caja"><span className={data.cashStatus.open ? "cash-live-dot" : "dashboard-cash-off"} /><span><strong>{data.cashStatus.open ? "Caja abierta" : "Caja cerrada"}</strong><small>{data.cashStatus.open ? data.cashStatus.branchName : "Abrir antes de vender"}</small></span></Link>}
          {canSell && <Link className="primary-button" href="/pos">Nueva venta <ArrowUpRight size={17} /></Link>}
        </div>
      </section>
      <section className="stat-grid dashboard-real-stats">{stats.map(({ label, value, hint, icon: Icon }) => <article className="stat-card" key={label}><div className="stat-icon"><Icon size={19} /></div><p>{label}</p><strong>{value}</strong><span>{hint}</span></article>)}</section>
      {actions.length > 0 && <section className="dashboard-quick-section"><div className="dashboard-section-heading"><div><span className="eyebrow">OPERACIONES</span><h2>Accesos rápidos</h2><p>Funciones disponibles para tu rol.</p></div></div><div className="dashboard-quick-grid">{actions.map(({ label, description, href, icon: Icon, priority }) => <Link className={`dashboard-quick-card ${priority === "primary" ? "is-primary" : ""}`} href={href} key={label}><span className="dashboard-quick-icon"><Icon size={20} /></span><span className="dashboard-quick-copy"><strong>{label}</strong><small>{description}</small></span><ArrowUpRight className="dashboard-quick-arrow" size={17} /></Link>)}</div></section>}
      <section className="dashboard-business-grid">
        <article className="panel dashboard-sales-chart-panel"><div className="panel-heading"><div><h2>Ventas de los últimos 7 días</h2><p>Importe real de ventas completadas</p></div>{canReports && <Link className="ghost-button" href="/reportes">Analizar</Link>}</div><div className="dashboard-sales-chart">{data.chart.map((item) => <div className="dashboard-chart-day" key={item.key} title={`${item.label}: ${money(item.total)} · ${item.count} ventas`}><div className="dashboard-chart-value">{item.total > 0 ? money(item.total) : "—"}</div><div className="dashboard-chart-track"><span style={{ height: `${Math.max(item.total > 0 ? 8 : 2, (item.total / maxChart) * 100)}%` }} /></div><strong>{item.label}</strong><small>{item.count} venta{item.count === 1 ? "" : "s"}</small></div>)}</div></article>
        <article className="panel dashboard-recent-panel"><div className="panel-heading"><div><h2>Últimas ventas</h2><p>Actividad comercial reciente</p></div>{canSalesView && <Link className="ghost-button" href="/ventas">Todas</Link>}</div><div className="dashboard-recent-list">{data.recentSales.map((sale) => canSalesView ? <Link className="dashboard-recent-sale" href={`/ventas/${sale.id}`} key={sale.id}><span className="dashboard-sale-icon"><ReceiptText size={16} /></span><span className="dashboard-sale-copy"><strong>{sale.saleNumber}</strong><small>{sale.customer}</small><em>{sale.paymentMethods.map((method) => PAYMENT_LABELS[method] ?? method).join(" + ") || "Sin pago"}</em></span><span className="dashboard-sale-total"><strong>{money(sale.total)}</strong><small>{time(sale.createdAt)}</small></span></Link> : <div className="dashboard-recent-sale" key={sale.id}><span className="dashboard-sale-icon"><ReceiptText size={16} /></span><span className="dashboard-sale-copy"><strong>{sale.saleNumber}</strong><small>{sale.customer}</small></span><span className="dashboard-sale-total"><strong>{money(sale.total)}</strong><small>{time(sale.createdAt)}</small></span></div>)}{!data.recentSales.length && <div className="dashboard-recent-empty"><ReceiptText size={23} /><strong>Aún no hay ventas</strong><span>La actividad aparecerá aquí al registrar tu primera venta.</span></div>}</div></article>
      </section>
    </div>
  );
}
