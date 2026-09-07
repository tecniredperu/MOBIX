"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/business-context";
import { prisma } from "@/lib/prisma";

function cleanCode(v:string){return v.trim().toUpperCase().replace(/\s+/g,"-")}
function cleanRuc(v:string){return v.replace(/\D/g,"")}
function refresh(){["/configuracion","/pos","/ventas","/productos","/caja"].forEach(revalidatePath)}

export async function updateCompanyAction(input:{businessName:string;tradeName?:string;ruc?:string;email?:string;phone?:string;address?:string;logoUrl?:string;currency:string;timezone:string}){
 const {company,membership}=await requirePermission("settings.manage");const ruc=cleanRuc(input.ruc||"");if(ruc&&ruc.length!==11)throw new Error("El RUC debe tener 11 dígitos.");if(input.businessName.trim().length<3)throw new Error("Ingresa la razón social.");
 await prisma.$transaction(async tx=>{await tx.company.update({where:{id:company.id},data:{businessName:input.businessName.trim(),tradeName:input.tradeName?.trim()||null,ruc:ruc||null,email:input.email?.trim()||null,phone:input.phone?.trim()||null,address:input.address?.trim()||null,logoUrl:input.logoUrl?.trim()||null,currency:input.currency||"PEN",timezone:input.timezone||"America/Lima"}});await tx.auditLog.create({data:{companyId:company.id,userId:membership.userId,action:"UPDATE",entity:"COMPANY",entityId:company.id,newValues:{businessName:input.businessName.trim(),tradeName:input.tradeName?.trim()||null,ruc:ruc||null}}})});refresh();
}

export async function updateCompanySettingsAction(input:{taxRate:number;defaultTaxCondition:"TAXED"|"EXEMPT"|"UNAFFECTED";receiptSeries:string;invoiceSeries:string;salesNoteSeries:string;ticketFooter?:string;defaultWarrantyDays:number;requireCashSession:boolean}){
 const {company,membership}=await requirePermission("settings.manage");if(!Number.isFinite(input.taxRate)||input.taxRate<0||input.taxRate>100)throw new Error("La tasa de impuesto no es válida.");if(!Number.isInteger(input.defaultWarrantyDays)||input.defaultWarrantyDays<0)throw new Error("Los días de garantía no son válidos.");
 const receipt=cleanCode(input.receiptSeries),invoice=cleanCode(input.invoiceSeries),note=cleanCode(input.salesNoteSeries);if(!receipt||!invoice||!note)throw new Error("Configura las series de comprobantes.");
 await prisma.$transaction(async tx=>{await tx.$executeRaw`INSERT INTO "company_settings" ("companyId","taxRate","defaultTaxCondition","receiptSeries","invoiceSeries","salesNoteSeries","ticketFooter","defaultWarrantyDays","requireCashSession","createdAt","updatedAt") VALUES (${company.id},${input.taxRate},${input.defaultTaxCondition},${receipt},${invoice},${note},${input.ticketFooter?.trim()||null},${input.defaultWarrantyDays},${input.requireCashSession},NOW(),NOW()) ON CONFLICT ("companyId") DO UPDATE SET "taxRate"=EXCLUDED."taxRate","defaultTaxCondition"=EXCLUDED."defaultTaxCondition","receiptSeries"=EXCLUDED."receiptSeries","invoiceSeries"=EXCLUDED."invoiceSeries","salesNoteSeries"=EXCLUDED."salesNoteSeries","ticketFooter"=EXCLUDED."ticketFooter","defaultWarrantyDays"=EXCLUDED."defaultWarrantyDays","requireCashSession"=EXCLUDED."requireCashSession","updatedAt"=NOW()`;await tx.auditLog.create({data:{companyId:company.id,userId:membership.userId,action:"UPDATE",entity:"COMPANY_SETTINGS",entityId:company.id,newValues:{taxRate:input.taxRate,defaultTaxCondition:input.defaultTaxCondition,receiptSeries:receipt,invoiceSeries:invoice,salesNoteSeries:note,defaultWarrantyDays:input.defaultWarrantyDays,requireCashSession:input.requireCashSession}}})});refresh();
}

export async function saveBranchAction(input:{id?:string;name:string;code:string;address?:string;phone?:string;status:"ACTIVE"|"INACTIVE"}){
 const {company,membership}=await requirePermission("settings.manage");const code=cleanCode(input.code);if(input.name.trim().length<2||!code)throw new Error("Nombre y código de sucursal son obligatorios.");
 const duplicate=await prisma.branch.findFirst({where:{companyId:company.id,code,id:input.id?{not:input.id}:undefined}});if(duplicate)throw new Error("Ya existe una sucursal con ese código.");
 const branch=input.id?await prisma.branch.update({where:{id:input.id},data:{name:input.name.trim(),code,address:input.address?.trim()||null,phone:input.phone?.trim()||null,status:input.status}}):await prisma.branch.create({data:{companyId:company.id,name:input.name.trim(),code,address:input.address?.trim()||null,phone:input.phone?.trim()||null,status:input.status}});
 await prisma.auditLog.create({data:{companyId:company.id,userId:membership.userId,action:input.id?"UPDATE":"CREATE",entity:"BRANCH",entityId:branch.id,newValues:{name:branch.name,code:branch.code,status:branch.status}}});refresh();return {id:branch.id};
}

export async function saveWarehouseAction(input:{id?:string;branchId:string;name:string;code:string;description?:string;isSaleable:boolean;status:"ACTIVE"|"INACTIVE"}){
 const {company,membership}=await requirePermission("settings.manage");const code=cleanCode(input.code);const branch=await prisma.branch.findFirst({where:{id:input.branchId,companyId:company.id}});if(!branch)throw new Error("Sucursal inválida.");if(input.name.trim().length<2||!code)throw new Error("Nombre y código de almacén son obligatorios.");
 const duplicate=await prisma.warehouse.findFirst({where:{companyId:company.id,code,id:input.id?{not:input.id}:undefined}});if(duplicate)throw new Error("Ya existe un almacén con ese código.");
 const warehouse=input.id?await prisma.warehouse.update({where:{id:input.id},data:{branchId:branch.id,name:input.name.trim(),code,description:input.description?.trim()||null,isSaleable:input.isSaleable,status:input.status}}):await prisma.warehouse.create({data:{companyId:company.id,branchId:branch.id,name:input.name.trim(),code,description:input.description?.trim()||null,isSaleable:input.isSaleable,status:input.status}});
 await prisma.auditLog.create({data:{companyId:company.id,userId:membership.userId,action:input.id?"UPDATE":"CREATE",entity:"WAREHOUSE",entityId:warehouse.id,newValues:{name:warehouse.name,code:warehouse.code,branchId:warehouse.branchId,status:warehouse.status,isSaleable:warehouse.isSaleable}}});refresh();return {id:warehouse.id};
}
