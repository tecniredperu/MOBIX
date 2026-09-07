import { spawnSync } from "node:child_process";

const allowedHighPackages = new Set(["deepmerge-ts", "mysql2", "@prisma/config", "prisma"]);

const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});

let report;
try {
  report = JSON.parse(result.stdout || "{}");
} catch {
  console.error("No se pudo interpretar la salida de npm audit.");
  console.error(result.stdout || result.stderr);
  process.exit(1);
}

const vulnerabilities = Object.entries(report.vulnerabilities ?? {});
const blockers = [];
const accepted = [];

for (const [name, info] of vulnerabilities) {
  const severity = String(info?.severity ?? "").toLowerCase();
  if (!['high', 'critical'].includes(severity)) continue;

  if (severity === "high" && allowedHighPackages.has(name)) {
    accepted.push({ name, severity });
    continue;
  }
  blockers.push({ name, severity });
}

if (accepted.length) {
  console.warn("Avisos High conocidos de la cadena Prisma CLI (excepción temporal y explícita):");
  for (const item of accepted) console.warn(`- ${item.name}: ${item.severity}`);
  console.warn("Estos avisos deben revisarse en cada actualización de Prisma; no se aceptan nuevas vulnerabilidades High/Critical fuera de esta lista.");
}

if (blockers.length) {
  console.error("Se detectaron vulnerabilidades High/Critical no autorizadas:");
  for (const item of blockers) console.error(`- ${item.name}: ${item.severity}`);
  process.exit(1);
}

console.log("Auditoría de dependencias: sin vulnerabilidades High/Critical nuevas fuera de las excepciones Prisma documentadas.");
