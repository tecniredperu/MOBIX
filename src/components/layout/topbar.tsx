import { Bell, Search } from "lucide-react";

export function Topbar() {
  return (
    <header className="topbar">
      <div className="global-search">
        <Search size={18} />
        <input aria-label="Buscar" placeholder="Buscar productos, IMEI, ventas o clientes..." />
        <kbd>Ctrl K</kbd>
      </div>
      <div className="topbar-actions">
        <button className="icon-button" aria-label="Notificaciones"><Bell size={19} /></button>
        <div className="user-avatar">LV</div>
        <div className="user-copy"><strong>Administrador</strong><span>Cuenta principal</span></div>
      </div>
    </header>
  );
}
