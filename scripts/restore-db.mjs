import "dotenv/config";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function cliDatabaseUrl(raw) {
  const url = new URL(raw);
  url.searchParams.delete("schema");
  return url.toString();
}

function run(tool, args) {
  const result = spawnSync(tool, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error?.code === "ENOENT") {
    throw new Error(`${tool} no está instalado. Instala PostgreSQL Client de la misma versión mayor que tu servidor.`);
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${tool} terminó con código ${result.status}.`);
  }
}

const rawUrl = process.env.DATABASE_URL?.trim();
if (!rawUrl) throw new Error("DATABASE_URL no está configurada.");
if (process.env.MOBIX_RESTORE_CONFIRM !== "RESTORE_MOBIX") {
  throw new Error("Restore bloqueado. Define MOBIX_RESTORE_CONFIRM=RESTORE_MOBIX para confirmar una restauración destructiva.");
}

const backupFile = resolve(process.env.BACKUP_FILE?.trim() || process.argv[2] || "");
if (!backupFile) throw new Error("Define BACKUP_FILE o pasa la ruta del .dump.");
await access(backupFile);

const bytes = await readFile(backupFile);
const sha256 = createHash("sha256").update(bytes).digest("hex");
try {
  const manifest = JSON.parse(await readFile(backupFile + ".json", "utf8"));
  if (manifest.sha256 && manifest.sha256 !== sha256) {
    throw new Error("El backup fue modificado: el SHA-256 no coincide con su manifiesto.");
  }
} catch (error) {
  if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
}

run(process.env.PG_RESTORE_BIN?.trim() || "pg_restore", [
  "--clean",
  "--if-exists",
  "--no-owner",
  "--no-privileges",
  "--dbname",
  cliDatabaseUrl(rawUrl),
  backupFile,
]);

console.log(JSON.stringify({
  success: true,
  restored: backupFile,
  sha256,
  database: new URL(rawUrl).pathname.replace(/^\//, ""),
}, null, 2));
