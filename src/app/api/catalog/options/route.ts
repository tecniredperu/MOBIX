import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

type CatalogOptionKind = "brand" | "category";
type CatalogStatus = "ACTIVE" | "INACTIVE";

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

async function getAuthorizedMembership() {
  const session = await readSession();
  if (!session) return null;

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

  if (!membership) return null;

  const canManage =
    membership.role.isSystem ||
    membership.role.permissions.some((item) => item.permission.code === "inventory.manage");

  return { membership, canManage };
}

function validateKind(value: unknown): value is CatalogOptionKind {
  return value === "brand" || value === "category";
}

function validateStatus(value: unknown): value is CatalogStatus {
  return value === "ACTIVE" || value === "INACTIVE";
}

export async function POST(request: Request) {
  const auth = await getAuthorizedMembership();
  if (!auth) return json({ error: "Tu sesión ha expirado. Vuelve a iniciar sesión." }, 401);
  if (!auth.canManage) return json({ error: "No tienes permisos para administrar el catálogo." }, 403);

  let input: { kind?: unknown; name?: unknown };
  try {
    input = (await request.json()) as { kind?: unknown; name?: unknown };
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const kind = input.kind;
  const name = typeof input.name === "string" ? normalizeName(input.name) : "";

  if (!validateKind(kind)) return json({ error: "Tipo de catálogo inválido." }, 400);
  if (name.length < 2 || name.length > 80) {
    return json({ error: "Ingresa un nombre entre 2 y 80 caracteres." }, 400);
  }

  const slug = slugify(name);
  if (!slug) return json({ error: "El nombre ingresado no es válido." }, 400);

  const companyId = auth.membership.companyId;
  const userId = auth.membership.userId;

  try {
    if (kind === "category") {
      const existing = await prisma.category.findFirst({
        where: { companyId, slug },
        select: { id: true, name: true, status: true },
      });

      if (existing?.status === "ACTIVE") {
        return json({ option: { id: existing.id, name: existing.name, status: existing.status } });
      }

      if (existing) {
        const option = await prisma.$transaction(async (tx) => {
          const category = await tx.category.update({
            where: { id: existing.id },
            data: { name, status: "ACTIVE" },
            select: { id: true, name: true, status: true },
          });
          await tx.auditLog.create({
            data: {
              companyId,
              userId,
              action: "ACTIVATE",
              entity: "CATEGORY",
              entityId: category.id,
              newValues: { name: category.name, status: "ACTIVE", source: "CATALOG_MANAGER" },
            },
          });
          return category;
        });
        return json({ option });
      }

      const option = await prisma.$transaction(async (tx) => {
        const category = await tx.category.create({
          data: { companyId, name, slug },
          select: { id: true, name: true, status: true },
        });
        await tx.auditLog.create({
          data: {
            companyId,
            userId,
            action: "CREATE",
            entity: "CATEGORY",
            entityId: category.id,
            newValues: { name: category.name, source: "CATALOG_MANAGER" },
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
      return json({ option: { id: existing.id, name: existing.name, status: existing.status } });
    }

    if (existing) {
      const option = await prisma.$transaction(async (tx) => {
        const brand = await tx.brand.update({
          where: { id: existing.id },
          data: { name, status: "ACTIVE" },
          select: { id: true, name: true, status: true },
        });
        await tx.auditLog.create({
          data: {
            companyId,
            userId,
            action: "ACTIVATE",
            entity: "BRAND",
            entityId: brand.id,
            newValues: { name: brand.name, status: "ACTIVE", source: "CATALOG_MANAGER" },
          },
        });
        return brand;
      });
      return json({ option });
    }

    const option = await prisma.$transaction(async (tx) => {
      const brand = await tx.brand.create({
        data: { companyId, name, slug },
        select: { id: true, name: true, status: true },
      });
      await tx.auditLog.create({
        data: {
          companyId,
          userId,
          action: "CREATE",
          entity: "BRAND",
          entityId: brand.id,
          newValues: { name: brand.name, source: "CATALOG_MANAGER" },
        },
      });
      return brand;
    });
    return json({ option }, 201);
  } catch (error) {
    logger.error("catalog.create_failed", error, { companyId, userId, kind });
    const prismaCode =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code)
        : null;
    if (prismaCode === "P2002") {
      return json({ error: "Ya existe un registro con ese nombre." }, 409);
    }
    return json({ error: "No se pudo guardar. Inténtalo nuevamente." }, 500);
  }
}

export async function PATCH(request: Request) {
  const auth = await getAuthorizedMembership();
  if (!auth) return json({ error: "Tu sesión ha expirado. Vuelve a iniciar sesión." }, 401);
  if (!auth.canManage) return json({ error: "No tienes permisos para administrar el catálogo." }, 403);

  let input: { kind?: unknown; id?: unknown; name?: unknown; status?: unknown };
  try {
    input = (await request.json()) as { kind?: unknown; id?: unknown; name?: unknown; status?: unknown };
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  if (!validateKind(input.kind)) return json({ error: "Tipo de catálogo inválido." }, 400);
  if (typeof input.id !== "string" || !input.id.trim()) return json({ error: "Registro inválido." }, 400);

  const hasName = typeof input.name === "string";
  const hasStatus = validateStatus(input.status);
  if (!hasName && !hasStatus) return json({ error: "No hay cambios para guardar." }, 400);

  const name = hasName ? normalizeName(input.name as string) : null;
  if (name !== null && (name.length < 2 || name.length > 80)) {
    return json({ error: "Ingresa un nombre entre 2 y 80 caracteres." }, 400);
  }
  const slug = name ? slugify(name) : null;
  if (name && !slug) return json({ error: "El nombre ingresado no es válido." }, 400);

  const companyId = auth.membership.companyId;
  const userId = auth.membership.userId;
  const kind = input.kind;
  const id = input.id;
  const nextStatus = hasStatus ? (input.status as CatalogStatus) : undefined;

  try {
    if (kind === "category") {
      const current = await prisma.category.findFirst({
        where: { id, companyId },
        select: { id: true, name: true, slug: true, status: true },
      });
      if (!current) return json({ error: "La categoría ya no existe." }, 404);

      if (slug && slug !== current.slug) {
        const duplicate = await prisma.category.findFirst({ where: { companyId, slug, NOT: { id } }, select: { id: true } });
        if (duplicate) return json({ error: "Ya existe una categoría con ese nombre." }, 409);
      }

      const action = nextStatus && nextStatus !== current.status
        ? nextStatus === "ACTIVE" ? "ACTIVATE" : "DEACTIVATE"
        : "UPDATE";

      const option = await prisma.$transaction(async (tx) => {
        const category = await tx.category.update({
          where: { id },
          data: {
            ...(name !== null ? { name, slug: slug ?? current.slug } : {}),
            ...(nextStatus ? { status: nextStatus } : {}),
          },
          select: { id: true, name: true, status: true },
        });
        await tx.auditLog.create({
          data: {
            companyId,
            userId,
            action,
            entity: "CATEGORY",
            entityId: category.id,
            oldValues: { name: current.name, status: current.status },
            newValues: { name: category.name, status: category.status, source: "CATALOG_MANAGER" },
          },
        });
        return category;
      });
      return json({ option });
    }

    const current = await prisma.brand.findFirst({
      where: { id, companyId },
      select: { id: true, name: true, slug: true, status: true },
    });
    if (!current) return json({ error: "La marca ya no existe." }, 404);

    if (slug && slug !== current.slug) {
      const duplicate = await prisma.brand.findFirst({ where: { companyId, slug, NOT: { id } }, select: { id: true } });
      if (duplicate) return json({ error: "Ya existe una marca con ese nombre." }, 409);
    }

    const action = nextStatus && nextStatus !== current.status
      ? nextStatus === "ACTIVE" ? "ACTIVATE" : "DEACTIVATE"
      : "UPDATE";

    const option = await prisma.$transaction(async (tx) => {
      const brand = await tx.brand.update({
        where: { id },
        data: {
          ...(name !== null ? { name, slug: slug ?? current.slug } : {}),
          ...(nextStatus ? { status: nextStatus } : {}),
        },
        select: { id: true, name: true, status: true },
      });
      await tx.auditLog.create({
        data: {
          companyId,
          userId,
          action,
          entity: "BRAND",
          entityId: brand.id,
          oldValues: { name: current.name, status: current.status },
          newValues: { name: brand.name, status: brand.status, source: "CATALOG_MANAGER" },
        },
      });
      return brand;
    });
    return json({ option });
  } catch (error) {
    logger.error("catalog.update_failed", error, { companyId, userId, kind, id });
    const prismaCode =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code)
        : null;
    if (prismaCode === "P2002") return json({ error: "Ya existe un registro con ese nombre." }, 409);
    return json({ error: "No se pudieron guardar los cambios." }, 500);
  }
}
