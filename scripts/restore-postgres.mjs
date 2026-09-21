import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL?.trim();
const backupFile = process.argv[2] ? resolve(process.argv[2]) : "";

if (!databaseUrl) {
  console.error("DATABASE_URL es obligatorio.");
  process.exit(1);
}
if (!backupFile || !existsSync(backupFile)) {
  console.error("Uso: npm run db:restore -- backups/archivo.dump");
  process.exit(1);
}
if (process.env.MOBIX_RESTORE_CONFIRM !== "RESTORE") {
  console.error("Restauración bloqueada. Define MOBIX_RESTORE_CONFIRM=RESTORE para confirmar que deseas sobrescribir la base destino.");
  process.exit(1);
}

const verify = spawnSync("pg_restore", ["--list", backupFile], { stdio: "ignore" });
if (verify.status !== 0) {
  console.error("El archivo no es un backup PostgreSQL custom válido.");
  process.exit(1);
}

const restore = spawnSync("pg_restore", [
  "--clean",
  "--if-exists",
  "--no-owner",
  "--no-privileges",
  "--dbname", databaseUrl,
  backupFile,
], { stdio: "inherit" });

if (restore.status !== 0) {
  console.error("La restauración falló.");
  process.exit(restore.status || 1);
}

console.log("Restauración MOBIX completada correctamente.");
