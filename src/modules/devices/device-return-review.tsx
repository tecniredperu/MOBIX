"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, ShieldAlert, XCircle } from "lucide-react";
import { resolveReturnedDeviceAction } from "./device-actions";

export function DeviceReturnReview({ productUnitId }: { productUnitId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function resolve(resolution: "RESTOCK" | "DAMAGED") {
    setError("");
    startTransition(async () => {
      try {
        await resolveReturnedDeviceAction({ productUnitId, resolution });
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo actualizar el estado del equipo.");
      }
    });
  }

  return (
    <section className="panel device-return-review">
      <div className="device-return-review-icon"><ShieldAlert size={21} /></div>
      <div className="device-return-review-copy">
        <span>REVISIÓN DE EQUIPO DEVUELTO</span>
        <strong>Este IMEI está fuera del stock vendible</strong>
        <p>
          Evalúa físicamente el equipo antes de volver a ofrecerlo. MOBIX no lo mostrará como disponible en el POS mientras permanezca en revisión.
        </p>
        {error && <small className="device-return-review-error">{error}</small>}
      </div>
      <div className="device-return-review-actions">
        <button
          className="secondary-button device-return-damaged"
          type="button"
          disabled={pending}
          onClick={() => resolve("DAMAGED")}
        >
          <XCircle size={16} />
          Marcar dañado
        </button>
        <button
          className="primary-button"
          type="button"
          disabled={pending}
          onClick={() => resolve("RESTOCK")}
        >
          <BadgeCheck size={16} />
          {pending ? "Procesando..." : "Aprobar para venta"}
        </button>
      </div>
    </section>
  );
}
