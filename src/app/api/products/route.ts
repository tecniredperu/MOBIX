import { z } from "zod";
import { getAuthContext } from "@/lib/auth-context";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

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
  imageData: imageDataSchema,
  imageMimeType: imageMimeSchema,
  warrantyDays: z.coerce.number().int().min(0).max(3650),
  minimumStock: z.coerce.number().int().min(0).max(1_000_000),
  variants: z.array(variantSchema).min(1, "Agrega al menos una variante."),
}).superRefine((value, ctx) => {
  if (value.imageData && !value.imageMimeType) {
    ctx.addIssue({ code: "custom", path: ["imageMimeType"], message: "No se pudo identificar el formato de la imagen." });
  }
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
  const auth = await getAuthContext({ redirectToLogin: false });
  if (!auth) return json({ error: "Tu sesión ha expirado o fue revocada. Vuelve a iniciar sesión." }, 401);

  const canManage = auth.role.isSystem || auth.permissions.has("inventory.manage");
  if (!canManage) {
    return json({ error: "No tienes permisos para administrar productos." }, 403);
  }

  const membership = {
    companyId: auth.company.id,
    userId: auth.user.id,
  };

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
          ...(data.imageData && data.imageMimeType
            ? {
                image: {
                  create: {
                    companyId,
                    mimeType: data.imageMimeType,
                    dataBase64: data.imageData,
                  },
                },
              }
            : {}),
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
            hasImage: Boolean(data.imageData),
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
