import Link from "next/link";
import { LogOut, Search } from "lucide-react";
import { logoutAction } from "@/modules/auth/auth-actions";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0,2).map((part)=>part[0]).join("").toUpperCase() || "U";
}

export function Topbar({ userName, roleName }: { userName: string; roleName: string }) {
  return (
    <header className="topbar">
      <form className="global-search" action="/buscar" method="get">
        <Search size={18} />
        <input name="q" aria-label="Buscar" placeholder="Buscar productos, IMEI, ventas o clientes..." minLength={2} />
        <kbd>Enter</kbd>
      </form>
      <div className="topbar-actions">
        <Link href="/cuenta" className="topbar-account" aria-label="Mi cuenta">
          <div className="user-avatar">{initials(userName)}</div>
          <div className="user-copy"><strong>{userName}</strong><span>{roleName}</span></div>
        </Link>
        <form action={logoutAction}><button className="topbar-logout" type="submit" aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={18}/></button></form>
      </div>
    </header>
  );
}
