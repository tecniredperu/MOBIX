"use client";

import { useState, useTransition } from "react";
import { Save, UserPlus, X } from "lucide-react";
import { createPosCustomerAction } from "../sale-actions";
import type { PosCustomer } from "../sale-types";

type CustomerDocumentType = "DNI" | "RUC" | "CE" | "OTHER";

export function PosCustomerModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: PosCustomer) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [documentType, setDocumentType] = useState<CustomerDocumentType>("DNI");
  const [documentNumber, setDocumentNumber] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  function reset() {
    setDocumentType("DNI");
    setDocumentNumber("");
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setError("");
  }

  function close() {
    if (isPending) return;
    reset();
    onClose();
  }

  function submit() {
    if (isPending) return;
    setError("");
    startTransition(async () => {
      try {
        const customer = await createPosCustomerAction({
          documentType,
          documentNumber,
          name,
          phone,
          email,
          address,
        });
        onCreated(customer);
        reset();
        onClose();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo registrar el cliente.");
      }
    });
  }

  return (
    <div className="pos-customer-modal" role="dialog" aria-modal="true" aria-label="Agregar cliente">
      <button className="pos-customer-modal-backdrop" type="button" aria-label="Cerrar" onClick={close} />
      <section className="pos-customer-modal-card">
        <header className="pos-customer-modal-head">
          <div className="pos-customer-modal-title">
            <span><UserPlus size={18} /></span>
            <div>
              <strong>Agregar cliente</strong>
              <small>Se guardará y quedará seleccionado en esta venta.</small>
            </div>
          </div>
          <button className="pos-customer-modal-close" type="button" onClick={close} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        <div className="pos-customer-modal-body">
          {error && <div className="pos-customer-modal-error">{error}</div>}

          <div className="pos-customer-modal-grid">
            <label>
              <span>Tipo de documento</span>
              <select value={documentType} onChange={(event) => setDocumentType(event.target.value as CustomerDocumentType)}>
                <option value="DNI">DNI</option>
                <option value="RUC">RUC</option>
                <option value="CE">Carné de extranjería</option>
                <option value="OTHER">Otro</option>
              </select>
            </label>
            <label>
              <span>N.º de documento</span>
              <input
                autoFocus
                inputMode={documentType === "DNI" || documentType === "RUC" ? "numeric" : "text"}
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
                placeholder={documentType === "DNI" ? "8 dígitos" : documentType === "RUC" ? "11 dígitos" : "Documento (opcional)"}
              />
            </label>
            <label className="span-two">
              <span>{documentType === "RUC" ? "Razón social" : "Nombre del cliente"}</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder={documentType === "RUC" ? "Razón social" : "Nombres y apellidos"} />
            </label>
            <label>
              <span>Celular / WhatsApp</span>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Opcional" />
            </label>
            <label>
              <span>Correo</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Opcional" />
            </label>
            <label className="span-two">
              <span>Dirección</span>
              <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Opcional" />
            </label>
          </div>
        </div>

        <footer className="pos-customer-modal-actions">
          <button className="secondary-button" type="button" onClick={close} disabled={isPending}>Cancelar</button>
          <button className="primary-button" type="button" onClick={submit} disabled={isPending || name.trim().length < 2}>
            <Save size={16} /> {isPending ? "Guardando..." : "Guardar cliente"}
          </button>
        </footer>
      </section>
    </div>
  );
}
