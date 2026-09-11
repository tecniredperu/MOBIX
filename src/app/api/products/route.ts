import { z } from "zod";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    const text = typeof value === "string" ? value.trim() : "";
    return text === "" ? null : text;
  });

const variantSchema = z
  .object({
    sku: optionalText,
    barcode: optionalText,
    color: optionalText,
    ram: optionalText,
    storage: optionalText,
    purchasePrice: z.coerce.number().min(0, "El costo no puede ser negativo."),
    salePrice: z.coerce.number().min(0, "El precio no puede ser negativo."),
    minimumSalePrice: z.coerce.number().min(0, "El precio mínimo no puede ser negativo."),
  })
  .superRefine((variant, ctx) => {
    if (variant.minimumSalePrice > variant.salePrice && variant.salePrice > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["minimumSalePrice"],
        message: "El precio mínimo no puede superar el precio de venta.",
      });
    }
  });

const productSchema = z.object({
  type: z.enum(["PHONE", "SERIALIZED", "ACCESSORY", "SERVICE"]),
  categoryId: optionalText,
  brandId: optionalText,
  name: z.string().trim().min(2, "Ingresa un nombre de producto válido."),
  model: optionalText,
  sku: optionalText,
  barcode: optionalText,
  description: optionalText,
  warrantyDays: z.coerce.number().int().min(0).max(3650),
  minimumStock: z.coerce.number().int().min(0).max(1_000_000),
  variants: z.array(variantSchema).min(1, "Agrega al menos una variante."),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: noStoreHeaders });
}

function getProductRules(type: "PHONE" | "SERIALIZED" | "ACCESSORY" | "SERVICE") {
  switch (type) {
    case "PHONE":
      return { controlsStock: true, requiresSerial: true, requiresImei: true };
    case "SERIALIZED":
      return { controlsStock: true, requiresSerial: true, requiresImei: false };
    case "ACCESSORY":
      return { controlsStock: true, requiresSerial: false, requiresImei: false };
    case "SERVICE":
      return { controlsStock: false, requiresSerial: false, requiresImei: false };
  }
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
    return json({ error: "No tienes permisos para administrar productos." }, 403);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    const flattened = z.flattenError(parsed.error);
    return json(
      {
        error: "Revisa los datos marcados antes de guardar el producto.",
        fieldErrors: flattened.fieldErrors,
      },
      400,
    );
  }

  const companyId = membership.companyId;
  const userId = membership.userId;
  const data = parsed.data;
  const rules = getProductRules(data.type);

  if (data.categoryId) {
    const categoryExists = await prisma.category.count({
      where: { id: data.categoryId, companyId, status: "ACTIVE" },
    });
    if (!categoryExists) {
      return json({ error: "La categoría seleccionada ya no está disponible." }, 409);
    }
  }

  if (data.brandId) {
    const brandExists = await prisma.brand.count({
      where: { id: data.brandId, companyId, status: "ACTIVE" },
    });
    if (!brandExists) {
      return json({ error: "La marca seleccionada ya no está disponible." }, 409);
    }
  }

  try {
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          companyId,
          categoryId: data.categoryId,
          brandId: data.brandId,
          type: data.type,
          name: data.name,
          model: data.model,
          description: data.description,
          sku: data.sku,
          barcode: data.barcode,
          controlsStock: rules.controlsStock,
          requiresSerial: rules.requiresSerial,
          requiresImei: rules.requiresImei,
          warrantyDays: data.warrantyDays,
          minimumStock: rules.controlsStock ? data.minimumStock : 0,
          variants: {
            create: data.variants.map((variant) => ({
              companyId,
              sku: variant.sku,
              barcode: variant.barcode,
              color: variant.color,
              ram: variant.ram,
              storage: variant.storage,
              purchasePrice: variant.purchasePrice,
              salePrice: variant.salePrice,
              minimumSalePrice: variant.minimumSalePrice,
            })),
          },
        },
        select: { id: true, name: true },
      });

      await tx.auditLog.create({
        data: {
          companyId,
          userId,
          action: "CREATE",
          entity: "PRODUCT",
          entityId: created.id,
          newValues: {
            name: data.name,
            type: data.type,
            sku: data.sku,
            variantCount: data.variants.length,
          },
        },
      });

      return created;
    });

    return json({ product }, 201);
  } catch (error) {
    logger.error("products.create_failed", error, { companyId, userId, type: data.type });

    const prismaCode =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code)
        : null;

    if (prismaCode === "P2002") {
      return json(
        {
          error:
            "Ya existe un producto o variante con el mismo SKU o código de barras. Usa un código diferente.",
        },
        409,
      );
    }

    return json({ error: "No se pudo guardar el producto. Inténtalo nuevamente." }, 500);
  }
}
