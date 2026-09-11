import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

type CatalogOptionKind = "brand" | "category";

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

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return json({ error: "Tu sesión ha expirado. Vuelve a iniciar sesión." }, 401);

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
      companyId: true,
      userId: true,
      role: {
        select: {
          isSystem: true,
          permissions: {
            select: { permission: { select: { code: true } } },
          },
        },
      },
    },
  });

  if (!membership) {
    return json({ error: "Tu sesión ya no tiene acceso a esta empresa." }, 401);
  }

  const canManage =
    membership.role.isSystem ||
    membership.role.permissions.some((item) => item.permission.code === "inventory.manage");

  if (!canManage) {
    return json({ error: "No tienes permisos para administrar el catálogo." }, 403);
  }

  let input: { kind?: unknown; name?: unknown };
  try {
    input = (await request.json()) as { kind?: unknown; name?: unknown };
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const kind = input.kind;
  const name = typeof input.name === "string" ? normalizeName(input.name) : "";

  if (kind !== "brand" && kind !== "category") {
    return json({ error: "Tipo de catálogo inválido." }, 400);
  }
  if (name.length < 2 || name.length > 80) {
    return json({ error: "Ingresa un nombre entre 2 y 80 caracteres." }, 400);
  }

  const slug = slugify(name);
  if (!slug) return json({ error: "El nombre ingresado no es válido." }, 400);

  const companyId = membership.companyId;
  const userId = membership.userId;

  try {
    if (kind === "category") {
      const existing = await prisma.category.findFirst({
        where: { companyId, slug },
        select: { id: true, name: true, status: true },
      });

      if (existing?.status === "ACTIVE") {
        return json({ option: { id: existing.id, name: existing.name } });
      }

      if (existing) {
        const option = await prisma.$transaction(async (tx) => {
          const category = await tx.category.update({
            where: { id: existing.id },
            data: { name, status: "ACTIVE" },
            select: { id: true, name: true },
          });
          await tx.auditLog.create({
            data: {
              companyId,
              userId,
              action: "UPDATE",
              entity: "CATEGORY",
              entityId: category.id,
              newValues: { name: category.name, status: "ACTIVE", source: "PRODUCT_FORM" },
            },
          });
          return category;
        });
        return json({ option });
      }

      const option = await prisma.$transaction(async (tx) => {
        const category = await tx.category.create({
          data: { companyId, name, slug },
          select: { id: true, name: true },
        });
        await tx.auditLog.create({
          data: {
            companyId,
            userId,
            action: "CREATE",
            entity: "CATEGORY",
            entityId: category.id,
            newValues: { name: category.name, source: "PRODUCT_FORM" },
          },
        });
        return category;
      });
      return json({ option }, 201);
    }

    const existing = await prisma.brand.findFirst({
      where: { companyId, slug },
      select: { id: true, name: true, status: true },
    });

    if (existing?.status === "ACTIVE") {
      return json({ option: { id: existing.id, name: existing.name } });
    }

    if (existing) {
      const option = await prisma.$transaction(async (tx) => {
        const brand = await tx.brand.update({
          where: { id: existing.id },
          data: { name, status: "ACTIVE" },
          select: { id: true, name: true },
        });
        await tx.auditLog.create({
          data: {
            companyId,
            userId,
            action: "UPDATE",
            entity: "BRAND",
            entityId: brand.id,
            newValues: { name: brand.name, status: "ACTIVE", source: "PRODUCT_FORM" },
          },
        });
        return brand;
      });
      return json({ option });
    }

    const option = await prisma.$transaction(async (tx) => {
      const brand = await tx.brand.create({
        data: { companyId, name, slug },
        select: { id: true, name: true },
      });
      await tx.auditLog.create({
        data: {
          companyId,
          userId,
          action: "CREATE",
          entity: "BRAND",
          entityId: brand.id,
          newValues: { name: brand.name, source: "PRODUCT_FORM" },
        },
      });
      return brand;
    });
    return json({ option }, 201);
  } catch (error) {
    logger.error("catalog.inline_create_failed", error, {
      companyId,
      userId,
      kind: kind as CatalogOptionKind,
    });

    const prismaCode =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code)
        : null;

    if (prismaCode === "P2002") {
      return json({ error: "Ya existe un registro con ese nombre. Actualiza la página e inténtalo nuevamente." }, 409);
    }

    return json({ error: "No se pudo guardar. Inténtalo nuevamente." }, 500);
  }
}
