"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/business-context";

const optionalText = z.string().trim().transform((value) => (value === "" ? null : value));

const variantSchema = z.object({
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
    ctx.addIssue({ code: "custom", path: ["minimumSalePrice"], message: "El precio mínimo no puede superar el precio de venta." });
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

export type ProductActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialProductActionState: ProductActionState = { status: "idle" };

function readVariants(formData: FormData) {
  const raw = formData.get("variants");
  if (typeof raw !== "string") return [];
  try { return JSON.parse(raw) as unknown; } catch { return []; }
}

function getProductRules(type: "PHONE" | "SERIALIZED" | "ACCESSORY" | "SERVICE") {
  switch (type) {
    case "PHONE": return { controlsStock: true, requiresSerial: true, requiresImei: true };
    case "SERIALIZED": return { controlsStock: true, requiresSerial: true, requiresImei: false };
    case "ACCESSORY": return { controlsStock: true, requiresSerial: false, requiresImei: false };
    case "SERVICE": return { controlsStock: false, requiresSerial: false, requiresImei: false };
  }
}

export async function createProductAction(
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const parsed = productSchema.safeParse({
    type: formData.get("type"),
    categoryId: formData.get("categoryId") ?? "",
    brandId: formData.get("brandId") ?? "",
    name: formData.get("name"),
    model: formData.get("model") ?? "",
    sku: formData.get("sku") ?? "",
    barcode: formData.get("barcode") ?? "",
    description: formData.get("description") ?? "",
    warrantyDays: formData.get("warrantyDays") ?? "0",
    minimumStock: formData.get("minimumStock") ?? "0",
    variants: readVariants(formData),
  });

  if (!parsed.success) {
    const flattened = z.flattenError(parsed.error);
    return {
      status: "error",
      message: "Revisa los datos marcados antes de guardar el producto.",
      fieldErrors: flattened.fieldErrors as Record<string, string[]>,
    };
  }

  const { company, membership } = await requirePermission("inventory.manage");
  const data = parsed.data;
  const rules = getProductRules(data.type);

  if (data.categoryId) {
    const categoryExists = await prisma.category.count({ where: { id: data.categoryId, companyId: company.id, status: "ACTIVE" } });
    if (!categoryExists) return { status: "error", message: "La categoría seleccionada ya no está disponible." };
  }

  if (data.brandId) {
    const brandExists = await prisma.brand.count({ where: { id: data.brandId, companyId: company.id, status: "ACTIVE" } });
    if (!brandExists) return { status: "error", message: "La marca seleccionada ya no está disponible." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          companyId: company.id,
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
              companyId: company.id,
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
      });

      await tx.auditLog.create({
        data: {
          companyId: company.id,
          userId: membership.userId,
          action: "CREATE",
          entity: "PRODUCT",
          entityId: product.id,
          newValues: { name: data.name, type: data.type, sku: data.sku, variantCount: data.variants.length },
        },
      });
    });
  } catch (error) {
    const prismaCode = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : null;
    if (prismaCode === "P2002") {
      return { status: "error", message: "Ya existe un producto o variante con el mismo SKU o código de barras. Usa un código diferente." };
    }
    console.error("Error creating MOBIX product", error);
    return { status: "error", message: "No se pudo guardar el producto. Revisa la conexión con PostgreSQL e inténtalo nuevamente." };
  }

  revalidatePath("/productos");
  redirect("/productos?created=1");
}
