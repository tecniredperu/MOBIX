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
  Truck,
  Users,
  Wrench,
} from "lucide-react";

type NavChild = {
  label: string;
  href: string;
  permission: string;
};

type NavItem = {
  label: string;
  href?: string;
  icon: typeof LayoutDashboard;
  permission: string;
  children?: NavChild[];
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const sections: NavSection[] = [
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
      {
        label: "Productos",
        icon: Boxes,
        permission: "inventory.view",
        children: [
          { label: "Todos los productos", href: "/productos", permission: "inventory.view" },
          { label: "Categorías", href: "/productos/categorias", permission: "inventory.view" },
          { label: "Marcas", href: "/productos/marcas", permission: "inventory.view" },
        ],
      },
      { label: "Equipos / IMEI", href: "/equipos", icon: Smartphone, permission: "inventory.view" },
      { label: "Kardex", href: "/kardex", icon: PackageSearch, permission: "inventory.view" },
      { label: "Transferencias", href: "/transferencias", icon: ArrowLeftRight, permission: "inventory.transfer" },
    ],
  },
  {
    label: "Compras",
    items: [
      { label: "Compras", href: "/compras", icon: ShoppingBag, permission: "purchases.view" },
      { label: "Proveedores", href: "/proveedores", icon: Truck, permission: "purchases.view" },
    ],
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
  companyLogoUrl?: string | null;
  branchName: string;
  isSystem: boolean;
  permissions: string[];
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ companyName, companyLogoUrl, branchName, isSystem, permissions }: SidebarProps) {
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
        <div className="company-avatar">
          {companyLogoUrl ? (
            <img
              src={companyLogoUrl}
              alt={`Logo de ${companyName}`}
              style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 8, background: "white" }}
            />
          ) : companyName.slice(0, 2).toUpperCase()}
        </div>
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

                if (item.children?.length) {
                  const children = item.children.filter((child) => allowed(child.permission));
                  if (!children.length) return null;
                  const active = pathname === "/productos" || pathname.startsWith("/productos/");

                  return (
                    <div className="nav-group" key={item.label}>
                      <div className={`nav-item nav-parent${active ? " active" : ""}`}>
                        <Icon size={18} strokeWidth={1.9} />
                        <span>{item.label}</span>
                      </div>
                      <div className="nav-submenu" aria-label={`Submenú ${item.label}`}>
                        {children.map((child) => {
                          const childActive = child.href === "/productos"
                            ? pathname === "/productos"
                            : isActivePath(pathname, child.href);
                          return (
                            <Link
                              href={child.href}
                              className={`nav-subitem${childActive ? " active" : ""}`}
                              aria-current={childActive ? "page" : undefined}
                              key={child.label}
                            >
                              <span className="nav-subitem-dot" />
                              <span>{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                if (!item.href) return null;
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    href={item.href}
                    className={`nav-item${active ? " active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    key={item.label}
                  >
                    <Icon size={18} strokeWidth={1.9} />
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
            <ShieldCheck size={18} />
            <span>Administración</span>
          </Link>
        )}
        {allowed("settings.manage") && (
          <Link
            className={`nav-item${isActivePath(pathname, "/configuracion") ? " active" : ""}`}
            href="/configuracion"
          >
            <Settings size={18} />
            <span>Configuración</span>
          </Link>
        )}
      </div>
    </aside>
  );
}
