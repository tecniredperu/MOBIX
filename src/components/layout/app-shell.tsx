import type { ReactNode } from "react";
import { requireAuthContext } from "@/lib/auth-context";
import { AppShellFrame } from "./app-shell-frame";

export async function AppShell({ children }: { children: ReactNode }) {
  const auth = await requireAuthContext();

  return (
    <AppShellFrame
      companyName={auth.company.tradeName ?? auth.company.businessName}
      companyLogoUrl={auth.company.logoUrl}
      branchName={auth.membership.defaultBranch?.name ?? "Sin sucursal asignada"}
      isSystem={auth.role.isSystem}
      permissions={[...auth.permissions]}
      userName={auth.user.name}
      roleName={auth.role.name}
    >
      {children}
    </AppShellFrame>
  );
}
