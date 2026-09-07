import Link from "next/link";
import {
  BadgeDollarSign,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  CircleDollarSign,
  LayoutDashboard,
  PackageSearch,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Users,
  Wrench,
} from "lucide-react";

const sections = [
  { label: "Inicio", items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }] },
  {
    label: "Ventas",
    items: [
      { label: "Punto de venta", href: "#", icon: ShoppingCart },
      { label: "Ventas", href: "#", icon: BadgeDollarSign },
    ],
  },
  {
    label: "Inventario",
    items: [
      { label: "Productos", href: "/productos", icon: Boxes },
      { label: "Equipos / IMEI", href: "/equipos", icon: Smartphone },
      { label: "Kardex", href: "/kardex", icon: PackageSearch },
    ],
  },
  { label: "Compras", items: [{ label: "Compras", href: "/compras", icon: ShoppingBag }] },
  { label: "Clientes", items: [{ label: "Clientes", href: "#", icon: Users }] },
  { label: "Postventa", items: [{ label: "Servicio técnico", href: "#", icon: Wrench }] },
  { label: "Finanzas", items: [{ label: "Caja", href: "#", icon: CircleDollarSign }] },
  { label: "Reportes", items: [{ label: "Reportes", href: "#", icon: ChartNoAxesCombined }] },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div>
          <strong>MOBIX</strong>
          <span>Gestión móvil</span>
        </div>
      </div>

      <div className="company-selector">
        <div className="company-avatar">TS</div>
        <div className="company-copy">
          <strong>Tienda principal</strong>
          <span>Moyobamba</span>
        </div>
        <ChevronDown size={16} />
      </div>

      <nav className="sidebar-nav">
        {sections.map((section) => (
          <div className="nav-section" key={section.label}>
            <p>{section.label}</p>
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link href={item.href} className="nav-item" key={item.label}>
                  <Icon size={18} strokeWidth={1.8} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <Link className="nav-item" href="#"><ShieldCheck size={18} /> Administración</Link>
        <Link className="nav-item" href="#"><Settings size={18} /> Configuración</Link>
      </div>
    </aside>
  );
}
