"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { loginAction, type AuthState } from "./auth-actions";

const initialState: AuthState = {};

export function LoginForm({ nextPath = "/" }: { nextPath?: string }) {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form className="mobix-login-form" action={action}>
      <input type="hidden" name="next" value={nextPath} />

      <label>
        <span>Correo electrónico</span>
        <div className="auth-input">
          <Mail size={19}/>
          <input
            name="email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            placeholder="usuario@empresa.com"
            required
          />
        </div>
      </label>

      <label>
        <span>Contraseña</span>
        <div className="auth-input auth-password-input">
          <LockKeyhole size={19}/>
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Tu contraseña"
            minLength={6}
            required
          />
          <button
            className="auth-password-toggle"
            type="button"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? <EyeOff size={19}/> : <Eye size={19}/>}
          </button>
        </div>
      </label>

      {state.error && <div className="auth-message error" role="alert">{state.error}</div>}

      <button className="auth-submit" type="submit" disabled={pending}>
        {pending ? <><span className="auth-submit-spinner" aria-hidden="true"/> Ingresando...</> : "Iniciar sesión"}
      </button>

      <p className="auth-security-note"><ShieldCheck size={15}/> Acceso cifrado y sesión protegida.</p>
    </form>
  );
}
