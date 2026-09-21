import process from "node:process";

function fail(message) {
  console.error("[MOBIX production check] " + message);
  process.exitCode = 1;
}

const databaseUrl = process.env.DATABASE_URL?.trim() || "";
const authSecret = process.env.AUTH_SECRET?.trim() || "";
const trustProxy = process.env.TRUST_PROXY_HEADERS;
const healthToken = process.env.HEALTH_DETAILS_TOKEN?.trim() || "";

if (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) {
  fail("DATABASE_URL debe apuntar a PostgreSQL.");
}

if (authSecret.length < 32) {
  fail("AUTH_SECRET debe tener al menos 32 caracteres.");
}

if (process.env.NODE_ENV === "production" && authSecret.includes("development-only")) {
  fail("AUTH_SECRET no puede usar el secreto de desarrollo.");
}

if (trustProxy && !["true", "false"].includes(trustProxy)) {
  fail("TRUST_PROXY_HEADERS solo acepta true o false.");
}

if (healthToken && healthToken.length < 24) {
  fail("HEALTH_DETAILS_TOKEN debe tener al menos 24 caracteres si se configura.");
}

if (process.env.MOBIX_BOOTSTRAP_PASSWORD && process.env.MOBIX_BOOTSTRAP_PASSWORD.length < 10) {
  fail("MOBIX_BOOTSTRAP_PASSWORD debe tener al menos 10 caracteres si se configura.");
}

if (!process.exitCode) {
  console.log("MOBIX production check: OK");
}
