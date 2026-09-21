import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL es obligatorio.");
  process.exit(1);
}

function postgresEnv(connectionString) {
  const url = new URL(connectionString);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
    ...(url.searchParams.get("sslmode") ? { PGSSLMODE: url.searchParams.get("sslmode") } : {}),
  };
}

const outputDir = resolve(process.env.MOBIX_BACKUP_DIR?.trim() || "backups");
await mkdir(outputDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = resolve(outputDir, `mobix-${stamp}.dump`);
const metadataFile = file + ".json";

const pgEnv = postgresEnv(databaseUrl);
const dump = spawnSync("pg_dump", [
  "--format=custom",
  "--no-owner",
  "--no-privileges",
  "--file", file,
], { stdio: "inherit", env: pgEnv });

if (dump.status !== 0) {
  console.error("pg_dump falló. Verifica que PostgreSQL client tools estén instaladas y que DATABASE_URL sea accesible.");
  process.exit(dump.status || 1);
}

const verify = spawnSync("pg_restore", ["--list", file], { stdio: "ignore", env: pgEnv });
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
