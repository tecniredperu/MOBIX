import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const rawBaseUrl = process.env.MOBIX_BASE_URL?.trim() || "";
const healthToken = process.env.HEALTH_DETAILS_TOKEN?.trim() || "";
const expectedCommit = process.env.MOBIX_EXPECTED_COMMIT?.trim() || "";
const maxHealthMs = Number(process.env.MOBIX_MAX_HEALTH_MS || 1500);
const allowHttp = process.env.MOBIX_ALLOW_HTTP === "1";

const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  const prefix = ok ? "PASS" : "FAIL";
  console.log(`[${prefix}] ${name}: ${detail}`);
}

function failFast(message) {
  console.error("[MOBIX Go-Live] " + message);
  process.exit(1);
}

if (!rawBaseUrl) failFast("Define MOBIX_BASE_URL con el dominio final.");
if (!healthToken) failFast("Define HEALTH_DETAILS_TOKEN para validar el health protegido.");

let baseUrl;
try {
  baseUrl = new URL(rawBaseUrl);
} catch {
  failFast("MOBIX_BASE_URL no es una URL válida.");
}

const localHost = ["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname);
if (baseUrl.protocol !== "https:" && !(allowHttp && localHost)) {
  failFast("Go-Live requiere HTTPS. MOBIX_ALLOW_HTTP=1 solo se admite para localhost.");
}
baseUrl.pathname = baseUrl.pathname.replace(/\/$/, "");

async function request(path, options = {}) {
  const started = performance.now();
  const response = await fetch(new URL(path, baseUrl), options);
  return { response, elapsedMs: Math.round(performance.now() - started) };
}

let publicHealth;
try {
  const { response, elapsedMs } = await request("/api/health", {
    headers: { "cache-control": "no-cache" },
  });
  record("Health público HTTP", response.status === 200, `HTTP ${response.status}`);
  publicHealth = await response.json();
  record("Health público estado", publicHealth.status === "ok", JSON.stringify(publicHealth));
  record(
    "Latencia health",
    elapsedMs <= maxHealthMs,
    `${elapsedMs} ms (máximo configurado: ${maxHealthMs} ms)`,
  );

  const forbidden = ["modules", "commit", "environment", "uptimeSeconds", "databaseLatencyMs", "migration", "schema"];
  const leaked = forbidden.filter((key) => Object.prototype.hasOwnProperty.call(publicHealth, key));
  record("Health público mínimo", leaked.length === 0, leaked.length ? "Expone: " + leaked.join(", ") : "Sin detalles internos");
} catch (error) {
  record("Health público", false, error instanceof Error ? error.message : String(error));
}

let privateHealth;
try {
  const { response, elapsedMs } = await request("/api/health", {
    headers: {
      "cache-control": "no-cache",
      "x-mobix-health-token": healthToken,
    },
  });
  record("Health protegido HTTP", response.status === 200, `HTTP ${response.status}; ${elapsedMs} ms`);
  privateHealth = await response.json();

  const operational =
    privateHealth.status === "ok"
    && privateHealth.database === "ok"
    && privateHealth.schema === "ok"
    && privateHealth.migration === "ok"
    && privateHealth.modules?.security === true;
  record("Health protegido operativo", operational, JSON.stringify(privateHealth));

  if (expectedCommit) {
    const actual = String(privateHealth.commit || "");
    record(
      "Commit desplegado",
      actual === expectedCommit || actual.startsWith(expectedCommit) || expectedCommit.startsWith(actual),
      `esperado=${expectedCommit}; actual=${actual || "sin commit"}`,
    );
  } else {
    record("Commit desplegado", Boolean(privateHealth.commit), String(privateHealth.commit || "sin commit"));
  }
} catch (error) {
  record("Health protegido", false, error instanceof Error ? error.message : String(error));
}

try {
  const { response } = await request("/login", { redirect: "manual" });
  record("Login accesible", response.status === 200, `HTTP ${response.status}`);

  const security = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
  };
  for (const [header, expected] of Object.entries(security)) {
    const actual = response.headers.get(header) || "";
    record(`Cabecera ${header}`, actual.toLowerCase() === expected.toLowerCase(), actual || "ausente");
  }

  const permissions = response.headers.get("permissions-policy") || "";
  record("Permissions-Policy", permissions.length > 0, permissions || "ausente");

  if (baseUrl.protocol === "https:") {
    const hsts = response.headers.get("strict-transport-security") || "";
    record("HSTS", /max-age=\d+/.test(hsts), hsts || "ausente");
  }
} catch (error) {
  record("Cabeceras de seguridad", false, error instanceof Error ? error.message : String(error));
}

try {
  const { response } = await request("/productos", { redirect: "manual" });
  const location = response.headers.get("location") || "";
  const protectedRoute = [307, 308, 302, 303].includes(response.status) && location.includes("/login");
  record("Ruta protegida sin sesión", protectedRoute, `HTTP ${response.status}; location=${location || "ausente"}`);
} catch (error) {
  record("Ruta protegida sin sesión", false, error instanceof Error ? error.message : String(error));
}

const passed = checks.filter((check) => check.ok).length;
const failed = checks.length - passed;
const report = {
  service: "MOBIX",
  baseUrl: baseUrl.toString(),
  checkedAt: new Date().toISOString(),
  expectedCommit: expectedCommit || null,
  actualCommit: privateHealth?.commit || null,
  passed,
  failed,
  go: failed === 0,
  checks,
};

const outputDir = resolve("artifacts/go-live");
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "go-live-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");

const markdown = [
  "# MOBIX Go-Live Report",
  "",
  `- URL: ${report.baseUrl}`,
  `- Fecha: ${report.checkedAt}`,
  `- Commit esperado: ${report.expectedCommit || "no indicado"}`,
  `- Commit desplegado: ${report.actualCommit || "no disponible"}`,
  `- Resultado: **${report.go ? "GO técnico" : "NO-GO"}**`,
  `- Checks: ${passed} PASS / ${failed} FAIL`,
  "",
  "| Check | Resultado | Detalle |",
  "|---|---|---|",
  ...checks.map((check) => `| ${check.name} | ${check.ok ? "PASS" : "FAIL"} | ${String(check.detail).replace(/\|/g, "\\|")} |`),
  "",
].join("\n");
await writeFile(resolve(outputDir, "go-live-report.md"), markdown, "utf8");

if (failed > 0) process.exit(1);
console.log("MOBIX Go-Live técnico: GO");
