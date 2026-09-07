import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

type ReturnRow={id:string;returnNumber:string;type:string;reason:string;refundMethod:string|null;refundAmount:unknown;createdAt:Date;saleNumber:string;customer:string|null;warehouse:string;userName:string};

export async function getReturns(){
  const company=await getActiveCompany();
  const rows=await prisma.$queryRaw<ReturnRow[]>`
    SELECT ro."id",ro."returnNumber",ro."type",ro."reason",ro."refundMethod",ro."refundAmount",ro."createdAt",
           s."saleNumber",COALESCE(c."businessName",TRIM(CONCAT(COALESCE(c."firstName",''),' ',COALESCE(c."lastName",'')))) AS "customer",
           w."name" AS "warehouse",u."name" AS "userName"
    FROM "return_orders" ro JOIN "sales" s ON s."id"=ro."saleId"
    LEFT JOIN "customers" c ON c."id"=ro."customerId" JOIN "warehouses" w ON w."id"=ro."warehouseId"
    JOIN "users" u ON u."id"=ro."createdById"
    WHERE ro."companyId"=${company.id} AND ro."status"='COMPLETED' ORDER BY ro."createdAt" DESC LIMIT 150`;
  return rows.map(r=>({...r,refundAmount:Number(r.refundAmount),createdAt:r.createdAt.toISOString(),customer:r.customer?.trim()||"Consumidor final"}));
}

export async function getReturnSaleOptions(){
  const company=await getActiveCompany();
  const sales=await prisma.sale.findMany({
    where:{companyId:company.id,status:"COMPLETED"},orderBy:{createdAt:"desc"},take:100,
    include:{customer:true,warehouse:{select:{id:true,name:true,branchId:true}},items:{include:{product:true,variant:true,units:{include:{productUnit:{include:{identifiers:true}}}}}}},
  });
  const returned=await prisma.$queryRaw<Array<{saleItemId:string;qty:bigint}>>`
    SELECT ri."saleItemId",COALESCE(SUM(ri."quantity"),0)::bigint AS "qty" FROM "return_items" ri
    JOIN "return_orders" ro ON ro."id"=ri."returnOrderId"
    WHERE ro."companyId"=${company.id} AND ro."status"='COMPLETED' GROUP BY ri."saleItemId"`;
  const returnedMap=new Map(returned.map(r=>[r.saleItemId,Number(r.qty)]));
  return sales.map(s=>({id:s.id,saleNumber:s.saleNumber,createdAt:s.createdAt.toISOString(),customer:s.customer?.businessName||[s.customer?.firstName,s.customer?.lastName].filter(Boolean).join(" ")||"Consumidor final",warehouseId:s.warehouseId,warehouse:s.warehouse.name,total:Number(s.total),items:s.items.map(i=>({id:i.id,productId:i.productId,variantId:i.variantId,product:i.product.name,type:i.product.type,variant:[i.variant.color,i.variant.ram,i.variant.storage].filter(Boolean).join(" · ")||i.variant.sku||"General",quantity:i.quantity,returned:returnedMap.get(i.id)||0,total:Number(i.total),unitPrice:Number(i.unitPrice),unitCost:Number(i.unitCost),units:i.units.map(u=>({id:u.productUnit.id,status:u.productUnit.status,identifier:u.productUnit.identifiers.find(x=>x.type==="IMEI_1")?.value||u.productUnit.identifiers.find(x=>x.type==="SERIAL")?.value||u.productUnit.id}))}))}));
}
