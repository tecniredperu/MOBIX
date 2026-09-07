"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";
import type { CreateSaleInput, SalePaymentMethod } from "./sale-types";

const PAYMENT_METHODS = new Set<SalePaymentMethod>(["CASH", "YAPE", "PLIN", "CARD", "TRANSFER", "CREDIT", "OTHER"]);
type CreditCustomerRow = { creditEnabled: boolean; creditLimit: unknown; creditDays: number; outstanding: unknown };
type NextNumberRow = { next: unknown };
function money(value:number){return Math.round((value+Number.EPSILON)*100)/100}
function cleanDocument(value?:string){return value?.replace(/\D/g,"")??""}
function validateCustomerDocument(documentType:string|undefined,documentNumber:string){if(!documentNumber)return;if(documentType==="RUC"&&documentNumber.length!==11)throw new Error("El RUC del cliente debe tener 11 dígitos.");if(documentType==="DNI"&&documentNumber.length!==8)throw new Error("El DNI del cliente debe tener 8 dígitos.")}

export async function createSaleAction(input:CreateSaleInput){
  const {company,membership,settings}=await requirePermission("sales.create");
  const TAX_RATE=Math.max(0,Number(settings.taxRate||0))/100;
  if(!input.warehouseId)throw new Error("Selecciona el almacén de venta.");
  if(!input.lines.length)throw new Error("Agrega al menos un producto a la venta.");

  const warehouse=await prisma.warehouse.findFirst({where:{id:input.warehouseId,companyId:company.id,status:"ACTIVE",isSaleable:true},include:{branch:true}});
  if(!warehouse)throw new Error("El almacén seleccionado no está habilitado para ventas.");
  if(settings.requireCashSession){const open=await prisma.cashSession.findFirst({where:{companyId:company.id,branchId:warehouse.branchId,userId:membership.userId,status:"OPEN"},select:{id:true}});if(!open)throw new Error("Debes abrir caja en esta sucursal antes de registrar una venta.")}

  const customerDocument=cleanDocument(input.customer?.documentNumber);validateCustomerDocument(input.customer?.documentType,customerDocument);
  if(input.documentType==="INVOICE"){
    if(input.customerId){const invoiceCustomer=await prisma.customer.findFirst({where:{id:input.customerId,companyId:company.id},select:{documentType:true,documentNumber:true,businessName:true}});if(!invoiceCustomer||invoiceCustomer.documentType!=="RUC"||cleanDocument(invoiceCustomer.documentNumber??"").length!==11)throw new Error("Para emitir Factura debes seleccionar un cliente con RUC válido.")}
    else if(input.customer?.documentType!=="RUC"||customerDocument.length!==11||!input.customer?.name?.trim())throw new Error("Para emitir Factura registra RUC y razón social del cliente.");
  }

  const variantIds=[...new Set(input.lines.map(line=>line.variantId))];
  const variants=await prisma.productVariant.findMany({where:{id:{in:variantIds},companyId:company.id,status:"ACTIVE"},include:{product:true}});if(variants.length!==variantIds.length)throw new Error("Uno o más productos ya no están disponibles.");const variantMap=new Map(variants.map(v=>[v.id,v]));
  const unitIds=input.lines.flatMap(line=>line.selectedUnitIds??[]);if(new Set(unitIds).size!==unitIds.length)throw new Error("Un mismo IMEI/equipo no puede agregarse dos veces.");
  const units=unitIds.length?await prisma.productUnit.findMany({where:{id:{in:unitIds},companyId:company.id},select:{id:true,variantId:true,warehouseId:true,purchaseCost:true,status:true}}):[];const unitMap=new Map(units.map(u=>[u.id,u]));if(units.length!==unitIds.length)throw new Error("Uno de los equipos seleccionados ya no existe.");

  let gross=0;
  for(const line of input.lines){const variant=variantMap.get(line.variantId);if(!variant)throw new Error("Producto inválido.");if(!Number.isInteger(line.quantity)||line.quantity<=0)throw new Error(`La cantidad de ${variant.product.name} no es válida.`);if(!Number.isFinite(line.unitPrice)||line.unitPrice<0)throw new Error(`El precio de ${variant.product.name} no es válido.`);const minimumPrice=Number(variant.minimumSalePrice);if(minimumPrice>0&&line.unitPrice<minimumPrice)throw new Error(`El precio de ${variant.product.name} no puede ser menor a S/ ${minimumPrice.toFixed(2)}.`);
    const serialized=variant.product.type==="PHONE"||variant.product.type==="SERIALIZED";if(serialized){const selected=line.selectedUnitIds??[];if(selected.length!==line.quantity)throw new Error(`Selecciona ${line.quantity} IMEI/serie para ${variant.product.name}.`);for(const id of selected){const unit=unitMap.get(id);if(!unit||unit.variantId!==variant.id||unit.warehouseId!==input.warehouseId||unit.status!=="AVAILABLE")throw new Error(`Uno de los equipos de ${variant.product.name} ya no está disponible en este almacén.`)}}gross+=line.quantity*line.unitPrice;
  }
  gross=money(gross);const discount=money(Number(input.discount||0));if(!Number.isFinite(discount)||discount<0)throw new Error("El descuento no es válido.");if(discount>gross)throw new Error("El descuento no puede superar el importe de la venta.");const total=money(gross-discount);const subtotal=input.taxCondition==="TAXED"?money(total/(1+TAX_RATE)):total;const tax=input.taxCondition==="TAXED"?money(total-subtotal):0;

  if(!input.payments.length)throw new Error("Registra al menos un medio de pago.");for(const payment of input.payments){if(!PAYMENT_METHODS.has(payment.method))throw new Error("Medio de pago no permitido.");if(!Number.isFinite(payment.amount)||payment.amount<=0)throw new Error("Todos los pagos deben ser mayores a cero.")}
  const paid=money(input.payments.reduce((sum,p)=>sum+p.amount,0));if(Math.abs(paid-total)>0.01)throw new Error(`Los pagos suman S/ ${paid.toFixed(2)} y el total de la venta es S/ ${total.toFixed(2)}.`);
  const creditAmount=money(input.payments.filter(p=>p.method==="CREDIT").reduce((sum,p)=>sum+Number(p.amount),0));if(creditAmount>0&&!input.customerId)throw new Error("Para vender a crédito debes seleccionar un cliente registrado con línea de crédito habilitada.");

  const result=await prisma.$transaction(async tx=>{
    let customerId:string|null=null;
    if(input.customerId){const existing=await tx.customer.findFirst({where:{id:input.customerId,companyId:company.id,status:"ACTIVE"}});if(!existing)throw new Error("El cliente seleccionado ya no está disponible.");customerId=existing.id}
    else if(customerDocument||input.customer?.name?.trim()){const name=input.customer?.name?.trim()||"Cliente";let customer=customerDocument?await tx.customer.findFirst({where:{companyId:company.id,documentNumber:customerDocument}}):null;const customerData={documentType:input.customer?.documentType??null,documentNumber:customerDocument||null,businessName:input.customer?.documentType==="RUC"?name:null,firstName:input.customer?.documentType==="RUC"?null:name,phone:input.customer?.phone?.trim()||null,whatsapp:input.customer?.phone?.trim()||null,email:input.customer?.email?.trim()||null};customer=customer?await tx.customer.update({where:{id:customer.id},data:customerData}):await tx.customer.create({data:{companyId:company.id,...customerData}});customerId=customer.id}

    let creditDays=30;
    if(creditAmount>0){if(!customerId)throw new Error("Selecciona un cliente para la venta a crédito.");const profile=await tx.$queryRaw<CreditCustomerRow[]>`SELECT c."creditEnabled",c."creditLimit",c."creditDays",COALESCE(SUM(ar."balance") FILTER (WHERE ar."status" IN ('OPEN','PARTIAL')),0) AS "outstanding" FROM "customers" c LEFT JOIN "accounts_receivable" ar ON ar."customerId"=c."id" AND ar."companyId"=c."companyId" WHERE c."id"=${customerId} AND c."companyId"=${company.id} GROUP BY c."id",c."creditEnabled",c."creditLimit",c."creditDays"`;const credit=profile[0];if(!credit?.creditEnabled)throw new Error("Este cliente no tiene habilitada una línea de crédito.");const available=money(Math.max(0,Number(credit.creditLimit??0)-Number(credit.outstanding??0)));if(creditAmount>available+0.01)throw new Error(`Crédito insuficiente. Disponible: S/ ${available.toFixed(2)}.`);creditDays=Math.max(0,Number(credit.creditDays??30))}

    await tx.$queryRaw<Array<{locked:number}>>`WITH l AS (SELECT pg_advisory_xact_lock(hashtext(${`${company.id}:sale-number`}))) SELECT 1::int AS "locked" FROM l`;
    const saleSeq=await tx.$queryRaw<NextNumberRow[]>`SELECT COALESCE(MAX(CASE WHEN "saleNumber" ~ '^V001-[0-9]+$' THEN CAST(SPLIT_PART("saleNumber",'-',2) AS BIGINT) END),0)+1 AS "next" FROM "sales" WHERE "companyId"=${company.id}`;
    const saleNumber=`V001-${String(Number(saleSeq[0]?.next??1)).padStart(6,"0")}`;
    const documentSeries=input.documentType==="INVOICE"?settings.invoiceSeries:input.documentType==="RECEIPT"?settings.receiptSeries:settings.salesNoteSeries;
    const documentSeq=await tx.$queryRaw<NextNumberRow[]>`SELECT COALESCE(MAX(CASE WHEN "documentNumber" ~ '^[0-9]+$' THEN CAST("documentNumber" AS BIGINT) END),0)+1 AS "next" FROM "sales" WHERE "companyId"=${company.id} AND "documentType"=${input.documentType}::"DocumentType" AND "documentSeries"=${documentSeries}`;
    const documentNumber=String(Number(documentSeq[0]?.next??1)).padStart(8,"0");
    const sale=await tx.sale.create({data:{companyId:company.id,branchId:warehouse.branchId,warehouseId:warehouse.id,customerId,saleNumber,documentType:input.documentType,documentSeries,documentNumber,taxCondition:input.taxCondition,currency:company.currency,subtotal,discount,tax,total,status:"COMPLETED",sellerId:membership.userId,createdById:membership.userId}});

    let remainingDiscount=discount;
    for(let index=0;index<input.lines.length;index+=1){const line=input.lines[index];const variant=variantMap.get(line.variantId)!;const lineGross=money(line.quantity*line.unitPrice);const allocatedDiscount=index===input.lines.length-1?remainingDiscount:money(gross>0?discount*(lineGross/gross):0);remainingDiscount=money(remainingDiscount-allocatedDiscount);const lineNet=money(lineGross-allocatedDiscount);const lineSubtotal=input.taxCondition==="TAXED"?money(lineNet/(1+TAX_RATE)):lineNet;const lineTax=input.taxCondition==="TAXED"?money(lineNet-lineSubtotal):0;const serialized=variant.product.type==="PHONE"||variant.product.type==="SERIALIZED";let unitCost=Number(variant.purchasePrice);let balanceId:string|null=null;
      if(serialized){const selectedUnits=(line.selectedUnitIds??[]).map(id=>unitMap.get(id)!);unitCost=money(selectedUnits.reduce((sum,u)=>sum+Number(u.purchaseCost),0)/selectedUnits.length)}else if(variant.product.type==="ACCESSORY"){const balance=await tx.inventoryBalance.findUnique({where:{companyId_warehouseId_variantId:{companyId:company.id,warehouseId:warehouse.id,variantId:variant.id}}});if(!balance||Number(balance.quantity)<line.quantity)throw new Error(`Stock insuficiente para ${variant.product.name}.`);balanceId=balance.id;unitCost=Number(balance.averageCost)}
      const saleItem=await tx.saleItem.create({data:{saleId:sale.id,productId:variant.productId,variantId:variant.id,quantity:line.quantity,unitPrice:line.unitPrice,unitCost,discount:allocatedDiscount,subtotal:lineSubtotal,tax:lineTax,total:lineNet}});
      if(serialized){for(const unitId of line.selectedUnitIds??[]){const unit=unitMap.get(unitId)!;const updated=await tx.productUnit.updateMany({where:{id:unitId,companyId:company.id,warehouseId:warehouse.id,variantId:variant.id,status:"AVAILABLE"},data:{status:"SOLD"}});if(updated.count!==1)throw new Error(`El equipo de ${variant.product.name} acaba de ser vendido por otro usuario.`);await tx.saleItemUnit.create({data:{saleItemId:saleItem.id,productUnitId:unitId}});await tx.inventoryMovement.create({data:{companyId:company.id,warehouseId:warehouse.id,productId:variant.productId,variantId:variant.id,productUnitId:unitId,movementType:"SALE",quantity:1,unitCost:Number(unit.purchaseCost),referenceType:"SALE",referenceId:sale.id,notes:`Salida por venta ${saleNumber}`,createdById:membership.userId}})}}
      else if(variant.product.type==="ACCESSORY"&&balanceId){const updated=await tx.inventoryBalance.updateMany({where:{id:balanceId,quantity:{gte:line.quantity}},data:{quantity:{decrement:line.quantity}}});if(updated.count!==1)throw new Error(`Stock insuficiente para ${variant.product.name}.`);await tx.inventoryMovement.create({data:{companyId:company.id,warehouseId:warehouse.id,productId:variant.productId,variantId:variant.id,movementType:"SALE",quantity:line.quantity,unitCost,referenceType:"SALE",referenceId:sale.id,notes:`Salida por venta ${saleNumber}`,createdById:membership.userId}})}
    }

    for(const payment of input.payments)await tx.salePayment.create({data:{saleId:sale.id,paymentMethod:payment.method,amount:money(payment.amount),reference:payment.reference?.trim()||null}});
    let receivableId:string|null=null;if(creditAmount>0&&customerId){receivableId=randomUUID();const dueDate=new Date(Date.now()+creditDays*86_400_000);await tx.$executeRaw`INSERT INTO "accounts_receivable" ("id","companyId","customerId","saleId","status","originalAmount","paidAmount","balance","dueDate","notes","createdAt","updatedAt") VALUES (${receivableId},${company.id},${customerId},${sale.id},'OPEN'::"AccountReceivableStatus",${creditAmount},0,${creditAmount},${dueDate},${`Crédito originado por venta ${saleNumber}`},NOW(),NOW())`}
    await tx.auditLog.create({data:{companyId:company.id,userId:membership.userId,action:"CREATE",entity:"SALE",entityId:sale.id,newValues:{saleNumber,documentType:input.documentType,documentSeries,documentNumber,taxCondition:input.taxCondition,taxRate:settings.taxRate,subtotal,tax,discount,total,creditAmount,receivableId,paymentMethods:input.payments.map(p=>p.method)}}});
    return {id:sale.id,saleNumber,documentSeries,documentNumber};
  });
  revalidatePath("/pos");revalidatePath("/ventas");revalidatePath("/clientes");if(input.customerId)revalidatePath(`/clientes/${input.customerId}`);revalidatePath("/caja");revalidatePath("/productos");revalidatePath("/equipos");revalidatePath("/kardex");revalidatePath("/reportes");return result;
}
