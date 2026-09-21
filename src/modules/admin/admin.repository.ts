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


const AUDIT_SENSITIVE_KEYS = /password|passwd|secret|token|cookie|authorization|session|credential/i;

function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[MAX_DEPTH]";
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeAuditValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        AUDIT_SENSITIVE_KEYS.test(key) ? "[REDACTED]" : sanitizeAuditValue(item, depth + 1),
      ]),
    );
  }
  if (typeof value === "string" && value.length > 300) return value.slice(0, 300) + "…";
  return value;
}

export async function getAuditLogData(limit = 200) {
  const company = await getActiveCompany();
  const take = Math.max(1, Math.min(500, Math.floor(limit)));

  const logs = await prisma.auditLog.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: { select: { name: true, email: true } },
    },
  });

  return logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    userName: log.user?.name ?? "Sistema",
    userEmail: log.user?.email ?? null,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    ipAddress: log.ipAddress,
    oldValues: sanitizeAuditValue(log.oldValues),
    newValues: sanitizeAuditValue(log.newValues),
  }));
}
