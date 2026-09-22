import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";

/**
 * Carga una sola vez el contexto autenticado durante una petición/render de React.
 * Varias capas (permisos, repositorios y AppShell) necesitan la misma información;
 * reutilizarla evita viajes repetidos a PostgreSQL al cambiar de módulo.
 */
const loadAuthContext = cache(async () => {
  const session = await readSession();
  if (!session) return null;

  const membership = await prisma.companyUser.findFirst({
    where: {
      companyId: session.companyId,
      userId: session.userId,
      status: "ACTIVE",
      company: { status: "ACTIVE" },
      user: { status: "ACTIVE" },
      role: { status: "ACTIVE" },
    },
    select: {
      id: true,
      companyId: true,
      userId: true,
      roleId: true,
      defaultBranchId: true,
      status: true,
      company: {
        select: {
          id: true,
          businessName: true,
          tradeName: true,
          ruc: true,
          email: true,
          phone: true,
          address: true,
          logoUrl: true,
          currency: true,
          timezone: true,
          status: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          sessionVersion: true,
        },
      },
      defaultBranch: { select: { id: true, name: true } },
      role: {
        select: {
          id: true,
          name: true,
          isSystem: true,
          status: true,
          permissions: {
            select: { permission: { select: { code: true } } },
          },
        },
      },
    },
  });

  if (!membership) return null;
  if (membership.user.sessionVersion !== session.sessionVersion) return null;

  return {
    session,
    membership,
    company: membership.company,
    user: membership.user,
    role: membership.role,
    permissions: new Set(membership.role.permissions.map((item) => item.permission.code)),
  };
});

export async function getAuthContext(options: { redirectToLogin?: boolean } = {}) {
  const redirectToLogin = options.redirectToLogin ?? true;
  const context = await loadAuthContext();

  if (!context) {
    if (redirectToLogin) redirect("/login?session=expired");
    return null;
  }

  return context;
}

export async function requireAuthContext() {
  const context = await getAuthContext({ redirectToLogin: true });
  if (!context) redirect("/login");
  return context;
}
