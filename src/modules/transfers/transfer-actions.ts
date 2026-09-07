"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";

function money(v:number){return Math.round((v+Number.EPSILON)*100)/100}

type TransferHeader={id:string;transferNumber:string;fromWarehouseId:string;toWarehouseId:string;status:string};
type TransferItemRow={id:string;productId:string;variantId:string;productUnitId:string|null;quantity:number;unitCost:unknown};

export async function createTransferAction(input:{fromWarehouseId:string;toWarehouseId:string;notes?:string;lines:Array<{variantId:string;quantity:number;unitIds?:string[]}>}){
 const {company,membership}=await requirePermission("inventory.transfer");
 if(!input.fromWarehouseId||!input.toWarehouseId||input.fromWarehouseId===input.toWarehouseId) throw new Error("Selecciona almacenes de origen y destino diferentes.");
 const warehouses=await prisma.warehouse.findMany({where:{companyId:company.id,id:{in:[input.fromWarehouseId,input.toWarehouseId]},status:"ACTIVE"}});
 if(warehouses.length!==2) throw new Error("Uno de los almacenes ya no está disponible.");
 if(!input.lines.length) throw new Error("Agrega al menos un producto a la transferencia.");
 const variantIds=[...new Set(input.lines.map(l=>l.variantId))];
 const variants=await prisma.productVariant.findMany({where:{companyId:company.id,id:{in:variantIds},status:"ACTIVE"},include:{product:true}});
 if(variants.length!==variantIds.length) throw new Error("Uno de los productos ya no está disponible.");
 const variantMap=new Map(variants.map(v=>[v.id,v]));

 const result=await prisma.$transaction(async tx=>{
   await tx.$queryRaw<Array<{locked:number}>>`WITH l AS (SELECT pg_advisory_xact_lock(hashtext(${`${company.id}:stock-transfer`}))) SELECT 1::int AS "locked" FROM l`;
   const seq=await tx.$queryRaw<Array<{next:number}>>`SELECT COALESCE(MAX(CAST(SPLIT_PART("transferNumber",'-',2) AS INTEGER)),0)+1 AS "next" FROM "stock_transfers" WHERE "companyId"=${company.id}`;
   const transferNumber=`TR001-${String(Number(seq[0]?.next||1)).padStart(6,"0")}`; const transferId=randomUUID();
   await tx.$executeRaw`INSERT INTO "stock_transfers" ("id","companyId","transferNumber","fromWarehouseId","toWarehouseId","status","notes","createdById","createdAt","sentAt") VALUES (${transferId},${company.id},${transferNumber},${input.fromWarehouseId},${input.toWarehouseId},'IN_TRANSIT',${input.notes?.trim()||null},${membership.userId},NOW(),NOW())`;

   for(const line of input.lines){
     const variant=variantMap.get(line.variantId)!; const serialized=variant.product.type==="PHONE"||variant.product.type==="SERIALIZED";
     if(!Number.isInteger(line.quantity)||line.quantity<=0) throw new Error(`Cantidad inválida para ${variant.product.name}.`);
     if(serialized){
       const ids=line.unitIds||[]; if(ids.length!==line.quantity||new Set(ids).size!==ids.length) throw new Error(`Selecciona ${line.quantity} IMEI/serie para ${variant.product.name}.`);
       const units=await tx.productUnit.findMany({where:{id:{in:ids},companyId:company.id,warehouseId:input.fromWarehouseId,variantId:line.variantId,status:"AVAILABLE"}});
       if(units.length!==ids.length) throw new Error(`Uno de los equipos de ${variant.product.name} ya no está disponible en origen.`);
       for(const unit of units){
         const updated=await tx.productUnit.updateMany({where:{id:unit.id,status:"AVAILABLE",warehouseId:input.fromWarehouseId},data:{status:"IN_TRANSFER"}}); if(updated.count!==1) throw new Error("Un IMEI cambió de estado durante la transferencia.");
         await tx.$executeRaw`INSERT INTO "stock_transfer_items" ("id","transferId","productId","variantId","productUnitId","quantity","unitCost","createdAt") VALUES (${randomUUID()},${transferId},${variant.productId},${variant.id},${unit.id},1,${Number(unit.purchaseCost)},NOW())`;
         await tx.inventoryMovement.create({data:{companyId:company.id,warehouseId:input.fromWarehouseId,productId:variant.productId,variantId:variant.id,productUnitId:unit.id,movementType:"TRANSFER_OUT",quantity:1,unitCost:Number(unit.purchaseCost),referenceType:"TRANSFER",referenceId:transferId,notes:`Salida transferencia ${transferNumber}`,createdById:membership.userId}});
       }
     }else{
       const balance=await tx.inventoryBalance.findUnique({where:{companyId_warehouseId_variantId:{companyId:company.id,warehouseId:input.fromWarehouseId,variantId:variant.id}}});
       if(!balance||Number(balance.quantity)<line.quantity) throw new Error(`Stock insuficiente de ${variant.product.name} en almacén origen.`);
       const updated=await tx.inventoryBalance.updateMany({where:{id:balance.id,quantity:{gte:line.quantity}},data:{quantity:{decrement:line.quantity}}}); if(updated.count!==1) throw new Error(`Stock insuficiente de ${variant.product.name}.`);
       await tx.$executeRaw`INSERT INTO "stock_transfer_items" ("id","transferId","productId","variantId","productUnitId","quantity","unitCost","createdAt") VALUES (${randomUUID()},${transferId},${variant.productId},${variant.id},NULL,${line.quantity},${Number(balance.averageCost)},NOW())`;
       await tx.inventoryMovement.create({data:{companyId:company.id,warehouseId:input.fromWarehouseId,productId:variant.productId,variantId:variant.id,movementType:"TRANSFER_OUT",quantity:line.quantity,unitCost:Number(balance.averageCost),referenceType:"TRANSFER",referenceId:transferId,notes:`Salida transferencia ${transferNumber}`,createdById:membership.userId}});
     }
   }
   await tx.auditLog.create({data:{companyId:company.id,userId:membership.userId,action:"CREATE",entity:"STOCK_TRANSFER",entityId:transferId,newValues:{transferNumber,fromWarehouseId:input.fromWarehouseId,toWarehouseId:input.toWarehouseId,status:"IN_TRANSIT"}}});
   return {id:transferId,transferNumber};
 });
 revalidateAll(); return result;
}

