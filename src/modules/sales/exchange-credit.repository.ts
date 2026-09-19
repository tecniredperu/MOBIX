import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";
import type { PosCustomer, PosExchangeCredit } from "./sale-types";

function displayCustomer(customer: {
  businessName: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  if (customer.businessName?.trim()) return customer.businessName;
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || "Cliente";
}

export async function getExchangeCreditForPos(id: string): Promise<PosExchangeCredit | null> {
  if (!id) return null;
  const company = await getActiveCompany();

  const credit = await prisma.exchangeCredit.findFirst({
    where: {
      id,
      companyId: company.id,
      status: { in: ["OPEN", "PARTIAL"] },
      balance: { gt: 0 },
    },
    include: {
      returnOrder: { select: { returnNumber: true } },
      customer: true,
    },
  });

  if (!credit) return null;

  let customer: PosCustomer | null = null;
  if (credit.customer) {
    const outstanding = await prisma.accountReceivable.aggregate({
      where: {
        companyId: company.id,
        customerId: credit.customer.id,
        status: { in: ["OPEN", "PARTIAL"] },
      },
      _sum: { balance: true },
    });

    const creditLimit = Number(credit.customer.creditLimit ?? 0);
    const outstandingAmount = Number(outstanding._sum.balance ?? 0);
    customer = {
      id: credit.customer.id,
      documentType: credit.customer.documentType,
      documentNumber: credit.customer.documentNumber,
      name: displayCustomer(credit.customer),
      phone: credit.customer.whatsapp ?? credit.customer.phone,
      creditEnabled: credit.customer.creditEnabled,
      creditLimit,
      creditDays: credit.customer.creditDays,
      outstanding: outstandingAmount,
      availableCredit: Math.max(0, creditLimit - outstandingAmount),
    };
  }

  return {
    id: credit.id,
    returnNumber: credit.returnOrder.returnNumber,
    originalAmount: Number(credit.originalAmount),
    balance: Number(credit.balance),
    customer,
  };
}
