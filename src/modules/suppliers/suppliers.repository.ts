import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

export type SupplierFilters = {
  q?: string;
  status?: string;
};

export async function getSuppliers(filters: SupplierFilters = {}) {
  const company = await getActiveCompany();
  const q = filters.q?.trim();
  const status = filters.status === "ACTIVE" || filters.status === "INACTIVE" ? filters.status : undefined;

  const where = {
    companyId: company.id,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { businessName: { contains: q, mode: "insensitive" as const } },
            { contactName: { contains: q, mode: "insensitive" as const } },
            { documentNumber: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [suppliers, total, active] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: [{ status: "asc" }, { businessName: "asc" }],
      take: 200,
      include: {
        _count: { select: { purchases: true } },
        purchases: {
          where: { status: { not: "CANCELLED" } },
          orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { issueDate: true, total: true, number: true },
        },
      },
    }),
    prisma.supplier.count({ where: { companyId: company.id } }),
    prisma.supplier.count({ where: { companyId: company.id, status: "ACTIVE" } }),
  ]);

  return {
    items: suppliers.map((supplier) => ({
      id: supplier.id,
      documentType: supplier.documentType,
      documentNumber: supplier.documentNumber,
      businessName: supplier.businessName,
      contactName: supplier.contactName,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      status: supplier.status,
      purchasesCount: supplier._count.purchases,
      lastPurchase: supplier.purchases[0]
        ? {
            date: supplier.purchases[0].issueDate.toISOString(),
            total: Number(supplier.purchases[0].total),
            number: supplier.purchases[0].number,
          }
        : null,
    })),
    summary: {
      total,
      active,
      inactive: Math.max(0, total - active),
    },
  };
}

export async function getActiveSupplierOptions() {
  const company = await getActiveCompany();
  return prisma.supplier.findMany({
    where: { companyId: company.id, status: "ACTIVE" },
    orderBy: { businessName: "asc" },
    select: {
      id: true,
      documentType: true,
      documentNumber: true,
      businessName: true,
      contactName: true,
      phone: true,
      email: true,
      address: true,
    },
  });
}
