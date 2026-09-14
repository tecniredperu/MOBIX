"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("MOBIX route error", error);
  }, [error]);

  return (
    <section className="mobix-error-state" role="alert">
      <div className="mobix-error-icon"><AlertTriangle size={24} /></div>
      <div>
        <span className="eyebrow">OPERACIÓN INTERRUMPIDA</span>
        <h2>No pudimos cargar este módulo</h2>
        <p>La información de tu negocio no se ha modificado. Puedes volver a intentarlo sin salir de MOBIX.</p>
      </div>
      <button className="primary-button" type="button" onClick={reset}>
        <RotateCcw size={16} /> Reintentar
      </button>
    </section>
  );
}
