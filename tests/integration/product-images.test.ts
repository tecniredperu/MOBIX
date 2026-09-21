import assert from "node:assert/strict";
import test from "node:test";
import { testDb, unique } from "../helpers/db";

test("producto puede guardar y recuperar una imagen sin cargarla en el catálogo", async () => {
  const company = await testDb.company.create({
    data: {
      businessName: unique("Image Company"),
      tradeName: "Image UAT",
      currency: "PEN",
      timezone: "America/Lima",
    },
  });

  const product = await testDb.product.create({
    data: {
      companyId: company.id,
      type: "ACCESSORY",
      name: "Producto con imagen",
      sku: unique("IMG"),
      controlsStock: true,
      variants: {
        create: {
          companyId: company.id,
          sku: unique("IMG-V"),
          purchasePrice: 10,
          salePrice: 20,
          minimumSalePrice: 15,
        },
      },
      image: {
        create: {
          companyId: company.id,
          mimeType: "image/webp",
          dataBase64: Buffer.from("mobix-image-test").toString("base64"),
        },
      },
    },
    include: {
      image: { select: { id: true, mimeType: true, dataBase64: true } },
    },
  });

  assert.equal(product.image?.mimeType, "image/webp");
  assert.equal(Buffer.from(product.image?.dataBase64 ?? "", "base64").toString(), "mobix-image-test");

  const compact = await testDb.product.findUniqueOrThrow({
    where: { id: product.id },
    select: {
      id: true,
      name: true,
      image: { select: { id: true } },
    },
  });

  assert.equal(compact.image?.id, product.image?.id);
});

test("product_images existe después de migraciones", async () => {
  const rows = await testDb.$queryRaw<Array<{ productImages: boolean }>>`
    SELECT to_regclass('public.product_images') IS NOT NULL AS "productImages"
  `;
  assert.equal(rows[0]?.productImages, true);
});

test.after(async () => {
  await testDb.$disconnect();
});
