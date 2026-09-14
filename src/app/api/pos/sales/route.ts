import { NextResponse } from "next/server";
import { createSaleWithChangeAction } from "@/modules/sales/sale-payment-action";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const sale = await createSaleWithChangeAction(input);
    return NextResponse.json({ sale }, { status: 201 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "No se pudo completar la venta.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
