"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mobix-error-state" role="alert">
      <div className="mobix-error-card">
        <span className="mobix-error-icon"><AlertTriangle size={24} /></span>
        <div>
          <span className="eyebrow">MOBIX</span>
          <h1>No pudimos cargar esta sección</h1>
          <p>Ocurrió un problema al procesar la información. Reintenta la operación; si continúa, revisa la conexión o el estado del servicio.</p>
          {error.digest && <small className="mobix-error-code">Código de soporte: {error.digest}</small>}
        </div>
        <button className="primary-button" type="button" onClick={reset}>
          <RefreshCw size={16} /> Reintentar
        </button>
      </div>
    </main>
  );
}
