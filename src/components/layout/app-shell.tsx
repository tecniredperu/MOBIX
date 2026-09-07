import type { ReactNode } from "react";
import { requireAuthContext } from "@/lib/auth-context";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export async function AppShell({ children }: { children: ReactNode }) {
  const auth = await requireAuthContext();
  return (
    <div className="app-shell">
      <Sidebar
        companyName={auth.company.tradeName ?? auth.company.businessName}
        branchName={auth.membership.defaultBranch?.name ?? "Sin sucursal asignada"}
        isSystem={auth.role.isSystem}
        permissions={[...auth.permissions]}
      />
      <div className="app-main">
        <Topbar userName={auth.user.name} roleName={auth.role.name} />
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
