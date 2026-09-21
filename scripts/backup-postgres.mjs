import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL es obligatorio.");
  process.exit(1);
}

const outputDir = resolve(process.env.MOBIX_BACKUP_DIR?.trim() || "backups");
await mkdir(outputDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = resolve(outputDir, `mobix-${stamp}.dump`);
const metadataFile = file + ".json";

const dump = spawnSync("pg_dump", [
  "--format=custom",
  "--no-owner",
  "--no-privileges",
  "--file", file,
  databaseUrl,
], { stdio: "inherit" });

if (dump.status !== 0) {
  console.error("pg_dump falló. Verifica que PostgreSQL client tools estén instaladas y que DATABASE_URL sea accesible.");
  process.exit(dump.status || 1);
}

const verify = spawnSync("pg_restore", ["--list", file], { stdio: "ignore" });
if (verify.status !== 0) {
  console.error("El backup generado no pudo ser leído por pg_restore.");
  process.exit(1);
}

const bytes = await readFile(file);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const metadata = {
  service: "MOBIX",
  createdAt: new Date().toISOString(),
  file: basename(file),
  bytes: bytes.length,
  sha256,
  format: "PostgreSQL custom",
};

await writeFile(metadataFile, JSON.stringify(metadata, null, 2) + "\n", "utf8");
console.log(JSON.stringify(metadata, null, 2));
