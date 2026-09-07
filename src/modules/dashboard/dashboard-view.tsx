import Link from "next/link";
import {
  ArrowUpRight,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  History,
  PackagePlus,
  ReceiptText,
  ScanLine,
  ShoppingCart,
  Smartphone,
  TriangleAlert,
} from "lucide-react";

const stats = [
  { label: "Ventas de hoy", value: "S/ 0.00", hint: "Sin operaciones todavía", icon: CircleDollarSign },
  { label: "Equipos disponibles", value: "0", hint: "Celulares con IMEI disponible", icon: Smartphone },
  { label: "Productos", value: "0", hint: "Catálogo activo", icon: Boxes },
  { label: "Alertas de stock", value: "0", hint: "Productos bajo mínimo", icon: TriangleAlert },
];

const quickActions = [
  {
    label: "Nueva venta",
    description: "Abrir POS y registrar una venta",
    href: "/pos",
    icon: ShoppingCart,
    priority: "primary",
  },
  {
    label: "Nueva compra",
    description: "Ingresar mercadería, costos e IMEI",
    href: "/compras/nueva",
    icon: PackagePlus,
    priority: "primary",
  },
  {
    label: "Nuevo producto",
    description: "Crear celular, accesorio o servicio",
    href: "/productos/nuevo",
    icon: Boxes,
    priority: "normal",
  },
  {
    label: "Caja",
    description: "Apertura, movimientos, arqueo y cierre",
    href: "/caja",
    icon: CircleDollarSign,
    priority: "normal",
  },
  {
    label: "Ventas",
    description: "Consultar ventas y comprobantes",
    href: "/ventas",
    icon: ReceiptText,
    priority: "normal",
  },
  {
    label: "Equipos / IMEI",
    description: "Ver stock individual y trazabilidad",
    href: "/equipos",
    icon: ScanLine,
    priority: "normal",
  },
  {
    label: "Kardex",
    description: "Revisar entradas y salidas de inventario",
    href: "/kardex",
    icon: History,
    priority: "normal",
  },
  {
    label: "Compras",
    description: "Consultar ingresos de mercadería",
    href: "/compras",
    icon: ClipboardList,
    priority: "normal",
  },
];

export function DashboardView() {
  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">MOBIX CORE</span>
          <h1>Buenos días</h1>
          <p>Accede rápidamente a ventas, inventario y operaciones principales de tu tienda.</p>
        </div>
        <Link className="primary-button" href="/pos">
          Nueva venta <ArrowUpRight size={17} />
        </Link>
      </section>

      <section className="stat-grid">
        {stats.map(({ label, value, hint, icon: Icon }) => (
          <article className="stat-card" key={label}>
            <div className="stat-icon"><Icon size={20} /></div>
            <p>{label}</p>
            <strong>{value}</strong>
            <span>{hint}</span>
          </article>
        ))}
      </section>

      <section className="dashboard-quick-section">
        <div className="dashboard-section-heading">
          <div>
            <span className="eyebrow">OPERACIONES</span>
            <h2>Accesos rápidos</h2>
            <p>Las funciones que más se utilizan durante la jornada de una tienda de celulares.</p>
          </div>
        </div>

        <div className="dashboard-quick-grid">
          {quickActions.map(({ label, description, href, icon: Icon, priority }) => (
            <Link
              className={`dashboard-quick-card ${priority === "primary" ? "is-primary" : ""}`}
              href={href}
              key={label}
            >
              <span className="dashboard-quick-icon"><Icon size={20} /></span>
              <span className="dashboard-quick-copy">
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
              <ArrowUpRight className="dashboard-quick-arrow" size={17} />
            </Link>
          ))}
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-large">
          <div className="panel-heading">
            <div><h2>Ventas</h2><p>Últimos 7 días</p></div>
            <Link className="ghost-button" href="/ventas">Ver ventas</Link>
          </div>
          <div className="empty-chart">
            <div className="chart-bars" aria-hidden="true">
              {[32, 48, 38, 65, 52, 76, 58].map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}
            </div>
            <p>Los datos aparecerán cuando registres tu primera venta.</p>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><h2>Primeros pasos</h2><p>Configura el núcleo de tu tienda</p></div></div>
          <div className="checklist">
            {[
              "Configurar empresa y sucursal",
              "Crear almacén principal",
              "Registrar marcas y categorías",
              "Crear primer producto",
              "Registrar compra e IMEI",
            ].map((item, index) => (
              <div className="check-row" key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
