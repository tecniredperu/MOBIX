import { getActiveCompany } from "@/lib/company-context";
import { prisma } from "@/lib/prisma";

export async function getAdminData(){
 const company=await getActiveCompany();
 const [memberships,roles,permissions,branches]=await Promise.all([
   prisma.companyUser.findMany({where:{companyId:company.id},include:{user:true,role:true,defaultBranch:true},orderBy:{createdAt:"asc"}}),
   prisma.role.findMany({where:{companyId:company.id},include:{permissions:{include:{permission:true}},_count:{select:{memberships:true}}},orderBy:[{isSystem:"desc"},{name:"asc"}]}),
   prisma.permission.findMany({orderBy:{code:"asc"}}),
   prisma.branch.findMany({where:{companyId:company.id,status:"ACTIVE"},orderBy:{name:"asc"}}),
 ]);
 return {
   users:memberships.map(m=>({membershipId:m.id,userId:m.userId,name:m.user.name,email:m.user.email,phone:m.user.phone,status:m.status,userStatus:m.user.status,roleId:m.roleId,role:m.role.name,branchId:m.defaultBranchId,branch:m.defaultBranch?.name||"Sin sucursal"})),
   roles:roles.map(r=>({id:r.id,name:r.name,description:r.description,isSystem:r.isSystem,status:r.status,userCount:r._count.memberships,permissionCodes:r.permissions.map(x=>x.permission.code)})),
   permissions:permissions.map(p=>({id:p.id,code:p.code,name:p.name,description:p.description,group:p.code.split('.')[0]})),
   branches:branches.map(b=>({id:b.id,name:b.name})),
 };
}
