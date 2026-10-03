import { chromium } from "playwright";

const baseURL = process.env.MOBIX_BASE_URL || "http://127.0.0.1:3001";
const password = process.env.MOBIX_BOOTSTRAP_PASSWORD;

if (!password) {
  throw new Error("MOBIX_BOOTSTRAP_PASSWORD es obligatorio para la auditoría E2E.");
}

function parsePen(text) {
  const cleaned = String(text || "")
    .replace(/[^0-9,.-]/g, "")
    .replace(/,/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) throw new Error(`No se pudo interpretar importe PEN: ${text}`);
  return value;
}

async function expectVisible(locator, message) {
  await locator.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {
    throw new Error(message);
  });
}

async function login(page) {
  await page.goto(`${baseURL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Correo electrónico").fill("admin@mobix.pe");
  await page.getByLabel("Contraseña").fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 }),
    page.getByRole("button", { name: "Iniciar sesión" }).click(),
  ]);
}

async function testCustomer(page) {
  await page.goto(`${baseURL}/clientes/nuevo`, { waitUntil: "networkidle" });
  await page.getByLabel("N.º documento").fill("87654321");
  await page.getByLabel("Nombre completo").fill("Cliente Auditoría E2E");
  await page.getByLabel("Celular / WhatsApp").fill("999888777");
  await page.getByLabel("Correo").fill("cliente.e2e@example.test");

  await Promise.all([
    page.waitForURL(/\/clientes\/[A-Za-z0-9-]+$/, { timeout: 15_000 }),
    page.getByRole("button", { name: /Guardar cliente/i }).click(),
  ]);

  await expectVisible(
    page.getByText("Cliente Auditoría E2E", { exact: true }),
    "El cliente se guardó pero su detalle no mostró el nombre esperado.",
  );
}

async function testSupplier(page) {
  await page.goto(`${baseURL}/proveedores`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Nuevo proveedor/i }).click();

  await page.getByLabel("N.º de documento").fill("20987654321");
  await page.getByLabel("Razón social / nombre").fill("Proveedor Auditoría E2E S.A.C.");
  await page.getByLabel("Persona de contacto").fill("Control E2E");
  await page.getByLabel("Teléfono").fill("988777666");
  await page.getByLabel("Correo").fill("proveedor.e2e@example.test");
  await page.getByLabel("Dirección").fill("Moyobamba, San Martín");

  await page.getByRole("button", { name: /Guardar proveedor/i }).click();
  await expectVisible(
    page.getByText("Proveedor registrado correctamente.", { exact: true }),
    "La acción de guardar proveedor no confirmó el registro.",
  );
  await expectVisible(
    page.getByText("Proveedor Auditoría E2E S.A.C.", { exact: true }),
    "El proveedor guardado no apareció en la lista.",
  );
}

async function closeCurrentCashIfNeeded(page) {
  await page.goto(`${baseURL}/caja`, { waitUntil: "networkidle" });

  const openChip = page.getByText("Caja abierta", { exact: true });
  if (!(await openChip.isVisible().catch(() => false))) return;

  const expectedText = await page.locator(".cash-summary-card.emphasis strong").first().textContent();
  const expected = parsePen(expectedText);
  await page.getByLabel("Efectivo contado").fill(expected.toFixed(2));
  await page.getByRole("button", { name: "Confirmar cierre de caja" }).click();

  await expectVisible(
    page.getByText(/Caja cerrada/i).first(),
    "No se confirmó el cierre de la caja preexistente.",
  );

  await page.goto(`${baseURL}/caja`, { waitUntil: "networkidle" });
  await expectVisible(
    page.getByText("Caja cerrada", { exact: true }),
    "La caja siguió abierta después del cierre.",
  );
}

async function testCashLifecycle(page) {
  await closeCurrentCashIfNeeded(page);

  await page.getByLabel("Fondo inicial de efectivo").fill("100");
  await page.getByLabel("Observación de apertura").fill("Auditoría automática E2E");
  await page.getByRole("button", { name: /Abrir caja/i }).click();
  await expectVisible(
    page.getByText("Caja abierta correctamente.", { exact: true }),
    "No se confirmó la apertura de caja.",
  );

  await page.getByLabel("Tipo").selectOption("INCOME");
  await page.getByLabel("Importe").fill("5");
  await page.getByLabel("Concepto / motivo").fill("Ingreso de prueba E2E");
  await page.getByLabel("Referencia").fill("E2E-CASH-001");
  await page.getByRole("button", { name: "Registrar movimiento" }).click();
  await expectVisible(
    page.getByText("Movimiento registrado.", { exact: true }),
    "No se confirmó el movimiento manual de caja.",
  );

  const expectedText = await page.locator(".cash-summary-card.emphasis strong").first().textContent();
  const expected = parsePen(expectedText);
  if (Math.abs(expected - 105) > 0.01) {
    throw new Error(`Caja E2E inconsistente: se esperaba S/ 105.00 y la UI mostró ${expectedText}`);
  }

  await page.getByLabel("Efectivo contado").fill(expected.toFixed(2));
  await page.getByRole("button", { name: "Confirmar cierre de caja" }).click();
  await expectVisible(
    page.getByText(/Caja cerrada y cuadrada correctamente/i),
    "La caja E2E no cerró cuadrada.",
  );

  await page.goto(`${baseURL}/caja`, { waitUntil: "networkidle" });
  await expectVisible(
    page.getByText("Caja cerrada", { exact: true }),
    "La caja E2E permaneció abierta tras el cierre.",
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "es-PE",
    timezoneId: "America/Lima",
  });
  const page = await context.newPage();

  page.on("pageerror", (error) => {
    console.error("[browser-pageerror]", error);
  });
  page.on("console", (message) => {
    if (message.type() === "error") console.error("[browser-console]", message.text());
  });

  try {
    await login(page);
    await testCustomer(page);
    await testSupplier(page);
    await testCashLifecycle(page);
    console.log("✓ Auditoría E2E crítica: login, cliente, proveedor y caja OK.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
