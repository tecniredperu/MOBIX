import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("health público no expone detalles operativos sin token", async () => {
  const health = await source("src/app/api/health/route.ts");

  assert.ok(health.includes("HEALTH_DETAILS_TOKEN"));
  assert.ok(health.includes("x-mobix-health-token"));
  assert.ok(health.includes("canShowDetails(request)"));
  assert.ok(health.includes('status: "ok"'));
});

test("login solo confía en cabeceras IP cuando el proxy está autorizado", async () => {
  const auth = await source("src/modules/auth/auth-actions.ts");

  assert.ok(auth.includes('process.env.TRUST_PROXY_HEADERS !== "true"'));
  assert.ok(auth.includes("const ipKey = ip ?"));
  assert.ok(auth.includes("...(ipKey ? [ipKey] : [])"));
});

test("arranque de producción valida secretos y base antes de iniciar", async () => {
  const pkg = JSON.parse(await source("package.json"));
  const docker = await source("Dockerfile");
  const check = await source("scripts/check-production-env.mjs");

  assert.ok(pkg.scripts.start.includes("npm run prod:check"));
  assert.ok(docker.includes("npm run prod:check"));
  assert.ok(check.includes("AUTH_SECRET debe tener al menos 32 caracteres"));
  assert.ok(check.includes("DATABASE_URL debe apuntar a PostgreSQL"));
});

test("backup y restore tienen verificación y protección contra sobrescritura accidental", async () => {
  const backup = await source("scripts/backup-postgres.mjs");
  const restore = await source("scripts/restore-postgres.mjs");
  const gitignore = await source(".gitignore");

  assert.ok(backup.includes('"pg_dump"'));
  assert.ok(backup.includes('"pg_restore"'));
  assert.ok(backup.includes("sha256"));
  assert.ok(restore.includes('MOBIX_RESTORE_CONFIRM !== "RESTORE"'));
  assert.ok(restore.includes('"--clean"'));
  assert.ok(gitignore.includes("*.dump"));
});


test("auditoría administrativa está aislada por empresa y redacta campos sensibles", async () => {
  const repository = await source("src/modules/admin/admin.repository.ts");
  const page = await source("src/app/(app)/administracion/auditoria/page.tsx");

  assert.ok(repository.includes("where: { companyId: company.id }"));
  assert.ok(repository.includes("AUDIT_SENSITIVE_KEYS"));
  assert.ok(repository.includes('"[REDACTED]"'));
  assert.ok(page.includes('requirePermission("roles.manage")'));
  assert.ok(page.includes("getAuditLogData(200)"));
});
