const databaseUrl = process.env.DATABASE_URL?.trim();
const authSecret = process.env.AUTH_SECRET?.trim();
const bootstrapPassword = process.env.MOBIX_BOOTSTRAP_PASSWORD?.trim();

const errors = [];

if (!databaseUrl) {
  errors.push("DATABASE_URL no está configurada.");
} else {
  try {
    const url = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) {
      errors.push("DATABASE_URL debe apuntar a PostgreSQL.");
    }
    if (!url.hostname) errors.push("DATABASE_URL no contiene host.");
    if (!url.pathname || url.pathname === "/") errors.push("DATABASE_URL no contiene nombre de base.");
  } catch {
    errors.push("DATABASE_URL no es una URL PostgreSQL válida.");
  }
}

if (!authSecret || authSecret.length < 32) {
  errors.push("AUTH_SECRET debe tener al menos 32 caracteres en producción.");
}
if (authSecret && /change|example|password|secret123|mobix-development/i.test(authSecret)) {
  errors.push("AUTH_SECRET parece un valor de ejemplo o desarrollo.");
}

if (bootstrapPassword) {
  if (bootstrapPassword.length < 10) {
    errors.push("MOBIX_BOOTSTRAP_PASSWORD debe tener al menos 10 caracteres.");
  }
  if (!/[A-ZÁÉÍÓÚÑ]/.test(bootstrapPassword) || !/[a-záéíóúñ]/.test(bootstrapPassword) || !/[0-9]/.test(bootstrapPassword)) {
    errors.push("MOBIX_BOOTSTRAP_PASSWORD debe incluir mayúsculas, minúsculas y números.");
  }
}

if (errors.length) {
  console.error("Configuración de producción inválida:");
  for (const error of errors) console.error("- " + error);
  process.exit(1);
}

console.log("✓ Configuración crítica de producción validada.");