export async function receiveTransferAction(transferId:string){
 const {company,membership}=await requirePermission("inventory.transfer");
 const headers=await prisma.$queryRaw<TransferHeader[]>`SELECT "id","transferNumber","fromWarehouseId","toWarehouseId","status" FROM "stock_transfers" WHERE "id"=${transferId} AND "companyId"=${company.id} LIMIT 1`;
 const header=headers[0]; if(!header) throw new Error("La transferencia ya no existe."); if(header.status!=="IN_TRANSIT") throw new Error("Solo se pueden recibir transferencias en tránsito.");
 const items=await prisma.$queryRaw<TransferItemRow[]>`SELECT "id","productId","variantId","productUnitId","quantity","unitCost" FROM "stock_transfer_items" WHERE "transferId"=${transferId}`;
 await prisma.$transaction(async tx=>{
   for(const item of items){const cost=Number(item.unitCost);
     if(item.productUnitId){
       const updated=await tx.productUnit.updateMany({where:{id:item.productUnitId,companyId:company.id,status:"IN_TRANSFER",warehouseId:header.fromWarehouseId},data:{warehouseId:header.toWarehouseId,status:"AVAILABLE"}}); if(updated.count!==1) throw new Error("Un IMEI ya no está en tránsito.");
       await tx.inventoryMovement.create({data:{companyId:company.id,warehouseId:header.toWarehouseId,productId:item.productId,variantId:item.variantId,productUnitId:item.productUnitId,movementType:"TRANSFER_IN",quantity:1,unitCost:cost,referenceType:"TRANSFER",referenceId:header.id,notes:`Recepción transferencia ${header.transferNumber}`,createdById:membership.userId}});
     }else{
       const balance=await tx.inventoryBalance.findUnique({where:{companyId_warehouseId_variantId:{companyId:company.id,warehouseId:header.toWarehouseId,variantId:item.variantId}}}); const oldQty=Number(balance?.quantity||0),oldAvg=Number(balance?.averageCost||0),newQty=oldQty+item.quantity,newAvg=newQty?money((oldQty*oldAvg+item.quantity*cost)/newQty):cost;
       await tx.inventoryBalance.upsert({where:{companyId_warehouseId_variantId:{companyId:company.id,warehouseId:header.toWarehouseId,variantId:item.variantId}},update:{quantity:newQty,averageCost:newAvg},create:{companyId:company.id,warehouseId:header.toWarehouseId,productId:item.productId,variantId:item.variantId,quantity:item.quantity,averageCost:cost}});
       await tx.inventoryMovement.create({data:{companyId:company.id,warehouseId:header.toWarehouseId,productId:item.productId,variantId:item.variantId,movementType:"TRANSFER_IN",quantity:item.quantity,unitCost:cost,referenceType:"TRANSFER",referenceId:header.id,notes:`Recepción transferencia ${header.transferNumber}`,createdById:membership.userId}});
     }}
   const changed=await tx.$executeRaw`UPDATE "stock_transfers" SET "status"='RECEIVED',"receivedById"=${membership.userId},"receivedAt"=NOW() WHERE "id"=${header.id} AND "companyId"=${company.id} AND "status"='IN_TRANSIT'`; if(!changed) throw new Error("La transferencia fue recibida por otro usuario.");
   await tx.auditLog.create({data:{companyId:company.id,userId:membership.userId,action:"UPDATE",entity:"STOCK_TRANSFER",entityId:header.id,oldValues:{status:"IN_TRANSIT"},newValues:{status:"RECEIVED"}}});
 }); revalidateAll(); return {id:header.id};
}

