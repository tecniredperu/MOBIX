import { z } from "zod";
import { getAuthContext } from "@/lib/auth-context";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: noStoreHeaders });
}

const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    const text = typeof value === "string" ? value.trim() : "";
    return text === "" ? null : text;
  });

const imageDataSchema = z.preprocess(
  (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    return text === "" ? null : text;
  },
  z
    .string()
    .max(1_100_000, "La imagen es demasiado grande. Usa una imagen más liviana.")
    .regex(/^[A-Za-z0-9+/=]+$/, "La imagen enviada no es válida.")
    .nullable(),
);

const imageMimeSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
  z.enum(["image/jpeg", "image/png", "image/webp"]).nullable(),
);

const editVariantSchema = z.object({
  id: optionalText,
  sku: optionalText,
  barcode: optionalText,
  color: optionalText,
  ram: optionalText,
  storage: optionalText,
  purchasePrice: z.coerce.number().min(0, "El costo no puede ser negativo."),
  salePrice: z.coerce.number().min(0, "El precio no puede ser negativo."),
  minimumSalePrice: z.coerce.number().min(0, "El precio mínimo no puede ser negativo."),
}).superRefine((variant, ctx) => {
  if (variant.minimumSalePrice > variant.salePrice && variant.salePrice > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["minimumSalePrice"],
      message: "El precio mínimo no puede superar el precio de venta.",
    });
  }
});

const updateSchema = z.object({
  action: z.literal("update"),
  categoryId: optionalText,
  brandId: optionalText,
  name: z.string().trim().min(2, "Ingresa un nombre de producto válido."),
  model: optionalText,
  sku: optionalText,
  barcode: optionalText,
  description: optionalText,
  warrantyDays: z.coerce.number().int().min(0).max(3650),
  minimumStock: z.coerce.number().int().min(0).max(1_000_000),
  imageData: imageDataSchema.optional(),
  imageMimeType: imageMimeSchema.optional(),
  removeImage: z.boolean().optional().default(false),
  variants: z.array(editVariantSchema).min(1, "El producto debe conservar al menos una variante."),
}).superRefine((value, ctx) => {
  if (value.imageData && !value.imageMimeType) {
    ctx.addIssue({
      code: "custom",
      path: ["imageMimeType"],
      message: "No se pudo identificar el formato de la imagen.",
    });
  }
});

