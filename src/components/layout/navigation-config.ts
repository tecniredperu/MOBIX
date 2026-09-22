import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BadgeDollarSign,
  Boxes,
  ChartNoAxesCombined,
  CircleDollarSign,
  LayoutDashboard,
  PackageSearch,
  Repeat2,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Truck,
  Users,
  Wrench,
} from "lucide-react";

export type NavChild = {
  label: string;
  href: string;
  permission: string;
};

export type NavItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
  permission: string;
  children?: NavChild[];
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
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
        href: "/productos",
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

export const MOBILE_NAV_SECTIONS: NavSection[] = [
  NAV_SECTIONS[0],
  NAV_SECTIONS[1],
  {
    label: "Inventario",
    items: [
      { label: "Productos", href: "/productos", icon: Boxes, permission: "inventory.view" },
      ...NAV_SECTIONS[2].items.slice(1),
    ],
  },
  NAV_SECTIONS[3],
  {
    label: "Gestión",
    items: [
      { label: "Clientes", href: "/clientes", icon: Users, permission: "customers.manage" },
      { label: "Servicio técnico", href: "/servicio-tecnico", icon: Wrench, permission: "service.manage" },
      { label: "Caja", href: "/caja", icon: CircleDollarSign, permission: "cash.manage" },
      { label: "Reportes gerenciales", href: "/reportes", icon: ChartNoAxesCombined, permission: "reports.view" },
    ],
  },
];

export const MOBILE_QUICK_NAV = [
  { label: "Inicio", href: "/", icon: LayoutDashboard, permission: "dashboard.view" },
  { label: "POS", href: "/pos", icon: ShoppingCart, permission: "sales.create" },
  { label: "Ventas", href: "/ventas", icon: BadgeDollarSign, permission: "sales.view" },
  { label: "Caja", href: "/caja", icon: CircleDollarSign, permission: "cash.manage" },
] satisfies NavItem[];
