import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

type TransferRow={id:string;transferNumber:string;status:string;notes:string|null;createdAt:Date;sentAt:Date|null;receivedAt:Date|null;fromWarehouse:string;fromBranch:string;toWarehouse:string;toBranch:string;createdBy:string;receivedBy:string|null;items:bigint;units:bigint};

export async function getTransfers(){
 const company=await getActiveCompany();
 const rows=await prisma.$queryRaw<TransferRow[]>`
 SELECT t."id",t."transferNumber",t."status",t."notes",t."createdAt",t."sentAt",t."receivedAt",
 fw."name" AS "fromWarehouse",fb."name" AS "fromBranch",tw."name" AS "toWarehouse",tb."name" AS "toBranch",
 cu."name" AS "createdBy",ru."name" AS "receivedBy",COUNT(ti."id")::bigint AS "items",COALESCE(SUM(ti."quantity"),0)::bigint AS "units"
 FROM "stock_transfers" t JOIN "warehouses" fw ON fw."id"=t."fromWarehouseId" JOIN "branches" fb ON fb."id"=fw."branchId"
 JOIN "warehouses" tw ON tw."id"=t."toWarehouseId" JOIN "branches" tb ON tb."id"=tw."branchId" JOIN "users" cu ON cu."id"=t."createdById"
 LEFT JOIN "users" ru ON ru."id"=t."receivedById" LEFT JOIN "stock_transfer_items" ti ON ti."transferId"=t."id"
 WHERE t."companyId"=${company.id} GROUP BY t."id",fw."name",fb."name",tw."name",tb."name",cu."name",ru."name" ORDER BY t."createdAt" DESC LIMIT 150`;
 return rows.map(r=>({...r,items:Number(r.items),units:Number(r.units),createdAt:r.createdAt.toISOString(),sentAt:r.sentAt?.toISOString()||null,receivedAt:r.receivedAt?.toISOString()||null}));
}

export async function getTransferOptions(){
 const company=await getActiveCompany();
 const warehouses=await prisma.warehouse.findMany({where:{companyId:company.id,status:"ACTIVE"},include:{branch:{select:{name:true}}},orderBy:[{branch:{name:"asc"}},{name:"asc"}]});
 const variants=await prisma.productVariant.findMany({where:{companyId:company.id,status:"ACTIVE",product:{status:"ACTIVE",type:{in:["PHONE","SERIALIZED","ACCESSORY"]}}},include:{product:{include:{brand:true}},units:{where:{status:"AVAILABLE"},include:{identifiers:true}},inventoryBalances:true},orderBy:{product:{name:"asc"}}});
 return {warehouses:warehouses.map(w=>({id:w.id,name:w.name,branch:w.branch.name})),products:variants.map(v=>({variantId:v.id,productId:v.productId,name:v.product.name,type:v.product.type,variant:[v.color,v.ram,v.storage].filter(Boolean).join(" · ")||v.sku||"General",brand:v.product.brand?.name||"",cost:Number(v.purchasePrice),balances:v.inventoryBalances.map(b=>({warehouseId:b.warehouseId,quantity:Number(b.quantity),averageCost:Number(b.averageCost)})),units:v.units.map(u=>({id:u.id,warehouseId:u.warehouseId,cost:Number(u.purchaseCost),identifier:u.identifiers.find(i=>i.type==="IMEI_1")?.value||u.identifiers.find(i=>i.type==="SERIAL")?.value||u.id}))}))};
}
