import type { ReactNode } from "react";
import { requireAuthContext } from "@/lib/auth-context";
import { Sidebar } from "./sidebar";
import { MobileNavigation } from "./mobile-navigation";
import { Topbar } from "./topbar";

export async function AppShell({ children }: { children: ReactNode }) {
  const auth = await requireAuthContext();
  const permissions = [...auth.permissions];
  return (
    <div className="app-shell">
      <MobileNavigation
        companyName={auth.company.tradeName ?? auth.company.businessName}
        companyLogoUrl={auth.company.logoUrl}
        branchName={auth.membership.defaultBranch?.name ?? "Sin sucursal asignada"}
        userName={auth.user.name}
        roleName={auth.role.name}
        isSystem={auth.role.isSystem}
        permissions={permissions}
      />
      <Sidebar
        companyName={auth.company.tradeName ?? auth.company.businessName}
        companyLogoUrl={auth.company.logoUrl}
        branchName={auth.membership.defaultBranch?.name ?? "Sin sucursal asignada"}
        isSystem={auth.role.isSystem}
        permissions={permissions}
      />
      <div className="app-main">
        <Topbar userName={auth.user.name} roleName={auth.role.name} />
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
