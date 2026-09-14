"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

const ShellContext = createContext(false);

type AppShellFrameProps = {
  children: ReactNode;
  companyName: string;
  companyLogoUrl?: string | null;
  branchName: string;
  isSystem: boolean;
  permissions: string[];
  userName: string;
  roleName: string;
};

export function AppShellFrame({
  children,
  companyName,
  companyLogoUrl,
  branchName,
  isSystem,
  permissions,
  userName,
  roleName,
}: AppShellFrameProps) {
  const alreadyInsideShell = useContext(ShellContext);

  // Las páginas históricas todavía pueden envolver su contenido con AppShell.
  // Cuando existe el shell persistente del layout raíz, este segundo nivel se
  // convierte en un no-op para evitar duplicar sidebar/topbar.
  if (alreadyInsideShell) return <>{children}</>;

  return (
    <ShellContext.Provider value>
      <div className="app-shell">
        <Sidebar
          companyName={companyName}
          companyLogoUrl={companyLogoUrl}
          branchName={branchName}
          isSystem={isSystem}
          permissions={permissions}
        />
        <div className="app-main">
          <Topbar userName={userName} roleName={roleName} />
          <main className="page-content">{children}</main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
