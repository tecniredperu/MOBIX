import { requireAuthContext } from "@/lib/auth-context";

/**
 * Empresa activa derivada de la sesión autenticada.
 * Nunca confía en un companyId enviado por el navegador.
 */
export async function getActiveCompany() {
  const { company } = await requireAuthContext();
  return {
    id: company.id,
    businessName: company.businessName,
    tradeName: company.tradeName,
    currency: company.currency,
    timezone: company.timezone,
  };
}
