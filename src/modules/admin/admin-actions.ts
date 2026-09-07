"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/business-context";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

function email(value:string){return value.trim().toLowerCase()}
function validateNewPassword(password:string){
 if(password.length<10) throw new Error("La contraseña inicial debe tener al menos 10 caracteres.");
 if(!/[A-ZÁÉÍÓÚÑ]/.test(password)||!/[a-záéíóúñ]/.test(password)||!/[0-9]/.test(password)) throw new Error("La contraseña debe incluir mayúsculas, minúsculas y números.");
}

export async function createUserAction(input:{name:string;email:string;phone?:string;password:string;roleId:string;branchId?:string}){
 const {company,membership}=await requirePermission("users.manage");
 if(input.name.trim().length<3) throw new Error("Ingresa el nombre completo del usuario.");
 const mail=email(input.email); if(!/^\S+@\S+\.\S+$/.test(mail)) throw new Error("Ingresa un correo válido.");
 validateNewPassword(input.password);
 const role=await prisma.role.findFirst({where:{id:input.roleId,companyId:company.id,status:"ACTIVE"}}); if(!role) throw new Error("El rol seleccionado ya no está disponible.");
 if(input.branchId){const branch=await prisma.branch.findFirst({where:{id:input.branchId,companyId:company.id,status:"ACTIVE"}});if(!branch)throw new Error("La sucursal seleccionada no está disponible.")}
 const result=await prisma.$transaction(async tx=>{
   let user=await tx.user.findUnique({where:{email:mail}});
   if(user){const exists=await tx.companyUser.findUnique({where:{companyId_userId:{companyId:company.id,userId:user.id}}});if(exists)throw new Error("Ese correo ya pertenece a un usuario de esta empresa.");user=await tx.user.update({where:{id:user.id},data:{name:input.name.trim(),phone:input.phone?.trim()||null,passwordHash:hashPassword(input.password),status:"ACTIVE"}})}
   else user=await tx.user.create({data:{name:input.name.trim(),email:mail,phone:input.phone?.trim()||null,passwordHash:hashPassword(input.password),status:"ACTIVE"}});
   const member=await tx.companyUser.create({data:{companyId:company.id,userId:user.id,roleId:role.id,defaultBranchId:input.branchId||null,status:"ACTIVE"}});
   await tx.auditLog.create({data:{companyId:company.id,userId:membership.userId,action:"CREATE",entity:"USER",entityId:user.id,newValues:{email:mail,roleId:role.id,branchId:input.branchId||null}}});return {id:member.id};
 });revalidatePath("/administracion/usuarios");return result;
}

export async function updateUserAction(input:{membershipId:string;roleId:string;branchId?:string;membershipStatus:"ACTIVE"|"SUSPENDED"|"INACTIVE";userStatus:"ACTIVE"|"SUSPENDED"|"INACTIVE"}){
 const {company,membership}=await requirePermission("users.manage");
 const target=await prisma.companyUser.findFirst({where:{id:input.membershipId,companyId:company.id},include:{role:true}});if(!target)throw new Error("El usuario ya no existe.");
 if(target.userId===membership.userId&&(input.membershipStatus!=="ACTIVE"||input.userStatus!=="ACTIVE")) throw new Error("No puedes suspender tu propio usuario activo.");
 const role=await prisma.role.findFirst({where:{id:input.roleId,companyId:company.id,status:"ACTIVE"}});if(!role)throw new Error("Rol inválido.");
 if(input.branchId){const branch=await prisma.branch.findFirst({where:{id:input.branchId,companyId:company.id,status:"ACTIVE"},select:{id:true}});if(!branch)throw new Error("La sucursal seleccionada no está disponible.")}
 await prisma.$transaction(async tx=>{await tx.companyUser.update({where:{id:target.id},data:{roleId:role.id,defaultBranchId:input.branchId||null,status:input.membershipStatus}});await tx.user.update({where:{id:target.userId},data:{status:input.userStatus}});await tx.auditLog.create({data:{companyId:company.id,userId:membership.userId,action:"UPDATE",entity:"USER",entityId:target.userId,newValues:{roleId:role.id,branchId:input.branchId||null,membershipStatus:input.membershipStatus,userStatus:input.userStatus}}})});revalidatePath("/administracion/usuarios");
}

export async function createRoleAction(input:{name:string;description?:string;permissionCodes:string[]}){
 const {company,membership}=await requirePermission("roles.manage");const name=input.name.trim();if(name.length<3)throw new Error("El nombre del rol debe tener al menos 3 caracteres.");
 const exists=await prisma.role.findUnique({where:{companyId_name:{companyId:company.id,name}}});if(exists)throw new Error("Ya existe un rol con ese nombre.");
 const permissions=await prisma.permission.findMany({where:{code:{in:[...new Set(input.permissionCodes)]}}});
 const role=await prisma.$transaction(async tx=>{const created=await tx.role.create({data:{companyId:company.id,name,description:input.description?.trim()||null,isSystem:false,status:"ACTIVE"}});if(permissions.length)await tx.rolePermission.createMany({data:permissions.map(p=>({roleId:created.id,permissionId:p.id})),skipDuplicates:true});await tx.auditLog.create({data:{companyId:company.id,userId:membership.userId,action:"CREATE",entity:"ROLE",entityId:created.id,newValues:{name,permissions:permissions.map(p=>p.code)}}});return created});revalidatePath("/administracion/roles");return {id:role.id};
}

export async function updateRoleAction(input:{roleId:string;name:string;description?:string;status:"ACTIVE"|"INACTIVE";permissionCodes:string[]}){
 const {company,membership}=await requirePermission("roles.manage");const role=await prisma.role.findFirst({where:{id:input.roleId,companyId:company.id}});if(!role)throw new Error("El rol ya no existe.");
 if(role.isSystem&&input.status!=="ACTIVE")throw new Error("El rol Administrador del sistema no puede desactivarse.");
 const cleanName=input.name.trim();if(!role.isSystem&&cleanName.length<3)throw new Error("El nombre del rol debe tener al menos 3 caracteres.");
 const duplicate=!role.isSystem?await prisma.role.findFirst({where:{companyId:company.id,name:cleanName,id:{not:role.id}},select:{id:true}}):null;if(duplicate)throw new Error("Ya existe otro rol con ese nombre.");
 const permissions=await prisma.permission.findMany({where:{code:{in:[...new Set(input.permissionCodes)]}}});
 await prisma.$transaction(async tx=>{await tx.role.update({where:{id:role.id},data:{name:role.isSystem?role.name:cleanName,description:input.description?.trim()||null,status:role.isSystem?"ACTIVE":input.status}});await tx.rolePermission.deleteMany({where:{roleId:role.id}});const assigned=role.isSystem?await tx.permission.findMany():permissions;if(assigned.length)await tx.rolePermission.createMany({data:assigned.map(p=>({roleId:role.id,permissionId:p.id})),skipDuplicates:true});await tx.auditLog.create({data:{companyId:company.id,userId:membership.userId,action:"UPDATE",entity:"ROLE",entityId:role.id,newValues:{permissions:assigned.map(p=>p.code),status:role.isSystem?"ACTIVE":input.status}}})});revalidatePath("/administracion/roles");revalidatePath("/administracion/usuarios");
}
