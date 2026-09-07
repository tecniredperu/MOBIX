import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

export async function getPosCashStatus() {
  const company = await getActiveCompany();
  const membership = await prisma.companyUser.findFirst({
    where: { companyId: company.id, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });

  if (!membership) return null;

  const session = await prisma.cashSession.findFirst({
    where: { companyId: company.id, userId: membership.userId, status: "OPEN" },
    orderBy: { openedAt: "desc" },
    include: { branch: { select: { id: true, name: true } } },
  });

  if (!session) return null;

  return {
    id: session.id,
    branchId: session.branch.id,
    branchName: session.branch.name,
    openedAt: session.openedAt.toISOString(),
  };
}
