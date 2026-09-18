"use client";

import { Printer, Repeat2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function ReturnDetailActions({
  exchangeCreditId,
  exchangeBalance,
}: {
  exchangeCreditId?: string | null;
  exchangeBalance?: number;
}) {
  const router = useRouter();
  const canContinueExchange = Boolean(exchangeCreditId && Number(exchangeBalance || 0) > 0.01);

  function printReturn() {
    document.body.classList.add("print-return-detail");
    const cleanup = () => document.body.classList.remove("print-return-detail");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1200);
  }

  return (
    <div className="return-detail-actions no-print">
      {canContinueExchange && (
        <button
          className="primary-button"
          type="button"
          onClick={() => router.push("/pos?exchangeCredit=" + encodeURIComponent(exchangeCreditId!))}
        >
          <Repeat2 size={16} />
          Usar saldo en POS
        </button>
      )}
      <button className="secondary-button" type="button" onClick={printReturn}>
        <Printer size={16} />
        Imprimir constancia
      </button>
    </div>
  );
}
