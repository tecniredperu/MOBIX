import { redirect } from "next/navigation";
import { Headphones, ShieldCheck, Smartphone, Sparkles, Zap } from "lucide-react";
import { getAuthContext } from "@/lib/auth-context";
import { LoginForm } from "@/modules/auth/login-form";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function safeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const active = await getAuthContext({ redirectToLogin: false });
  const params = await searchParams;
  const nextPath = safeNext(params.next);
  if (active) redirect(nextPath);

  return (
    <main className="mobix-login-page mobix-login-showroom">
      <div className="login-showroom-glow login-showroom-glow-one" aria-hidden="true" />
      <div className="login-showroom-glow login-showroom-glow-two" aria-hidden="true" />
      <div className="login-showroom-shelf login-showroom-shelf-one" aria-hidden="true" />
      <div className="login-showroom-shelf login-showroom-shelf-two" aria-hidden="true" />
      <div className="login-device login-device-phone" aria-hidden="true"><span /></div>
      <div className="login-device login-device-case" aria-hidden="true" />
      <div className="login-device login-device-watch" aria-hidden="true"><span /></div>
      <div className="login-device login-device-buds" aria-hidden="true"><span /><span /></div>

      <aside className="login-showroom-copy" aria-label="Ventajas de MOBIX">
        <div className="login-showroom-heading">
          <span>MÁS QUE<br />VENTAS</span>
          <strong>TU NEGOCIO<br />CONECTADO</strong>
          <i />
        </div>
        <div className="login-showroom-benefits">
          <div><Smartphone size={22}/><span>IMEI</span></div>
          <div><Headphones size={22}/><span>ACCESORIOS</span></div>
          <div><ShieldCheck size={22}/><span>CONTROL</span></div>
          <div><Zap size={22}/><span>AGILIDAD</span></div>
        </div>
      </aside>

      <div className="login-showroom-message" aria-hidden="true">
        <Sparkles size={18}/>
        <span>Gestión inteligente<br />siempre contigo</span>
      </div>

      <section className="mobix-login-access-panel">
        <div className="mobix-login-card mobix-login-glass-card">
          <div className="login-mobix-logo" aria-label="MOBIX">
            <span className="login-phone-mark"><i /></span>
            <strong>MOBI<b>X</b></strong>
            <small>TU NEGOCIO EN MOVIMIENTO</small>
          </div>

          <div className="login-card-copy">
            <span className="eyebrow">ACCESO SEGURO</span>
            <h1>Bienvenido</h1>
            <p>Ingresa a tu espacio de trabajo para continuar.</p>
          </div>

          <LoginForm nextPath={nextPath} />

          <div className="login-card-footer">
            <span />
            <p>Conectamos tu operación con lo que importa.</p>
            <span />
          </div>
        </div>
      </section>

      <div className="login-showroom-tagline" aria-hidden="true">
        <span>BUENAS<br />DECISIONES</span>
        <strong>MEJORES<br />NEGOCIOS</strong>
        <i />
      </div>
    </main>
  );
}
