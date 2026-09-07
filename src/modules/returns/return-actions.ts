"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";

const REFUND_METHODS=new Set(["CASH","YAPE","PLIN","CARD","TRANSFER","CREDIT","OTHER"]);
function money(v:number){return Math.round((v+Number.EPSILON)*100)/100}

export async function createReturnAction(input:{saleId:string;type:"RETURN"|"EXCHANGE";reason:string;refundMethod?:string;notes?:string;items:Array<{saleItemId:string;quantity:number;productUnitId?:string}>}){
  const {company,membership}=await requirePermission("returns.manage");
  if(!input.saleId||!input.items.length) throw new Error("Selecciona la venta y al menos un producto.");
  if(!input.reason?.trim()||input.reason.trim().length<4) throw new Error("Indica el motivo de la devolución o cambio.");
  if(input.type==="RETURN"&&!REFUND_METHODS.has(input.refundMethod||"")) throw new Error("Selecciona el medio por el que se devolverá el dinero.");

  const sale=await prisma.sale.findFirst({where:{id:input.saleId,companyId:company.id,status:"COMPLETED"},include:{warehouse:{include:{branch:true}},items:{include:{product:true,units:{include:{productUnit:true}}}}}});
  if(!sale) throw new Error("La venta ya no está disponible para devolución.");
  const itemMap=new Map(sale.items.map(i=>[i.id,i]));
  const ids=input.items.map(i=>i.saleItemId);
  if(new Set(ids).size!==ids.length) throw new Error("No repitas una misma línea de venta.");

  const prior=await prisma.$queryRaw<Array<{saleItemId:string;qty:bigint}>>`
    SELECT ri."saleItemId",COALESCE(SUM(ri."quantity"),0)::bigint AS "qty"
    FROM "return_items" ri JOIN "return_orders" ro ON ro."id"=ri."returnOrderId"
    WHERE ro."companyId"=${company.id} AND ro."saleId"=${sale.id} AND ro."status"='COMPLETED'
    GROUP BY ri."saleItemId"`;
  const priorMap=new Map(prior.map(r=>[r.saleItemId,Number(r.qty)]));

  let refundAmount=0;
  const validated=input.items.map(line=>{
    const item=itemMap.get(line.saleItemId); if(!item) throw new Error("Uno de los productos no pertenece a la venta seleccionada.");
    const remaining=item.quantity-(priorMap.get(item.id)||0);
    if(!Number.isInteger(line.quantity)||line.quantity<=0||line.quantity>remaining) throw new Error(`Cantidad inválida para ${item.product.name}. Disponible para devolver: ${remaining}.`);
    const serialized=item.product.type==="PHONE"||item.product.type==="SERIALIZED";
    let unitId:string|null=null;
    if(serialized){
      if(line.quantity!==1||!line.productUnitId) throw new Error(`Selecciona el IMEI/serie exacto de ${item.product.name}.`);
      const link=item.units.find(u=>u.productUnitId===line.productUnitId);
      if(!link||link.productUnit.status!=="SOLD") throw new Error(`El IMEI de ${item.product.name} no está disponible para devolución.`);
      unitId=line.productUnitId;
    }
    const amount=money((Number(item.total)/item.quantity)*line.quantity); refundAmount=money(refundAmount+amount);
    return {item,quantity:line.quantity,unitId,amount};
  });

  const result=await prisma.$transaction(async tx=>{
    if(input.type==="RETURN"&&input.refundMethod==="CASH"){
      const session=await tx.cashSession.findFirst({where:{companyId:company.id,branchId:sale.branchId,userId:membership.userId,status:"OPEN"},orderBy:{openedAt:"desc"}});
      if(!session) throw new Error("Para devolver dinero en efectivo debes tener una caja abierta en la sucursal de la venta.");
    }
    await tx.$queryRaw<Array<{locked:number}>>`WITH l AS (SELECT pg_advisory_xact_lock(hashtext(${`${company.id}:return-order`}))) SELECT 1::int AS "locked" FROM l`;
    const seq=await tx.$queryRaw<Array<{next:number}>>`SELECT COALESCE(MAX(CAST(SPLIT_PART("returnNumber",'-',2) AS INTEGER)),0)+1 AS "next" FROM "return_orders" WHERE "companyId"=${company.id}`;
    const returnNumber=`DV001-${String(Number(seq[0]?.next||1)).padStart(6,"0")}`; const returnId=randomUUID();
    await tx.$executeRaw`INSERT INTO "return_orders" ("id","companyId","saleId","customerId","warehouseId","returnNumber","type","status","reason","refundMethod","refundAmount","notes","createdById","createdAt") VALUES (${returnId},${company.id},${sale.id},${sale.customerId},${sale.warehouseId},${returnNumber},${input.type},'COMPLETED',${input.reason.trim()},${input.type==="RETURN"?input.refundMethod||null:null},${refundAmount},${input.notes?.trim()||null},${membership.userId},NOW())`;

    for(const row of validated){
      await tx.$executeRaw`INSERT INTO "return_items" ("id","returnOrderId","saleItemId","productId","variantId","productUnitId","quantity","unitPrice","unitCost","amount","createdAt") VALUES (${randomUUID()},${returnId},${row.item.id},${row.item.productId},${row.item.variantId},${row.unitId},${row.quantity},${Number(row.item.unitPrice)},${Number(row.item.unitCost)},${row.amount},NOW())`;
      if(row.unitId){
        const updated=await tx.productUnit.updateMany({where:{id:row.unitId,companyId:company.id,status:"SOLD"},data:{status:"AVAILABLE",warehouseId:sale.warehouseId}}); if(updated.count!==1) throw new Error("El estado del IMEI cambió durante la devolución.");
        await tx.inventoryMovement.create({data:{companyId:company.id,warehouseId:sale.warehouseId,productId:row.item.productId,variantId:row.item.variantId,productUnitId:row.unitId,movementType:"RETURN_IN",quantity:1,unitCost:Number(row.item.unitCost),referenceType:"RETURN",referenceId:returnId,notes:`Reingreso por ${input.type==="EXCHANGE"?"cambio":"devolución"} ${returnNumber}`,createdById:membership.userId}});
      }else if(row.item.product.type==="ACCESSORY"){
        const balance=await tx.inventoryBalance.findUnique({where:{companyId_warehouseId_variantId:{companyId:company.id,warehouseId:sale.warehouseId,variantId:row.item.variantId}}});
        const oldQty=Number(balance?.quantity||0),oldAvg=Number(balance?.averageCost||0),newQty=oldQty+row.quantity,newAvg=newQty?money((oldQty*oldAvg+row.quantity*Number(row.item.unitCost))/newQty):Number(row.item.unitCost);
        await tx.inventoryBalance.upsert({where:{companyId_warehouseId_variantId:{companyId:company.id,warehouseId:sale.warehouseId,variantId:row.item.variantId}},update:{quantity:newQty,averageCost:newAvg},create:{companyId:company.id,warehouseId:sale.warehouseId,productId:row.item.productId,variantId:row.item.variantId,quantity:row.quantity,averageCost:Number(row.item.unitCost)}});
        await tx.inventoryMovement.create({data:{companyId:company.id,warehouseId:sale.warehouseId,productId:row.item.productId,variantId:row.item.variantId,movementType:"RETURN_IN",quantity:row.quantity,unitCost:Number(row.item.unitCost),referenceType:"RETURN",referenceId:returnId,notes:`Reingreso por ${input.type==="EXCHANGE"?"cambio":"devolución"} ${returnNumber}`,createdById:membership.userId}});
      }
    }
    if(input.type==="RETURN"&&input.refundMethod==="CASH"){
      const session=await tx.cashSession.findFirst({where:{companyId:company.id,branchId:sale.branchId,userId:membership.userId,status:"OPEN"},orderBy:{openedAt:"desc"}});
      if(session) await tx.cashMovement.create({data:{companyId:company.id,cashSessionId:session.id,type:"EXPENSE",amount:refundAmount,concept:`Devolución ${returnNumber} · Venta ${sale.saleNumber}`,reference:returnId,createdById:membership.userId}});
    }
    await tx.auditLog.create({data:{companyId:company.id,userId:membership.userId,action:"CREATE",entity:"RETURN_ORDER",entityId:returnId,newValues:{returnNumber,type:input.type,saleId:sale.id,refundAmount,refundMethod:input.refundMethod||null,reason:input.reason.trim()}}});
    return {id:returnId,returnNumber,amount:refundAmount};
  });
  ["/devoluciones","/ventas","/productos","/equipos","/kardex","/caja","/reportes"].forEach(p=>revalidatePath(p));
  return result;
}
