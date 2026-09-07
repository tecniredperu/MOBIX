import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

type SettingsRow={taxRate:unknown;defaultTaxCondition:string;receiptSeries:string;invoiceSeries:string;salesNoteSeries:string;ticketFooter:string|null;defaultWarrantyDays:number;requireCashSession:boolean};
export async function getSettingsData(){
 const active=await getActiveCompany();
 const [company,branches,warehouses,rows]=await Promise.all([
   prisma.company.findUniqueOrThrow({where:{id:active.id}}),
   prisma.branch.findMany({where:{companyId:active.id},orderBy:{createdAt:"asc"}}),
   prisma.warehouse.findMany({where:{companyId:active.id},include:{branch:{select:{name:true}}},orderBy:{createdAt:"asc"}}),
   prisma.$queryRaw<SettingsRow[]>`SELECT "taxRate","defaultTaxCondition","receiptSeries","invoiceSeries","salesNoteSeries","ticketFooter","defaultWarrantyDays","requireCashSession" FROM "company_settings" WHERE "companyId"=${active.id} LIMIT 1`,
 ]);
 const s=rows[0];
 return {company:{id:company.id,businessName:company.businessName,tradeName:company.tradeName||"",ruc:company.ruc||"",email:company.email||"",phone:company.phone||"",address:company.address||"",logoUrl:company.logoUrl||"",currency:company.currency,timezone:company.timezone},settings:{taxRate:Number(s?.taxRate??18),defaultTaxCondition:s?.defaultTaxCondition||"TAXED",receiptSeries:s?.receiptSeries||"B001",invoiceSeries:s?.invoiceSeries||"F001",salesNoteSeries:s?.salesNoteSeries||"NV01",ticketFooter:s?.ticketFooter||"",defaultWarrantyDays:Number(s?.defaultWarrantyDays??0),requireCashSession:s?.requireCashSession??true},branches:branches.map(b=>({id:b.id,name:b.name,code:b.code,address:b.address||"",phone:b.phone||"",status:b.status})),warehouses:warehouses.map(w=>({id:w.id,branchId:w.branchId,branch:w.branch.name,name:w.name,code:w.code,description:w.description||"",isSaleable:w.isSaleable,status:w.status}))};
}
