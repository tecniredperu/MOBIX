import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("health público no expone diagnóstico interno", async () => {
  const publicHealth = await source("src/app/api/health/route.ts");
  const privateHealth = await source("src/app/api/health/details/route.ts");

  for (const key of ["BUILD_COMMIT", "modules", "environment", "databaseLatencyMs", "uptimeSeconds"]) {
    assert.equal(publicHealth.includes(key), false);
  }
  assert.ok(privateHealth.includes('status: 401'));
  assert.ok(privateHealth.includes('"settings.manage"'));
  assert.ok(privateHealth.includes("getDetailedHealth"));
});

test("auditoría tiene permiso propio y redacta datos sensibles", async () => {
  const migration = await source("prisma/migrations/20260921100500_audit_view_permission/migration.sql");
  const repository = await source("src/modules/admin/audit.repository.ts");
  const page = await source("src/app/(app)/administracion/auditoria/page.tsx");

  assert.ok(migration.includes("'audit.view'"));
  assert.ok(repository.includes("SENSITIVE_KEYS"));
  assert.ok(repository.includes("[REDACTADO]"));
  assert.ok(page.includes('requirePermission("audit.view")'));
});

test("restore requiere confirmación explícita y backup usa SHA-256", async () => {
  const backup = await source("scripts/backup-db.mjs");
  const verify = await source("scripts/verify-backup.mjs");
  const restore = await source("scripts/restore-db.mjs");

  assert.ok(backup.includes('createHash("sha256")'));
  assert.ok(backup.includes("--format=custom"));
  assert.ok(verify.includes("pg_restore"));
  assert.ok(restore.includes('MOBIX_RESTORE_CONFIRM !== "RESTORE_MOBIX"'));
  assert.ok(restore.includes("--clean"));
  assert.ok(restore.includes("--if-exists"));
});

test("cabeceras de producción incluyen CSP y protecciones de navegador", async () => {
  const config = await source("next.config.ts");

  assert.ok(config.includes("Content-Security-Policy"));
  assert.ok(config.includes("object-src 'none'"));
  assert.ok(config.includes("frame-ancestors 'none'"));
  assert.ok(config.includes("Strict-Transport-Security"));
  assert.ok(config.includes("includeSubDomains"));
});

test("backups nunca se versionan ni entran al contexto Docker", async () => {
  const gitignore = await source(".gitignore");
  const dockerignore = await source(".dockerignore");

  assert.ok(gitignore.includes("backups/"));
  assert.ok(dockerignore.includes("backups"));
});


test("producción valida secretos antes de arrancar", async () => {
  const script = await source("scripts/validate-production-env.mjs");
  const pkg = JSON.parse(await source("package.json"));
  const docker = await source("Dockerfile");

  assert.ok(script.includes("AUTH_SECRET debe tener al menos 32 caracteres"));
  assert.ok(script.includes("DATABASE_URL"));
  assert.ok(pkg.scripts.start.startsWith("npm run prod:validate"));
  assert.ok(docker.includes("npm run prod:validate"));
});

test("existe simulacro automático de recuperación", async () => {
  const workflow = await source(".github/workflows/backup-restore-drill.yml");

  assert.ok(workflow.includes("MOBIX Backup Restore Drill"));
  assert.ok(workflow.includes("pg_dump"));
  assert.ok(workflow.includes("pg_restore"));
  assert.ok(workflow.includes("Comparar integridad origen vs restore"));
});
