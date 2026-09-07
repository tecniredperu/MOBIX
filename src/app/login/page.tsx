import { redirect } from "next/navigation";
import { BarChart3, Boxes, ShieldCheck, Smartphone } from "lucide-react";
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
    <main className="mobix-login-page">
      <section className="mobix-login-brand-panel">
        <div className="login-brand"><div className="login-brand-mark">M</div><div><strong>MOBIX</strong><span>Gestión inteligente para tiendas móviles</span></div></div>
        <div className="login-hero-copy"><span className="eyebrow">OPERACIÓN · INVENTARIO · VENTAS</span><h1>Todo tu negocio, bajo control.</h1><p>Administra celulares por IMEI, ventas, caja, compras, clientes, crédito, postventa y rentabilidad desde una sola plataforma.</p></div>
        <div className="login-feature-grid">
          <div><Smartphone size={19}/><strong>IMEI trazable</strong><span>Control unitario de cada equipo.</span></div>
          <div><Boxes size={19}/><strong>Inventario real</strong><span>Kardex, compras y transferencias.</span></div>
          <div><BarChart3 size={19}/><strong>Rentabilidad</strong><span>Ventas, costos y margen real.</span></div>
          <div><ShieldCheck size={19}/><strong>Acceso seguro</strong><span>Usuarios, roles y permisos.</span></div>
        </div>
      </section>
      <section className="mobix-login-access-panel">
        <div className="mobix-login-card">
          <div className="login-mobile-brand"><div className="login-brand-mark">M</div><strong>MOBIX</strong></div>
          <span className="eyebrow">ACCESO SEGURO</span>
          <h2>Bienvenido</h2>
          <p>Ingresa con tu cuenta asignada para continuar.</p>
          <LoginForm nextPath={nextPath} />
          <small className="login-help">Si no puedes ingresar, solicita al administrador que revise tu usuario o restablezca tu contraseña.</small>
        </div>
      </section>
    </main>
  );
}
