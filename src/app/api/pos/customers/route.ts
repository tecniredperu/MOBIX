import { NextResponse } from "next/server";
import { createPosCustomerAction } from "@/modules/sales/pos-customer-action";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const customer = await createPosCustomerAction(input);
    return NextResponse.json({ customer }, { status: 201 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "No se pudo registrar el cliente.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
