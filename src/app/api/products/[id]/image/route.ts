import { getAuthContext } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext({ redirectToLogin: false });
  if (!auth) {
    return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const { id } = await context.params;
  const image = await prisma.productImage.findFirst({
    where: {
      productId: id,
      companyId: auth.company.id,
      product: { deletedAt: null },
    },
    select: {
      mimeType: true,
      dataBase64: true,
      updatedAt: true,
    },
  });

  if (!image) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "private, max-age=60" } });
  }

  const bytes = Uint8Array.from(Buffer.from(image.dataBase64, "base64"));
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
      "Last-Modified": image.updatedAt.toUTCString(),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
