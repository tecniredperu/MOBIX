import { NextResponse } from "next/server";
import { requirePermission, requirePermissionWithSettings } from "@/lib/business-context";
import { getPosCashStatus } from "@/modules/cash/pos-cash-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const { settings } = await requirePermissionWithSettings("sales.create");
  const cashStatus = await getPosCashStatus();

  return NextResponse.json(
    {
      requireCashSession: settings.requireCashSession,
      open: Boolean(cashStatus),
      branchName: cashStatus?.branchName ?? null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
