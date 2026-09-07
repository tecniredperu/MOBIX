import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";

export async function getAuthContext(options: { redirectToLogin?: boolean } = {}) {
  const redirectToLogin = options.redirectToLogin ?? true;
  const session = await readSession();
  if (!session) {
    if (redirectToLogin) redirect("/login");
    return null;
  }

  const membership = await prisma.companyUser.findFirst({
    where: {
      companyId: session.companyId,
      userId: session.userId,
      status: "ACTIVE",
      company: { status: "ACTIVE" },
      user: { status: "ACTIVE" },
      role: { status: "ACTIVE" },
    },
    include: {
      company: true,
      user: true,
      defaultBranch: true,
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  });

  if (!membership) {
    if (redirectToLogin) redirect("/login?session=expired");
    return null;
  }

  return {
    session,
    membership,
    company: membership.company,
    user: membership.user,
    role: membership.role,
    permissions: new Set(membership.role.permissions.map((item) => item.permission.code)),
  };
}

export async function requireAuthContext() {
  const context = await getAuthContext({ redirectToLogin: true });
  if (!context) redirect("/login");
  return context;
}
