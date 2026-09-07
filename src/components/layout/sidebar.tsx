"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
      { label: "Punto de venta", href: "/pos", icon: ShoppingCart },
      { label: "Ventas", href: "/ventas", icon: BadgeDollarSign },
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
  { label: "Clientes", items: [{ label: "Clientes", href: "/clientes", icon: Users }] },
  { label: "Postventa", items: [{ label: "Servicio técnico", href: "/servicio-tecnico", icon: Wrench }] },
  { label: "Finanzas", items: [{ label: "Caja", href: "/caja", icon: CircleDollarSign }] },
  { label: "Reportes", items: [{ label: "Reportes", href: "#", icon: ChartNoAxesCombined }] },
];

function isActivePath(pathname: string, href: string) {
  if (href === "#") return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div className="brand-copy">
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
        <ChevronDown size={15} />
      </div>

      <nav className="sidebar-nav" aria-label="Navegación principal">
        {sections.map((section) => (
          <div className="nav-section" key={section.label}>
            <p>{section.label}</p>
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  href={item.href}
                  className={`nav-item${active ? " active" : ""}${item.href === "#" ? " disabled-link" : ""}`}
                  aria-current={active ? "page" : undefined}
                  key={item.label}
                >
                  <Icon size={17} strokeWidth={1.9} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <Link className="nav-item disabled-link" href="#"><ShieldCheck size={17} /> <span>Administración</span></Link>
        <Link className="nav-item disabled-link" href="#"><Settings size={17} /> <span>Configuración</span></Link>
      </div>
    </aside>
  );
}
