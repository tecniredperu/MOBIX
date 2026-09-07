"use client";

import { useActionState } from "react";
import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { loginAction, type AuthState } from "./auth-actions";

const initialState: AuthState = {};

export function LoginForm({ nextPath = "/" }: { nextPath?: string }) {
  const [state, action, pending] = useActionState(loginAction, initialState);
  return (
    <form className="mobix-login-form" action={action}>
      <input type="hidden" name="next" value={nextPath} />
      <label>
        <span>Correo electrónico</span>
        <div className="auth-input"><Mail size={17}/><input name="email" type="email" autoComplete="username" placeholder="usuario@empresa.com" required /></div>
      </label>
      <label>
        <span>Contraseña</span>
        <div className="auth-input"><LockKeyhole size={17}/><input name="password" type="password" autoComplete="current-password" placeholder="Tu contraseña" minLength={6} required /></div>
      </label>
      {state.error && <div className="auth-message error" role="alert">{state.error}</div>}
      <button className="auth-submit" type="submit" disabled={pending}>{pending ? "Ingresando..." : "Ingresar a MOBIX"}</button>
      <p className="auth-security-note"><ShieldCheck size={14}/> Sesión protegida con cookie HTTP-only y validación de usuario activo.</p>
    </form>
  );
}
