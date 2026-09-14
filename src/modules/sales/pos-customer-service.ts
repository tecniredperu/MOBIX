import { requirePermission } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";
import { revalidatePaths } from "@/lib/revalidation";
import type { PosCustomer } from "./sale-types";

type CustomerDocumentType = "DNI" | "RUC" | "CE" | "OTHER";

function cleanDocument(value?: string) {
  return value?.replace(/\D/g, "") ?? "";
}

function validateDocument(type: CustomerDocumentType, number: string) {
  if (!number) return;
  if (type === "DNI" && number.length !== 8) throw new Error("El DNI debe tener 8 dígitos.");
  if (type === "RUC" && number.length !== 11) throw new Error("El RUC debe tener 11 dígitos.");
}

export async function createPosCustomer(input: {
  documentType: CustomerDocumentType;
  documentNumber?: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}): Promise<PosCustomer> {
  const { company, membership } = await requirePermission("sales.create");
  const name = input.name?.trim();
  const documentNumber = cleanDocument(input.documentNumber);

  if (!name || name.length < 2) throw new Error("Ingresa el nombre o razón social del cliente.");
  validateDocument(input.documentType, documentNumber);

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (documentNumber) {
        const duplicate = await tx.customer.findFirst({
          where: { companyId: company.id, documentNumber },
          select: { id: true },
        });
        if (duplicate) throw new Error("Ya existe un cliente con ese documento. Selecciónalo en la lista.");
      }

      const customer = await tx.customer.create({
        data: {
          companyId: company.id,
          documentType: input.documentType,
          documentNumber: documentNumber || null,
          businessName: input.documentType === "RUC" ? name : null,
          firstName: input.documentType === "RUC" ? null : name,
          phone: input.phone?.trim() || null,
          whatsapp: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          address: input.address?.trim() || null,
          creditEnabled: false,
          creditLimit: 0,
          creditDays: 30,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: company.id,
          userId: membership.userId,
          action: "CREATE",
          entity: "CUSTOMER",
          entityId: customer.id,
          newValues: {
            source: "POS",
            documentType: input.documentType,
            documentNumber: documentNumber || null,
            name,
          },
        },
      });

      return customer;
    });

    revalidatePaths(["/pos", "/clientes"]);
    return {
      id: created.id,
      documentType: created.documentType,
      documentNumber: created.documentNumber,
      name,
      phone: created.whatsapp ?? created.phone,
      creditEnabled: false,
      creditLimit: 0,
      creditDays: created.creditDays,
      outstanding: 0,
      availableCredit: 0,
    };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : null;
    if (code === "P2002") throw new Error("Ya existe un cliente con ese documento. Selecciónalo en la lista.");
    throw error;
  }
}