export async function cancelTransferAction(transferId:string){
 const {company,membership}=await requirePermission("inventory.transfer");
 const headers=await prisma.$queryRaw<TransferHeader[]>`SELECT "id","transferNumber","fromWarehouseId","toWarehouseId","status" FROM "stock_transfers" WHERE "id"=${transferId} AND "companyId"=${company.id} LIMIT 1`; const h=headers[0]; if(!h||h.status!=="IN_TRANSIT") throw new Error("Solo se puede cancelar una transferencia en tránsito.");
 const items=await prisma.$queryRaw<TransferItemRow[]>`SELECT "id","productId","variantId","productUnitId","quantity","unitCost" FROM "stock_transfer_items" WHERE "transferId"=${h.id}`;
 await prisma.$transaction(async tx=>{for(const item of items){const cost=Number(item.unitCost);if(item.productUnitId){await tx.productUnit.updateMany({where:{id:item.productUnitId,status:"IN_TRANSFER",warehouseId:h.fromWarehouseId},data:{status:"AVAILABLE"}})}else{const b=await tx.inventoryBalance.findUnique({where:{companyId_warehouseId_variantId:{companyId:company.id,warehouseId:h.fromWarehouseId,variantId:item.variantId}}});const oldQty=Number(b?.quantity||0),oldAvg=Number(b?.averageCost||0),newQty=oldQty+item.quantity,newAvg=newQty?money((oldQty*oldAvg+item.quantity*cost)/newQty):cost;await tx.inventoryBalance.upsert({where:{companyId_warehouseId_variantId:{companyId:company.id,warehouseId:h.fromWarehouseId,variantId:item.variantId}},update:{quantity:newQty,averageCost:newAvg},create:{companyId:company.id,warehouseId:h.fromWarehouseId,productId:item.productId,variantId:item.variantId,quantity:item.quantity,averageCost:cost}})} await tx.inventoryMovement.create({data:{companyId:company.id,warehouseId:h.fromWarehouseId,productId:item.productId,variantId:item.variantId,productUnitId:item.productUnitId,movementType:"TRANSFER_IN",quantity:item.quantity,unitCost:cost,referenceType:"TRANSFER_CANCEL",referenceId:h.id,notes:`Anulación transferencia ${h.transferNumber}`,createdById:membership.userId}})} await tx.$executeRaw`UPDATE "stock_transfers" SET "status"='CANCELLED' WHERE "id"=${h.id} AND "status"='IN_TRANSIT'`;await tx.auditLog.create({data:{companyId:company.id,userId:membership.userId,action:"CANCEL",entity:"STOCK_TRANSFER",entityId:h.id,newValues:{status:"CANCELLED"}}})});revalidateAll();return {id:h.id};
}

function revalidateAll(){["/transferencias","/productos","/equipos","/kardex","/reportes"].forEach(revalidatePath)}
