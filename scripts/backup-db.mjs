import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function cliDatabaseUrl(raw) {
  const url = new URL(raw);
  url.searchParams.delete("schema");
  return url.toString();
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
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

async function checksum(path) {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

async function prune(directory, retentionDays) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;
  const threshold = Date.now() - retentionDays * 86_400_000;
  for (const entry of await readdir(directory)) {
    if (!entry.startsWith("mobix-") || (!entry.endsWith(".dump") && !entry.endsWith(".json"))) continue;
    const path = join(directory, entry);
    const info = await stat(path);
    if (info.mtimeMs < threshold) await rm(path, { force: true });
  }
}

const rawUrl = process.env.DATABASE_URL?.trim();
if (!rawUrl) throw new Error("DATABASE_URL no está configurada.");

const directory = resolve(process.env.MOBIX_BACKUP_DIR?.trim() || "backups");
const retentionDays = Number(process.env.MOBIX_BACKUP_RETENTION_DAYS || 30);
await mkdir(directory, { recursive: true });

const file = join(directory, `mobix-${stamp()}.dump`);
run(process.env.PG_DUMP_BIN?.trim() || "pg_dump", [
  "--format=custom",
  "--no-owner",
  "--no-privileges",
  "--file",
  file,
  cliDatabaseUrl(rawUrl),
]);

const info = await stat(file);
const sha256 = await checksum(file);
const manifest = {
  format: "postgres-custom",
  database: new URL(rawUrl).pathname.replace(/^\//, ""),
  createdAt: new Date().toISOString(),
  file: basename(file),
  bytes: info.size,
  sha256,
};

await writeFile(file + ".json", JSON.stringify(manifest, null, 2) + "\n", "utf8");
await prune(directory, retentionDays);

console.log(JSON.stringify({ success: true, ...manifest, path: file }, null, 2));