const statusSchema = z.object({
  action: z.literal("status"),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

async function requireProductManager() {
  const auth = await getAuthContext({ redirectToLogin: false });
  if (!auth) return { error: json({ error: "Tu sesión ha expirado. Vuelve a iniciar sesión." }, 401) } as const;
  const canManage = auth.role.isSystem || auth.permissions.has("inventory.manage");
  if (!canManage) return { error: json({ error: "No tienes permisos para administrar productos." }, 403) } as const;
  return { auth } as const;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireProductManager();
  if ("error" in access) return access.error;

  const { id } = await context.params;
  const companyId = access.auth.company.id;
  const userId = access.auth.user.id;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const current = await prisma.product.findFirst({
    where: { id, companyId, deletedAt: null },
    include: {
      image: { select: { id: true } },
      variants: { select: { id: true, status: true } },
    },
  });
  if (!current) return json({ error: "El producto ya no existe." }, 404);

  if (typeof input === "object" && input && "action" in input && (input as { action?: unknown }).action === "status") {
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) return json({ error: "El estado solicitado no es válido." }, 400);

    if (current.status === parsed.data.status) {
      return json({ product: { id: current.id, status: current.status } });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id: current.id },
        data: { status: parsed.data.status },
        select: { id: true, name: true, status: true },
      });

      await tx.auditLog.create({
        data: {
          companyId,
          userId,
          action: parsed.data.status === "ACTIVE" ? "ACTIVATE" : "DEACTIVATE",
          entity: "PRODUCT",
          entityId: product.id,
          oldValues: { status: current.status },
          newValues: { status: product.status },
        },
      });

      return product;
    });

    return json({ product: updated });
  }

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    const flattened = z.flattenError(parsed.error);
    return json({
      error: "Revisa los datos marcados antes de guardar los cambios.",
      fieldErrors: flattened.fieldErrors,
    }, 400);
  }

  const data = parsed.data;

  if (data.categoryId) {
    const exists = await prisma.category.count({
      where: { id: data.categoryId, companyId, status: "ACTIVE" },
    });
    if (!exists) return json({ error: "La categoría seleccionada ya no está disponible." }, 409);
  }

  if (data.brandId) {
    const exists = await prisma.brand.count({
      where: { id: data.brandId, companyId, status: "ACTIVE" },
    });
    if (!exists) return json({ error: "La marca seleccionada ya no está disponible." }, 409);
  }

  const existingVariantIds = new Set(current.variants.map((variant) => variant.id));
  for (const variant of data.variants) {
    if (variant.id && !existingVariantIds.has(variant.id)) {
      return json({ error: "Una de las variantes ya no pertenece a este producto." }, 409);
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id: current.id },
        data: {
          categoryId: data.categoryId,
          brandId: data.brandId,
          name: data.name,
          model: data.model,
          sku: data.sku,
          barcode: data.barcode,
          description: data.description,
          warrantyDays: data.warrantyDays,
          minimumStock: current.controlsStock ? data.minimumStock : 0,
        },
        select: { id: true, name: true, status: true },
      });

      if (data.removeImage) {
        await tx.productImage.deleteMany({ where: { productId: current.id, companyId } });
      } else if (data.imageData && data.imageMimeType) {
        await tx.productImage.upsert({
          where: { productId: current.id },
          update: {
            mimeType: data.imageMimeType,
            dataBase64: data.imageData,
          },
          create: {
            companyId,
            productId: current.id,
            mimeType: data.imageMimeType,
            dataBase64: data.imageData,
          },
        });
      }

      for (const variant of data.variants) {
        const variantData = {
          sku: variant.sku,
          barcode: variant.barcode,
          color: variant.color,
          ram: variant.ram,
          storage: variant.storage,
          purchasePrice: variant.purchasePrice,
          salePrice: variant.salePrice,
          minimumSalePrice: variant.minimumSalePrice,
        };

        if (variant.id) {
          await tx.productVariant.update({
            where: { id: variant.id },
            data: variantData,
          });
        } else {
          await tx.productVariant.create({
            data: {
              companyId,
              productId: current.id,
              ...variantData,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          companyId,
          userId,
          action: "UPDATE",
          entity: "PRODUCT",
          entityId: product.id,
          oldValues: {
            name: current.name,
            categoryId: current.categoryId,
            brandId: current.brandId,
            sku: current.sku,
            barcode: current.barcode,
            warrantyDays: current.warrantyDays,
            minimumStock: current.minimumStock,
          },
          newValues: {
            name: data.name,
            categoryId: data.categoryId,
            brandId: data.brandId,
            sku: data.sku,
            barcode: data.barcode,
            warrantyDays: data.warrantyDays,
            minimumStock: current.controlsStock ? data.minimumStock : 0,
            variantCount: data.variants.length,
            imageChanged: Boolean(data.imageData || data.removeImage),
          },
        },
      });

      return product;
    });

    return json({ product: updated });
  } catch (error) {
    logger.error("products.update_failed", error, { companyId, userId, productId: current.id });
    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : null;
    if (code === "P2002") {
      return json({ error: "Ya existe otro producto o variante con el mismo SKU o código de barras." }, 409);
    }
    return json({ error: "No se pudo actualizar el producto. Inténtalo nuevamente." }, 500);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireProductManager();
  if ("error" in access) return access.error;

  const { id } = await context.params;
  const companyId = access.auth.company.id;
  const userId = access.auth.user.id;

  const product = await prisma.product.findFirst({
    where: { id, companyId, deletedAt: null },
    include: {
      _count: {
        select: {
          units: true,
          purchaseItems: true,
          saleItems: true,
          inventoryMovements: true,
          returnItems: true,
          stockTransferItems: true,
        },
      },
    },
  });

  if (!product) return json({ error: "El producto ya no existe." }, 404);

  const balanceRows = product.controlsStock
    ? await prisma.inventoryBalance.count({
        where: { companyId, productId: product.id, quantity: { not: 0 } },
      })
    : 0;

  const hasHistory =
    product._count.units > 0 ||
    product._count.purchaseItems > 0 ||
    product._count.saleItems > 0 ||
    product._count.inventoryMovements > 0 ||
    product._count.returnItems > 0 ||
    product._count.stockTransferItems > 0 ||
    balanceRows > 0;

  if (hasHistory) {
    return json({
      error: "Este producto tiene historial de inventario o ventas. No puede eliminarse; desactívalo para conservar la trazabilidad.",
      code: "PRODUCT_HAS_HISTORY",
    }, 409);
  }

  await prisma.$transaction(async (tx) => {
    await tx.productVariant.updateMany({
      where: { productId: product.id, companyId },
      data: { status: "INACTIVE" },
    });
    await tx.product.update({
      where: { id: product.id },
      data: { status: "INACTIVE", deletedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        companyId,
        userId,
        action: "UPDATE",
        entity: "PRODUCT",
        entityId: product.id,
        oldValues: { status: product.status, deletedAt: product.deletedAt },
        newValues: { status: "INACTIVE", deletedAt: new Date().toISOString(), softDeleted: true },
      },
    });
  });

  return json({ deleted: true, productId: product.id });
}
