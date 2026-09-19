import { getOperationalContext } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";

export async function getPosCashStatus() {
  const { company, user } = await getOperationalContext();

  const session = await prisma.cashSession.findFirst({
    where: {
      companyId: company.id,
      userId: user.id,
      status: "OPEN",
    },
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
