"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/business-context";

export type CatalogOptionKind = "brand" | "category";

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createCatalogOptionAction(kind: CatalogOptionKind, rawName: string) {
  const name = normalizeName(rawName);
  if (name.length < 2 || name.length > 80) {
    throw new Error("Ingresa un nombre entre 2 y 80 caracteres.");
  }

  const slug = slugify(name);
  if (!slug) throw new Error("El nombre ingresado no es válido.");

  const { company, membership } = await requirePermission("inventory.manage");

  if (kind === "category") {
    const existing = await prisma.category.findFirst({
      where: { companyId: company.id, slug },
      select: { id: true, name: true, status: true },
    });

    if (existing) {
      if (existing.status === "INACTIVE") {
        return prisma.$transaction(async (tx) => {
          const category = await tx.category.update({
            where: { id: existing.id },
            data: { name, status: "ACTIVE" },
            select: { id: true, name: true },
          });
          await tx.auditLog.create({
            data: {
              companyId: company.id,
              userId: membership.userId,
              action: "UPDATE",
              entity: "CATEGORY",
              entityId: category.id,
              newValues: { name: category.name, status: "ACTIVE", source: "PRODUCT_FORM" },
            },
          });
          return category;
        });
      }
      return { id: existing.id, name: existing.name };
    }

    return prisma.$transaction(async (tx) => {
      const category = await tx.category.create({
        data: { companyId: company.id, name, slug },
        select: { id: true, name: true },
      });
      await tx.auditLog.create({
        data: {
          companyId: company.id,
          userId: membership.userId,
          action: "CREATE",
          entity: "CATEGORY",
          entityId: category.id,
          newValues: { name: category.name, source: "PRODUCT_FORM" },
        },
      });
      return category;
    });
  }

  const existing = await prisma.brand.findFirst({
    where: { companyId: company.id, slug },
    select: { id: true, name: true, status: true },
  });

  if (existing) {
    if (existing.status === "INACTIVE") {
      return prisma.$transaction(async (tx) => {
        const brand = await tx.brand.update({
          where: { id: existing.id },
          data: { name, status: "ACTIVE" },
          select: { id: true, name: true },
        });
        await tx.auditLog.create({
          data: {
            companyId: company.id,
            userId: membership.userId,
            action: "UPDATE",
            entity: "BRAND",
            entityId: brand.id,
            newValues: { name: brand.name, status: "ACTIVE", source: "PRODUCT_FORM" },
          },
        });
        return brand;
      });
    }
    return { id: existing.id, name: existing.name };
  }

  return prisma.$transaction(async (tx) => {
    const brand = await tx.brand.create({
      data: { companyId: company.id, name, slug },
      select: { id: true, name: true },
    });
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: membership.userId,
        action: "CREATE",
        entity: "BRAND",
        entityId: brand.id,
        newValues: { name: brand.name, source: "PRODUCT_FORM" },
      },
    });
    return brand;
  });
}
