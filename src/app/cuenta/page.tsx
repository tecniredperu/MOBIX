import { AppShell } from "@/components/layout/app-shell";
import { requireAuthContext } from "@/lib/auth-context";
import { ChangePasswordForm } from "@/modules/auth/change-password-form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const auth = await requireAuthContext();
  return (
    <AppShell>
      <div className="page-stack account-page">
        <section className="page-heading"><div><span className="eyebrow">MI CUENTA</span><h1>Perfil y seguridad</h1><p>Información de la cuenta que está operando actualmente en MOBIX.</p></div></section>
        <section className="account-grid">
          <article className="panel account-profile-card">
            <div className="account-avatar-large">{auth.user.name.split(/\s+/).slice(0,2).map((part)=>part[0]).join("").toUpperCase()}</div>
            <div><span>Usuario</span><strong>{auth.user.name}</strong><small>{auth.user.email}</small></div>
            <div className="account-profile-meta"><p><span>Rol</span><strong>{auth.role.name}</strong></p><p><span>Empresa</span><strong>{auth.company.tradeName ?? auth.company.businessName}</strong></p><p><span>Sucursal predeterminada</span><strong>{auth.membership.defaultBranch?.name ?? "No asignada"}</strong></p></div>
          </article>
          <article className="panel"><ChangePasswordForm /></article>
        </section>
      </div>
    </AppShell>
  );
}
