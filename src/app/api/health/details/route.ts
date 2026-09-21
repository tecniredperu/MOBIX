import { getAuthContext } from "@/lib/auth-context";
import { getDetailedHealth } from "@/lib/health-details";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  const auth = await getAuthContext({ redirectToLogin: false });
  if (!auth) {
    return Response.json(
      { error: "No autenticado." },
      { status: 401, headers: noStoreHeaders },
    );
  }
  if (!auth.role.isSystem && !auth.permissions.has("settings.manage")) {
    return Response.json(
      { error: "No tienes permisos para consultar el diagnóstico interno." },
      { status: 403, headers: noStoreHeaders },
    );
  }

  const result = await getDetailedHealth();
  return Response.json(result.body, {
    status: result.httpStatus,
    headers: noStoreHeaders,
  });
}
