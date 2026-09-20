"use client";

import Link from "next/link";
import { LogOut, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/modules/auth/auth-actions";

type TopbarProps = {
  userName: string;
  roleName: string;
};

type PosCashStatus = {
  requireCashSession: boolean;
  open: boolean;
  branchName: string | null;
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "U"
  );
}

export function Topbar({ userName, roleName }: TopbarProps) {
  const pathname = usePathname();
  const isPos = pathname === "/pos";
  const [posCashStatus, setPosCashStatus] = useState<PosCashStatus | null>(null);

  useEffect(() => {
    if (!isPos) {
      setPosCashStatus(null);
      return;
    }

    const controller = new AbortController();

    void fetch("/api/pos/cash-status", {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("No se pudo consultar el estado de caja.");
        }
        return response.json() as Promise<PosCashStatus>;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setPosCashStatus(data);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setPosCashStatus(null);
      });

    return () => controller.abort();
  }, [isPos]);

  return (
    <header className="topbar">
      {isPos ? (
        <div
          className={
            posCashStatus?.requireCashSession
              ? posCashStatus.open
                ? "topbar-pos-cash open"
                : "topbar-pos-cash closed"
              : "topbar-pos-cash optional"
          }
          aria-live="polite"
        >
          <span className="topbar-pos-cash-dot" />
          <div>
            <strong>
              {!posCashStatus
                ? "Consultando caja"
                : !posCashStatus.requireCashSession
                  ? "Control de caja opcional"
                  : posCashStatus.open
                    ? "Caja abierta"
                    : "Caja cerrada"}
            </strong>
            <small>
              {!posCashStatus
                ? "Verificando turno..."
                : posCashStatus.open && posCashStatus.branchName
                  ? `Turno activo en ${posCashStatus.branchName}`
                  : posCashStatus.requireCashSession
                    ? "Debes abrir caja antes de vender"
                    : "Venta habilitada"}
            </small>
          </div>
          <Link href="/caja">
            {posCashStatus?.open ? "Ver caja" : "Ir a caja"}
          </Link>
        </div>
      ) : (
        <form className="global-search" action="/buscar" method="get">
          <Search size={18} />
          <input
            name="q"
            aria-label="Buscar"
            placeholder="Buscar productos, IMEI, ventas o clientes..."
            minLength={2}
          />
          <kbd>Enter</kbd>
        </form>
      )}

      <div className="topbar-actions">
        <Link href="/cuenta" className="topbar-account" aria-label="Mi cuenta">
          <div className="user-avatar">{initials(userName)}</div>
          <div className="user-copy">
            <strong>{userName}</strong>
            <span>{roleName}</span>
          </div>
        </Link>

        <form action={logoutAction}>
          <button className="topbar-logout" type="submit" aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </form>
      </div>
    </header>
  );
}
