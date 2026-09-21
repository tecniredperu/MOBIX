-- MOBIX · Permiso de auditoría y consulta eficiente del historial.
INSERT INTO "permissions" ("id","code","name","description") VALUES
  ('perm_audit_view','audit.view','Ver auditoría','Consultar el historial de acciones y cambios del sistema')
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name", "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" = 'audit.view'
WHERE r."isSystem" = true
ON CONFLICT ("roleId","permissionId") DO NOTHING;

CREATE INDEX IF NOT EXISTS "audit_logs_company_createdAt_idx"
ON "audit_logs" ("companyId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "audit_logs_company_action_createdAt_idx"
ON "audit_logs" ("companyId", "action", "createdAt" DESC);
