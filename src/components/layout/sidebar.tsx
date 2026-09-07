"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BadgeDollarSign,
  Boxes,
  ChartNoAxesCombined,
  CircleDollarSign,
  LayoutDashboard,
  PackageSearch,
  Repeat2,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Users,
  Wrench,
} from "lucide-react";

const sections = [
  {
    label: "Inicio",
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard, permission: "dashboard.view" }],
  },
  {
    label: "Ventas",
    items: [
      { label: "Punto de venta", href: "/pos", icon: ShoppingCart, permission: "sales.create" },
      { label: "Ventas", href: "/ventas", icon: BadgeDollarSign, permission: "sales.view" },
      { label: "Devoluciones / cambios", href: "/devoluciones", icon: Repeat2, permission: "returns.manage" },
    ],
  },
  {
    label: "Inventario",
    items: [
      { label: "Productos", href: "/productos", icon: Boxes, permission: "inventory.view" },
      { label: "Equipos / IMEI", href: "/equipos", icon: Smartphone, permission: "inventory.view" },
      { label: "Kardex", href: "/kardex", icon: PackageSearch, permission: "inventory.view" },
      { label: "Transferencias", href: "/transferencias", icon: ArrowLeftRight, permission: "inventory.transfer" },
    ],
  },
  {
    label: "Compras",
    items: [{ label: "Compras", href: "/compras", icon: ShoppingBag, permission: "purchases.view" }],
  },
  {
    label: "Clientes",
    items: [{ label: "Clientes", href: "/clientes", icon: Users, permission: "customers.manage" }],
  },
  {
    label: "Postventa",
    items: [{ label: "Servicio técnico", href: "/servicio-tecnico", icon: Wrench, permission: "service.manage" }],
  },
  {
    label: "Finanzas",
    items: [{ label: "Caja", href: "/caja", icon: CircleDollarSign, permission: "cash.manage" }],
  },
  {
    label: "Reportes",
    items: [{ label: "Reportes gerenciales", href: "/reportes", icon: ChartNoAxesCombined, permission: "reports.view" }],
  },
];

type SidebarProps = {
  companyName: string;
  branchName: string;
  isSystem: boolean;
  permissions: string[];
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ companyName, branchName, isSystem, permissions }: SidebarProps) {
  const pathname = usePathname();
  const permissionSet = new Set(permissions);
  const allowed = (permission: string) => isSystem || permissionSet.has(permission);
  const adminHref = allowed("users.manage") ? "/administracion/usuarios" : "/administracion/roles";
  const showAdmin = allowed("users.manage") || allowed("roles.manage");

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div className="brand-copy">
          <strong>MOBIX</strong>
          <span>Gestión móvil</span>
        </div>
      </div>

      <div className="company-selector sidebar-company-static">
        <div className="company-avatar">{companyName.slice(0, 2).toUpperCase()}</div>
        <div className="company-copy">
          <strong>{companyName}</strong>
          <span>{branchName}</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Navegación principal">
        {sections.map((section) => {
          const items = section.items.filter((item) => allowed(item.permission));
          if (!items.length) return null;

          return (
            <div className="nav-section" key={section.label}>
              <p>{section.label}</p>
              {items.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    href={item.href}
                    className={`nav-item${active ? " active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    key={item.label}
                  >
                    <Icon size={17} strokeWidth={1.9} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        {showAdmin && (
          <Link
            className={`nav-item${isActivePath(pathname, "/administracion") ? " active" : ""}`}
            href={adminHref}
          >
            <ShieldCheck size={17} />
            <span>Administración</span>
          </Link>
        )}
        {allowed("settings.manage") && (
          <Link
            className={`nav-item${isActivePath(pathname, "/configuracion") ? " active" : ""}`}
            href="/configuracion"
          >
            <Settings size={17} />
            <span>Configuración</span>
          </Link>
        )}
      </div>
    </aside>
  );
}
