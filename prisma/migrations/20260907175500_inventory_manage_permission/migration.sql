-- MOBIX · Permiso de gestión de catálogo/inventario
INSERT INTO "permissions" ("id","code","name","description") VALUES
  ('perm_inventory_manage','inventory.manage','Gestionar productos','Crear y modificar catálogo, precios y parámetros de producto')
ON CONFLICT ("code") DO UPDATE SET "name"=EXCLUDED."name", "description"=EXCLUDED."description";

-- Los roles de sistema conservan acceso total automáticamente.
INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code"='inventory.manage'
WHERE r."isSystem"=true
ON CONFLICT ("roleId","permissionId") DO NOTHING;
