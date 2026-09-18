import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/business-context";
import { createPosCustomer } from "@/modules/sales/pos-customer-service";
import { searchPosCustomers } from "@/modules/sales/pos-context.repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await requirePermission("sales.create");
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const items = await searchPosCustomers(q);
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const customer = await createPosCustomer(input);
    return NextResponse.json({ customer }, { status: 201 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "No se pudo registrar el cliente.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
