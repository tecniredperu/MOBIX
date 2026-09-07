import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

type CustomerCreditRow = {
  id: string;
  creditEnabled: boolean;
  creditLimit: unknown;
  creditDays: number;
  creditNotes: string | null;
  outstanding: unknown;
  overdue: unknown;
};

type ReceivableRow = {
  id: string;
  saleId: string;
  saleNumber: string;
  documentSeries: string | null;
  documentNumber: string | null;
  status: string;
  originalAmount: unknown;
  paidAmount: unknown;
  balance: unknown;
  dueDate: Date;
  createdAt: Date;
};

type ReceivablePaymentRow = {
  id: string;
  receivableId: string;
  amount: unknown;
  paymentMethod: string;
  reference: string | null;
  notes: string | null;
  paidAt: Date;
  createdBy: string;
};

function displayName(customer: {
  businessName: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  if (customer.businessName?.trim()) return customer.businessName;
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || "Cliente";
}

export async function getCustomers(filters: { q?: string; credit?: string } = {}) {
  const company = await getActiveCompany();
  const q = filters.q?.trim();

  const customers = await prisma.customer.findMany({
    where: {
      companyId: company.id,
      ...(q
        ? {
            OR: [
              { documentNumber: { contains: q, mode: "insensitive" } },
              { businessName: { contains: q, mode: "insensitive" } },
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { whatsapp: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { _count: { select: { sales: true } } },
  });

  const profiles = await prisma.$queryRaw<CustomerCreditRow[]>`
    SELECT
      c."id",
      c."creditEnabled",
      c."creditLimit",
      c."creditDays",
      c."creditNotes",
      COALESCE(SUM(ar."balance") FILTER (WHERE ar."status" IN ('OPEN', 'PARTIAL')), 0) AS "outstanding",
      COALESCE(SUM(ar."balance") FILTER (WHERE ar."status" IN ('OPEN', 'PARTIAL') AND ar."dueDate" < NOW()), 0) AS "overdue"
    FROM "customers" c
    LEFT JOIN "accounts_receivable" ar
      ON ar."customerId" = c."id" AND ar."companyId" = c."companyId"
    WHERE c."companyId" = ${company.id}
    GROUP BY c."id", c."creditEnabled", c."creditLimit", c."creditDays", c."creditNotes"
  `;

  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  let items = customers.map((customer) => {
    const profile = profileMap.get(customer.id);
    const creditLimit = Number(profile?.creditLimit ?? 0);
    const outstanding = Number(profile?.outstanding ?? 0);
    const overdue = Number(profile?.overdue ?? 0);
    return {
      id: customer.id,
      name: displayName(customer),
      documentType: customer.documentType,
      documentNumber: customer.documentNumber,
      phone: customer.whatsapp ?? customer.phone,
      email: customer.email,
      status: customer.status,
      salesCount: customer._count.sales,
      creditEnabled: Boolean(profile?.creditEnabled),
      creditLimit,
      creditDays: Number(profile?.creditDays ?? 30),
      outstanding,
      overdue,
      availableCredit: Math.max(0, creditLimit - outstanding),
      updatedAt: customer.updatedAt.toISOString(),
    };
  });

  if (filters.credit === "enabled") items = items.filter((item) => item.creditEnabled);
  if (filters.credit === "debt") items = items.filter((item) => item.outstanding > 0.009);
  if (filters.credit === "overdue") items = items.filter((item) => item.overdue > 0.009);

  const totalOutstanding = profiles.reduce((sum, profile) => sum + Number(profile.outstanding ?? 0), 0);
  const totalOverdue = profiles.reduce((sum, profile) => sum + Number(profile.overdue ?? 0), 0);
  const creditEnabled = profiles.filter((profile) => profile.creditEnabled).length;

  return {
    items,
    summary: {
      total: customers.length,
      creditEnabled,
      outstanding: totalOutstanding,
      overdue: totalOverdue,
    },
  };
}

export async function getCustomerDetail(id: string) {
  const company = await getActiveCompany();
  const customer = await prisma.customer.findFirst({
    where: { id, companyId: company.id },
    include: {
      sales: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          payments: true,
          items: { select: { quantity: true } },
        },
      },
    },
  });
  if (!customer) return null;

  const [profiles, receivables, payments] = await Promise.all([
    prisma.$queryRaw<CustomerCreditRow[]>`
      SELECT
        c."id",
        c."creditEnabled",
        c."creditLimit",
        c."creditDays",
        c."creditNotes",
        COALESCE(SUM(ar."balance") FILTER (WHERE ar."status" IN ('OPEN', 'PARTIAL')), 0) AS "outstanding",
        COALESCE(SUM(ar."balance") FILTER (WHERE ar."status" IN ('OPEN', 'PARTIAL') AND ar."dueDate" < NOW()), 0) AS "overdue"
      FROM "customers" c
      LEFT JOIN "accounts_receivable" ar
        ON ar."customerId" = c."id" AND ar."companyId" = c."companyId"
      WHERE c."id" = ${customer.id} AND c."companyId" = ${company.id}
      GROUP BY c."id", c."creditEnabled", c."creditLimit", c."creditDays", c."creditNotes"
    `,
    prisma.$queryRaw<ReceivableRow[]>`
      SELECT
        ar."id",
        ar."saleId",
        s."saleNumber",
        s."documentSeries",
        s."documentNumber",
        ar."status"::text AS "status",
        ar."originalAmount",
        ar."paidAmount",
        ar."balance",
        ar."dueDate",
        ar."createdAt"
      FROM "accounts_receivable" ar
      INNER JOIN "sales" s ON s."id" = ar."saleId"
      WHERE ar."companyId" = ${company.id} AND ar."customerId" = ${customer.id}
      ORDER BY ar."createdAt" DESC
    `,
    prisma.$queryRaw<ReceivablePaymentRow[]>`
      SELECT
        rp."id",
        rp."receivableId",
        rp."amount",
        rp."paymentMethod"::text AS "paymentMethod",
        rp."reference",
        rp."notes",
        rp."paidAt",
        u."name" AS "createdBy"
      FROM "receivable_payments" rp
      INNER JOIN "accounts_receivable" ar ON ar."id" = rp."receivableId"
      INNER JOIN "users" u ON u."id" = rp."createdById"
      WHERE rp."companyId" = ${company.id} AND ar."customerId" = ${customer.id}
      ORDER BY rp."paidAt" DESC
      LIMIT 100
    `,
  ]);

  const profile = profiles[0];
  const creditLimit = Number(profile?.creditLimit ?? 0);
  const outstanding = Number(profile?.outstanding ?? 0);
  const overdue = Number(profile?.overdue ?? 0);
  const completedSales = customer.sales.filter((sale) => sale.status === "COMPLETED");
  const purchaseTotal = completedSales.reduce((sum, sale) => sum + Number(sale.total), 0);

  return {
    id: customer.id,
    name: displayName(customer),
    documentType: customer.documentType,
    documentNumber: customer.documentNumber,
    firstName: customer.firstName,
    lastName: customer.lastName,
    businessName: customer.businessName,
    phone: customer.phone,
    whatsapp: customer.whatsapp,
    email: customer.email,
    address: customer.address,
    status: customer.status,
    createdAt: customer.createdAt.toISOString(),
    credit: {
      enabled: Boolean(profile?.creditEnabled),
      limit: creditLimit,
      days: Number(profile?.creditDays ?? 30),
      notes: profile?.creditNotes ?? null,
      outstanding,
      overdue,
      available: Math.max(0, creditLimit - outstanding),
    },
    summary: {
      salesCount: completedSales.length,
      purchaseTotal,
      outstanding,
      overdue,
    },
    sales: customer.sales.map((sale) => ({
      id: sale.id,
      saleNumber: sale.saleNumber,
      document: [sale.documentSeries, sale.documentNumber].filter(Boolean).join("-") || "—",
      total: Number(sale.total),
      status: sale.status,
      itemCount: sale.items.reduce((sum, item) => sum + item.quantity, 0),
      payments: sale.payments.map((payment) => payment.paymentMethod),
      createdAt: sale.createdAt.toISOString(),
    })),
    receivables: receivables.map((row) => ({
      id: row.id,
      saleId: row.saleId,
      saleNumber: row.saleNumber,
      document: [row.documentSeries, row.documentNumber].filter(Boolean).join("-") || "—",
      status: row.status,
      originalAmount: Number(row.originalAmount),
      paidAmount: Number(row.paidAmount),
      balance: Number(row.balance),
      dueDate: row.dueDate.toISOString(),
      createdAt: row.createdAt.toISOString(),
      overdue: Number(row.balance) > 0.009 && row.dueDate.getTime() < Date.now(),
    })),
    payments: payments.map((row) => ({
      id: row.id,
      receivableId: row.receivableId,
      amount: Number(row.amount),
      method: row.paymentMethod,
      reference: row.reference,
      notes: row.notes,
      createdBy: row.createdBy,
      paidAt: row.paidAt.toISOString(),
    })),
  };
}
