import { prisma } from "@/lib/prisma";

/**
 * Contexto temporal de empresa para MOBIX Core.
 * En la etapa de autenticación este selector se reemplazará por la empresa
 * activa de la sesión, evitando confiar en companyId enviado por el navegador.
 */
export async function getActiveCompany() {
  const company = await prisma.company.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      businessName: true,
      tradeName: true,
      currency: true,
    },
  });

  if (!company) {
    throw new Error(
      "MOBIX aún no tiene una empresa configurada. Ejecuta `npm run db:seed`.",
    );
  }

  return company;
}
