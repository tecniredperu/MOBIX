"use client";

import Link from "next/link";
import { Pencil, Power, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ProductRowActions({
  productId,
  productName,
  status,
}: {
  productId: string;
  productName: string;
  status: "ACTIVE" | "INACTIVE";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function toggleStatus() {
    const next = status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const verb = next === "ACTIVE" ? "activar" : "desactivar";
    if (!window.confirm(`¿Deseas ${verb} “${productName}”?`)) return;

    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/products/${productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", status: next }),
          cache: "no-store",
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(body.error ?? "No se pudo cambiar el estado del producto.");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "No se pudo cambiar el estado del producto.");
      }
    });
  }

  function deleteProduct() {
    if (!window.confirm(
      `¿Eliminar “${productName}”?\n\nSolo se eliminará si no tiene ventas, compras, kardex, equipos ni otros movimientos asociados.`,
    )) return;

    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/products/${productId}`, {
          method: "DELETE",
          cache: "no-store",
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(body.error ?? "No se pudo eliminar el producto.");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "No se pudo eliminar el producto.");
      }
    });
  }

  return (
    <div className="product-actions-cell">
      <div className="product-row-actions">
        <Link
          href={`/productos/${productId}/editar`}
          className="product-action-button edit"
          title="Editar producto"
          aria-label={`Editar ${productName}`}
        >
          <Pencil size={15} />
          <span>Editar</span>
        </Link>

        <button
          type="button"
          className={status === "ACTIVE" ? "product-action-button deactivate" : "product-action-button activate"}
          onClick={toggleStatus}
          disabled={pending}
          title={status === "ACTIVE" ? "Desactivar producto" : "Activar producto"}
          aria-label={status === "ACTIVE" ? `Desactivar ${productName}` : `Activar ${productName}`}
        >
          <Power size={15} />
          <span>{status === "ACTIVE" ? "Desactivar" : "Activar"}</span>
        </button>

        <button
          type="button"
          className="product-action-button delete"
          onClick={deleteProduct}
          disabled={pending}
          title="Eliminar producto"
          aria-label={`Eliminar ${productName}`}
        >
          <Trash2 size={15} />
          <span>Eliminar</span>
        </button>
      </div>

      {message && <div className="product-action-error" role="alert">{message}</div>}
    </div>
  );
}
