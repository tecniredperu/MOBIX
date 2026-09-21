import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function run(tool, args) {
  const result = spawnSync(tool, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error?.code === "ENOENT") {
    throw new Error(`${tool} no está instalado. Instala PostgreSQL Client para verificar el backup.`);
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${tool} terminó con código ${result.status}.`);
  }
  return result.stdout;
}

const backupFile = resolve(process.env.BACKUP_FILE?.trim() || process.argv[2] || "");
if (!backupFile) throw new Error("Define BACKUP_FILE o pasa la ruta del .dump.");
await access(backupFile);

const listing = run(process.env.PG_RESTORE_BIN?.trim() || "pg_restore", ["--list", backupFile]);
if (!listing.includes("TABLE") && !listing.includes("TABLE DATA")) {
  throw new Error("El archivo no parece contener una copia PostgreSQL válida.");
}

const bytes = await readFile(backupFile);
const sha256 = createHash("sha256").update(bytes).digest("hex");
let manifestStatus = "not_found";

try {
  const manifest = JSON.parse(await readFile(backupFile + ".json", "utf8"));
  if (!manifest.sha256 || manifest.sha256 !== sha256) {
    throw new Error("El SHA-256 del backup no coincide con su manifiesto.");
  }
  manifestStatus = "verified";
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    manifestStatus = "not_found";
  } else {
    throw error;
  }
}

console.log(JSON.stringify({
  success: true,
  backupFile,
  sha256,
  manifest: manifestStatus,
  archiveEntries: listing.split("\n").filter(Boolean).length,
}, null, 2));
