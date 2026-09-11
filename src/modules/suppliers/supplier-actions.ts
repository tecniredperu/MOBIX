"use server";

import { requirePermission } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";
import { revalidatePaths } from "@/lib/revalidation";

const DOCUMENT_TYPES = new Set(["RUC", "DNI", "CE", "OTHER"] as const);
const ENTITY_STATUSES = new Set(["ACTIVE", "INACTIVE"] as const);
const SUPPLIER_PATHS = ["/proveedores", "/compras", "/compras/nueva"] as const;

type SupplierInput = {
  id?: string;
  documentType: "RUC" | "DNI" | "CE" | "OTHER";
  documentNumber: string;
  businessName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  status: "ACTIVE" | "INACTIVE";
};

function nullable(value?: string) {
  return value?.trim() || null;
}

function normalizeDocument(value: string) {
  return value.trim().toUpperCase();
}

function validateDocument(type: SupplierInput["documentType"], value: string) {
  const digits = value.replace(/\D/g, "");
  if (type === "RUC" && digits.length !== 11) throw new Error("El RUC debe tener 11 dígitos.");
  if (type === "DNI" && digits.length !== 8) throw new Error("El DNI debe tener 8 dígitos.");
  if ((type === "CE" || type === "OTHER") && value.trim().length < 3) throw new Error("Ingresa un documento válido.");
}

function validateEmail(value?: string) {
  const email = value?.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("El correo del proveedor no es válido.");
}

function refreshSuppliers() {
  revalidatePaths(SUPPLIER_PATHS);
}

export async function saveSupplierAction(input: SupplierInput) {
  const { company, membership } = await requirePermission("purchases.create");
  const businessName = input.businessName.trim();
  const documentNumber = normalizeDocument(input.documentNumber);

  if (!DOCUMENT_TYPES.has(input.documentType)) throw new Error("El tipo de documento no es válido.");
  if (!ENTITY_STATUSES.has(input.status)) throw new Error("El estado del proveedor no es válido.");
  if (businessName.length < 2) throw new Error("Ingresa la razón social o nombre del proveedor.");
  if (!documentNumber) throw new Error("Ingresa el documento del proveedor.");
  validateDocument(input.documentType, documentNumber);
  validateEmail(input.email);

  if (input.id) {
    const current = await prisma.supplier.findFirst({
      where: { id: input.id, companyId: company.id },
      select: { id: true },
    });
    if (!current) throw new Error("El proveedor no existe o no pertenece a la empresa activa.");
  }

  const duplicate = await prisma.supplier.findFirst({
    where: {
      companyId: company.id,
      documentNumber,
      id: input.id ? { not: input.id } : undefined,
    },
    select: { id: true },
  });
  if (duplicate) throw new Error("Ya existe un proveedor con ese documento.");

  const data = {
    documentType: input.documentType,
    documentNumber,
    businessName,
    contactName: nullable(input.contactName),
    phone: nullable(input.phone),
    email: nullable(input.email)?.toLowerCase() ?? null,
    address: nullable(input.address),
    status: input.status,
  };

  const saved = await prisma.$transaction(async (tx) => {
    const supplier = input.id
      ? await tx.supplier.update({ where: { id: input.id }, data })
      : await tx.supplier.create({ data: { companyId: company.id, ...data } });

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: input.id ? "UPDATE" : "CREATE",
        entity: "SUPPLIER",
        entityId: supplier.id,
        newValues: {
          businessName: supplier.businessName,
          documentType: supplier.documentType,
          documentNumber: supplier.documentNumber,
          status: supplier.status,
        },
      },
    });
    return supplier;
  });

  refreshSuppliers();
  return { id: saved.id };
}
