"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, Settings, ShieldCheck } from "lucide-react";
import { NAV_SECTIONS } from "./navigation-config";

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
        {NAV_SECTIONS.map((section) => {
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
            className={`nav-item${isActivePath(pathname, "/administracion") && !isActivePath(pathname, "/administracion/auditoria") ? " active" : ""}`}
            href={adminHref}
          >
            <ShieldCheck size={18} />
            <span>Administración</span>
          </Link>
        )}
        {allowed("roles.manage") && (
          <Link
            className={`nav-item${isActivePath(pathname, "/administracion/auditoria") ? " active" : ""}`}
            href="/administracion/auditoria"
          >
            <History size={18} />
            <span>Auditoría</span>
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
