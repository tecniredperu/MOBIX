"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { History, Menu, Settings, ShieldCheck, X } from "lucide-react";
import { MOBILE_NAV_SECTIONS, MOBILE_QUICK_NAV } from "./navigation-config";

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
  const adminHref = allowed("users.manage") ? "/administracion/usuarios" : "/administracion/roles";

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const quick = MOBILE_QUICK_NAV.filter((item) => allowed(item.permission));

  return <>
    <button type="button" className="mobile-nav-trigger" aria-label="Abrir menú" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={21}/></button>
    <div className={`mobile-nav-layer${open ? " open" : ""}`} aria-hidden={!open}>
      <button className="mobile-nav-backdrop" type="button" aria-label="Cerrar menú" onClick={() => setOpen(false)}/>
      <aside className="mobile-nav-drawer">
        <header className="mobile-nav-header"><b>M</b><div><strong>MOBIX</strong><span>Gestión móvil</span></div><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={20}/></button></header>
        <div className="mobile-company-card"><div>{companyLogoUrl ? <img src={companyLogoUrl} alt=""/> : companyName.slice(0,2).toUpperCase()}</div><span><strong>{companyName}</strong><small>{branchName}</small></span></div>
        <nav className="mobile-nav-list">
          {MOBILE_NAV_SECTIONS.map((section) => {
            const items = section.items.filter((item) => allowed(item.permission));
            if (!items.length) return null;
            return <section key={section.label}><p>{section.label}</p>{items.map(({label,href,icon:Icon}) => <Link key={href} href={href} className={active(pathname,href)?"active":""}><Icon size={18}/><span>{label}</span></Link>)}</section>;
          })}
          {(showAdmin || allowed("roles.manage") || allowed("settings.manage")) && <section><p>Sistema</p>{showAdmin && <Link href={adminHref} className={active(pathname,"/administracion") && !active(pathname,"/administracion/auditoria")?"active":""}><ShieldCheck size={18}/><span>Administración</span></Link>}{allowed("roles.manage") && <Link href="/administracion/auditoria" className={active(pathname,"/administracion/auditoria")?"active":""}><History size={18}/><span>Auditoría</span></Link>}{allowed("settings.manage") && <Link href="/configuracion" className={active(pathname,"/configuracion")?"active":""}><Settings size={18}/><span>Configuración</span></Link>}</section>}
        </nav>
        <footer className="mobile-nav-user"><div>{userName.split(/\s+/).slice(0,2).map(v=>v[0]).join("").toUpperCase()}</div><span><strong>{userName}</strong><small>{roleName}</small></span></footer>
      </aside>
    </div>
    <nav className="mobile-bottom-nav" aria-label="Accesos rápidos">{quick.map(({label,href,icon:Icon}) => <Link key={href} href={href} className={active(pathname,href)?"active":""}><Icon size={19}/><span>{label}</span></Link>)}</nav>
  </>;
}
