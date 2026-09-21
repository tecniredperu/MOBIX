"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight, BadgeDollarSign, Boxes, ChartNoAxesCombined, CircleDollarSign,
  LayoutDashboard, Menu, PackageSearch, Repeat2, ScrollText, Settings, ShieldCheck,
  ShoppingBag, ShoppingCart, Smartphone, Truck, Users, Wrench, X,
} from "lucide-react";

const sections = [
  { label: "Inicio", items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard, permission: "dashboard.view" }] },
  { label: "Ventas", items: [
    { label: "Punto de venta", href: "/pos", icon: ShoppingCart, permission: "sales.create" },
    { label: "Ventas", href: "/ventas", icon: BadgeDollarSign, permission: "sales.view" },
    { label: "Devoluciones / cambios", href: "/devoluciones", icon: Repeat2, permission: "returns.manage" },
  ]},
  { label: "Inventario", items: [
    { label: "Productos", href: "/productos", icon: Boxes, permission: "inventory.view" },
    { label: "Equipos / IMEI", href: "/equipos", icon: Smartphone, permission: "inventory.view" },
    { label: "Kardex", href: "/kardex", icon: PackageSearch, permission: "inventory.view" },
    { label: "Transferencias", href: "/transferencias", icon: ArrowLeftRight, permission: "inventory.transfer" },
  ]},
  { label: "Compras", items: [
    { label: "Compras", href: "/compras", icon: ShoppingBag, permission: "purchases.view" },
    { label: "Proveedores", href: "/proveedores", icon: Truck, permission: "purchases.view" },
  ]},
  { label: "Gestión", items: [
    { label: "Clientes", href: "/clientes", icon: Users, permission: "customers.manage" },
    { label: "Servicio técnico", href: "/servicio-tecnico", icon: Wrench, permission: "service.manage" },
    { label: "Caja", href: "/caja", icon: CircleDollarSign, permission: "cash.manage" },
    { label: "Reportes gerenciales", href: "/reportes", icon: ChartNoAxesCombined, permission: "reports.view" },
  ]},
];

function active(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNavigation({ companyName, companyLogoUrl, branchName, userName, roleName, isSystem, permissions }: {
  companyName: string; companyLogoUrl?: string | null; branchName: string; userName: string; roleName: string; isSystem: boolean; permissions: string[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const allowed = (code: string) => isSystem || permissionSet.has(code);
  const showAdmin = allowed("users.manage") || allowed("roles.manage");
  const showAudit = allowed("audit.view");
  const adminHref = allowed("users.manage") ? "/administracion/usuarios" : "/administracion/roles";

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const quick = [
    { label: "Inicio", href: "/", icon: LayoutDashboard, permission: "dashboard.view" },
    { label: "POS", href: "/pos", icon: ShoppingCart, permission: "sales.create" },
    { label: "Ventas", href: "/ventas", icon: BadgeDollarSign, permission: "sales.view" },
    { label: "Caja", href: "/caja", icon: CircleDollarSign, permission: "cash.manage" },
  ].filter((item) => allowed(item.permission));

  return <>
    <button type="button" className="mobile-nav-trigger" aria-label="Abrir menú" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={21}/></button>
    <div className={`mobile-nav-layer${open ? " open" : ""}`} aria-hidden={!open}>
      <button className="mobile-nav-backdrop" type="button" aria-label="Cerrar menú" onClick={() => setOpen(false)}/>
      <aside className="mobile-nav-drawer">
        <header className="mobile-nav-header"><b>M</b><div><strong>MOBIX</strong><span>Gestión móvil</span></div><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={20}/></button></header>
        <div className="mobile-company-card"><div>{companyLogoUrl ? <img src={companyLogoUrl} alt=""/> : companyName.slice(0,2).toUpperCase()}</div><span><strong>{companyName}</strong><small>{branchName}</small></span></div>
        <nav className="mobile-nav-list">
          {sections.map((section) => {
            const items = section.items.filter((item) => allowed(item.permission));
            if (!items.length) return null;
            return <section key={section.label}><p>{section.label}</p>{items.map(({label,href,icon:Icon}) => <Link key={href} href={href} className={active(pathname,href)?"active":""}><Icon size={18}/><span>{label}</span></Link>)}</section>;
          })}
          {(showAdmin || showAudit || allowed("settings.manage")) && <section><p>Sistema</p>{showAdmin && <Link href={adminHref} className={active(pathname,"/administracion")&&!active(pathname,"/administracion/auditoria")?"active":""}><ShieldCheck size={18}/><span>Administración</span></Link>}{showAudit && <Link href="/administracion/auditoria" className={active(pathname,"/administracion/auditoria")?"active":""}><ScrollText size={18}/><span>Auditoría</span></Link>}{allowed("settings.manage") && <Link href="/configuracion" className={active(pathname,"/configuracion")?"active":""}><Settings size={18}/><span>Configuración</span></Link>}</section>}
        </nav>
        <footer className="mobile-nav-user"><div>{userName.split(/\s+/).slice(0,2).map(v=>v[0]).join("").toUpperCase()}</div><span><strong>{userName}</strong><small>{roleName}</small></span></footer>
      </aside>
    </div>
    <nav className="mobile-bottom-nav" aria-label="Accesos rápidos">{quick.map(({label,href,icon:Icon}) => <Link key={href} href={href} className={active(pathname,href)?"active":""}><Icon size={19}/><span>{label}</span></Link>)}</nav>
  </>;
}
