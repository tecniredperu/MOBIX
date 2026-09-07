"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { changePasswordAction, type AuthState } from "./auth-actions";

const initialState: AuthState = {};

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initialState);
  return (
    <form className="account-password-form" action={action}>
      <div className="panel-heading"><div><h2>Seguridad de la cuenta</h2><p>Cambia tu contraseña de acceso a MOBIX.</p></div><KeyRound size={20}/></div>
      <label><span>Contraseña actual</span><input name="currentPassword" type="password" autoComplete="current-password" required /></label>
      <div className="account-password-grid">
        <label><span>Nueva contraseña</span><input name="newPassword" type="password" autoComplete="new-password" minLength={10} required /></label>
        <label><span>Confirmar nueva contraseña</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></label>
      </div>
      {state.error && <div className="auth-message error" role="alert">{state.error}</div>}
      {state.success && <div className="auth-message success" role="status">{state.success}</div>}
      <div><button className="primary-button" type="submit" disabled={pending}>{pending ? "Guardando..." : "Actualizar contraseña"}</button></div>
    </form>
  );
}
