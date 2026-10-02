import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
const sessionToken = process.env.MOBIX_SESSION_TOKEN?.trim();
const baseUrl = (process.env.MOBIX_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
if (!connectionString) throw new Error("DATABASE_URL es obligatorio.");
if (!sessionToken) throw new Error("MOBIX_SESSION_TOKEN es obligatorio.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const mode = process.argv[2] || "core";
const stamp = Date.now().toString(36).toUpperCase();

function findChrome() {
  const candidates = [process.env.CHROME_BIN, "google-chrome-stable", "google-chrome", "chromium-browser", "chromium"].filter(Boolean);
  for (const candidate of candidates) {
    const found = spawnSync("bash", ["-lc", `command -v ${JSON.stringify(candidate)} 2>/dev/null || true`], { encoding: "utf8" }).stdout.trim();
    if (found) return found;
  }
  throw new Error("No se encontró Chrome/Chromium en el runner.");
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result || {});
    });
  }
  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      const open = () => { cleanup(); resolve(); };
      const error = () => { cleanup(); reject(new Error("No se pudo abrir Chrome DevTools Protocol.")); };
      const cleanup = () => {
        this.ws.removeEventListener("open", open);
        this.ws.removeEventListener("error", error);
      };
      this.ws.addEventListener("open", open);
      this.ws.addEventListener("error", error);
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  close() { this.ws.close(); }
}

async function waitJson(url, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await delay(150);
  }
  throw new Error("Chrome no publicó CDP a tiempo.");
}

async function createBrowser() {
  const chromePath = findChrome();
  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(chromePath, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-default-apps", "--disable-extensions", "--disable-sync",
    "--metrics-recording-only", "--mute-audio", `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/mobix-e2e-ops-${process.pid}-${Date.now()}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  let stderr = "";
  chrome.stderr.on("data", (chunk) => { stderr += String(chunk); });

  const version = await waitJson(`http://127.0.0.1:${port}/json/version`);
  const cdp = new CdpClient(version.webSocketDebuggerUrl);
  await cdp.ready();
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Network.enable", {}, sessionId);

  const app = new URL(baseUrl);
  await cdp.send("Network.setCookie", {
    name: "mobix_session", value: sessionToken, domain: app.hostname, path: "/", httpOnly: true,
    secure: app.protocol === "https:", sameSite: "Lax", expires: Math.floor(Date.now() / 1000) + 3600,
  }, sessionId);

  const evaluate = async (expression) => {
    const result = await cdp.send("Runtime.evaluate", {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Error de JavaScript en navegador.");
    return result.result?.value;
  };

  const waitFor = async (expression, label, timeout = 15000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try { if (await evaluate(`Boolean(${expression})`)) return; } catch {}
      await delay(150);
    }
    const state = await evaluate(`({url:location.href,text:document.body?.innerText?.slice(0,5000)||""})`);
    throw new Error(`Timeout esperando ${label}: ${JSON.stringify(state)}`);
  };

  const navigate = async (path) => {
    await cdp.send("Page.navigate", { url: `${baseUrl}${path}` }, sessionId);
    await waitFor(`document.readyState === "complete"`, `carga de ${path}`);
    await waitFor(`location.pathname !== "/login"`, `sesión autenticada en ${path}`, 5000);
  };

  const setControl = async (expression, value, description) => {
    const ok = await evaluate(`(() => {
      const el = ${expression};
      if (!el) return false;
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, ${JSON.stringify(String(value))}); else el.value = ${JSON.stringify(String(value))};
      el.dispatchEvent(new Event("input",{bubbles:true}));
      el.dispatchEvent(new Event("change",{bubbles:true}));
      return true;
    })()`);
    if (!ok) throw new Error(`No se encontró ${description}`);
  };

  const setByLabel = async (label, value) => setControl(`(() => {
    const n=(v)=>(v||"").replace(/\\s+/g," ").trim();
    const labelNode=[...document.querySelectorAll("label")].find(x=>n(x.querySelector("span")?.textContent).startsWith(${JSON.stringify(label)}));
    return labelNode?.querySelector("input,select,textarea");
  })()`, value, `campo ${label}`);

  const clickButton = async (text) => {
    const ok = await evaluate(`(() => {
      const n=(v)=>(v||"").replace(/\\s+/g," ").trim();
      const button=[...document.querySelectorAll("button")].find(x=>n(x.textContent).includes(${JSON.stringify(text)}));
      if(!button || button.disabled) return false;
      button.click(); return true;
    })()`);
    if (!ok) throw new Error(`No se pudo pulsar ${text}`);
  };

  const stop = async () => {
    try { cdp.close(); } catch {}
    chrome.kill("SIGTERM");
    await delay(150);
    if (chrome.exitCode === null) chrome.kill("SIGKILL");
    if (stderr && process.env.MOBIX_E2E_DEBUG === "1") console.error(stderr);
  };

  return { evaluate, waitFor, navigate, setControl, setByLabel, clickButton, stop };
}

async function waitDb(check, label, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await delay(180);
  }
  throw new Error(`Timeout esperando en PostgreSQL: ${label}`);
}

async function coreAudit() {
  const company = await prisma.company.findFirstOrThrow({ where: { ruc: "20123456789", status: "ACTIVE" } });
  const source = await prisma.warehouse.findFirstOrThrow({
    where: { companyId: company.id, code: "ALM-01", status: "ACTIVE" },
  });
  const customer = await prisma.customer.findFirst({
    where: { companyId: company.id, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });
  if (!customer) throw new Error("No existe un cliente activo para probar Servicio Técnico.");

  const branch = await prisma.branch.create({
    data: { companyId: company.id, name: `Sucursal E2E ${stamp}`, code: `E2E-${stamp}`.slice(0, 20) },
  });
  const destination = await prisma.warehouse.create({
    data: {
      companyId: company.id, branchId: branch.id, name: `Almacén E2E ${stamp}`,
      code: `W-${stamp}`.slice(0, 20), isSaleable: true,
    },
  });

  const accessory = await prisma.productVariant.findFirst({
    where: {
      companyId: company.id, status: "ACTIVE",
      product: { type: "ACCESSORY", status: "ACTIVE", deletedAt: null },
      inventoryBalances: { some: { warehouseId: source.id, quantity: { gte: 2 } } },
    },
    include: { product: true },
    orderBy: { createdAt: "asc" },
  });
  if (!accessory) throw new Error("No existe accesorio con stock suficiente para transferencia E2E.");

  const initialSource = await prisma.inventoryBalance.findUniqueOrThrow({
    where: { companyId_warehouseId_variantId: { companyId: company.id, warehouseId: source.id, variantId: accessory.id } },
  });
  const transferNote = `Transferencia E2E ${stamp}`;
  const serviceIdentifier = `E2E-SRV-${stamp}`;

  const browser = await createBrowser();
  try {
    console.log("E2E · Transferencias");
    await browser.navigate("/transferencias/nueva");
    await browser.setByLabel("Almacén origen", source.id);
    await browser.setByLabel("Almacén destino", destination.id);
    await browser.waitFor(
      `[...document.querySelectorAll(".transfer-product-list article")].some(x=>x.innerText.includes(${JSON.stringify(accessory.product.name)}))`,
      "producto transferible",
    );
    const selected = await browser.evaluate(`(() => {
      const article=[...document.querySelectorAll(".transfer-product-list article")].find(x=>x.innerText.includes(${JSON.stringify(accessory.product.name)}));
      const checkbox=article?.querySelector('input[type="checkbox"]');
      if(!checkbox) return false;
      checkbox.click(); return true;
    })()`);
    if (!selected) throw new Error("No se pudo seleccionar el accesorio de transferencia.");
    await browser.setControl(
      `[...document.querySelectorAll(".transfer-product-list article")].find(x=>x.innerText.includes(${JSON.stringify(accessory.product.name)}))?.querySelector("input.transfer-qty")`,
      "2", "cantidad de transferencia",
    );
    await browser.setByLabel("Observación", transferNote);
    await browser.clickButton("Enviar transferencia");

    const transfer = await waitDb(
      () => prisma.stockTransfer.findFirst({
        where: { companyId: company.id, fromWarehouseId: source.id, toWarehouseId: destination.id, notes: transferNote },
        orderBy: { createdAt: "desc" },
      }),
      "transferencia creada",
    );
    assert.equal(transfer.status, "IN_TRANSIT");
    await browser.waitFor(`location.pathname === "/transferencias"`, "redirección a transferencias");

    const received = await browser.evaluate(`(() => {
      const row=[...document.querySelectorAll("tbody tr")].find(x=>x.innerText.includes(${JSON.stringify(transfer.transferNumber)}));
      const button=[...(row?.querySelectorAll("button")||[])].find(x=>x.innerText.includes("Recibir"));
      if(!button || button.disabled) return false;
      button.click(); return true;
    })()`);
    if (!received) throw new Error("No se encontró la acción Recibir de la transferencia.");

    await waitDb(
      async () => (await prisma.stockTransfer.findUnique({ where: { id: transfer.id } }))?.status === "RECEIVED",
      "recepción de transferencia",
    );

    const sourceAfter = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { companyId_warehouseId_variantId: { companyId: company.id, warehouseId: source.id, variantId: accessory.id } },
    });
    const destAfter = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { companyId_warehouseId_variantId: { companyId: company.id, warehouseId: destination.id, variantId: accessory.id } },
    });
    assert.equal(Number(sourceAfter.quantity), Number(initialSource.quantity) - 2);
    assert.equal(Number(destAfter.quantity), 2);
    console.log(`✓ Transferencia ${transfer.transferNumber}: crear → recibir → stocks verificados.`);

    console.log("E2E · Servicio Técnico");
    await browser.navigate("/servicio-tecnico/nuevo");
    await browser.clickButton("Equipo externo");
    await browser.waitFor(`document.body.innerText.includes("Servicio técnico sin venta previa")`, "modo equipo externo");
    await browser.setByLabel("Buscar cliente", customer.businessName || customer.firstName || "");
    await browser.waitFor(
      `[...document.querySelectorAll("select option")].some(x=>x.value===${JSON.stringify(customer.id)})`,
      "cliente disponible en servicio",
    );
    await browser.setByLabel("Cliente", customer.id);
    await browser.setByLabel("Equipo", `Equipo auditoría ${stamp}`);
    await browser.setByLabel("Marca", "MOBIX QA");
    await browser.setByLabel("Modelo", "E2E-01");
    await browser.setByLabel("IMEI / serie", serviceIdentifier);
    await browser.setByLabel("Falla reportada *", "Equipo no enciende durante la prueba funcional E2E.");
    await browser.setByLabel("Estado físico al recibir", "Sin daños visibles.");
    await browser.setByLabel("Accesorios entregados", "Cable USB");
    await browser.setByLabel("Costo estimado", "35");
    await browser.clickButton("Registrar recepción");

    const order = await waitDb(
      () => prisma.serviceOrder.findFirst({ where: { companyId: company.id, identifier: serviceIdentifier }, orderBy: { receivedAt: "desc" } }),
      "orden de servicio creada",
    );
    assert.equal(order.status, "RECEIVED");
    await browser.waitFor(`location.pathname === "/servicio-tecnico/${order.id}"`, "detalle de servicio técnico");

    await browser.setByLabel("Estado", "DIAGNOSIS");
    await browser.setByLabel("Diagnóstico", "Diagnóstico E2E: batería descargada.");
    await browser.setByLabel("Trabajo realizado", "Prueba de carga y encendido.");
    await browser.setByLabel("Costo final", "35");
    await browser.setByLabel("Nota para el historial", "Actualización automática de auditoría funcional.");
    await browser.clickButton("Guardar seguimiento");
    await browser.waitFor(`document.body.innerText.includes("Seguimiento actualizado correctamente.")`, "actualización de servicio");

    const updatedOrder = await waitDb(
      async () => {
        const row = await prisma.serviceOrder.findUnique({ where: { id: order.id } });
        return row?.status === "DIAGNOSIS" ? row : null;
      },
      "estado DIAGNOSIS",
    );
    assert.equal(updatedOrder.diagnosis, "Diagnóstico E2E: batería descargada.");
    const event = await prisma.serviceOrderEvent.findFirst({ where: { serviceOrderId: order.id, status: "DIAGNOSIS" } });
    assert.ok(event, "El cambio de Servicio Técnico no generó evento.");
    console.log(`✓ Servicio ${order.serviceNumber}: recepción → diagnóstico → bitácora verificada.`);
  } finally {
    await browser.stop();
  }
}

async function returnAudit() {
  const responsePath = process.env.MOBIX_POS_SALE_RESPONSE || "/tmp/mobix-pos-sale-response.json";
  const response = JSON.parse(await readFile(responsePath, "utf8"));
  const saleId = response.sale?.id;
  if (!saleId) throw new Error("No se encontró sale.id de la venta POS real.");

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { items: { include: { product: true } } },
  });
  if (!sale) throw new Error("La venta POS no existe.");
  const item = sale.items.find((row) => row.product.type === "ACCESSORY");
  if (!item) throw new Error("La venta POS no contiene accesorio para devolver.");

  const before = await prisma.inventoryBalance.findUniqueOrThrow({
    where: {
      companyId_warehouseId_variantId: {
        companyId: sale.companyId, warehouseId: sale.warehouseId, variantId: item.variantId,
      },
    },
  });

  const reason = `Devolución E2E ${stamp}`;
  const browser = await createBrowser();
  try {
    console.log("E2E · Devoluciones");
    await browser.navigate("/devoluciones/nueva");
    await browser.setByLabel("Venta original", sale.id);
    await browser.waitFor(
      `[...document.querySelectorAll(".return-items article")].some(x=>x.innerText.includes(${JSON.stringify(item.product.name)}))`,
      "línea vendida para devolución",
    );
    const checked = await browser.evaluate(`(() => {
      const article=[...document.querySelectorAll(".return-items article")].find(x=>x.innerText.includes(${JSON.stringify(item.product.name)}));
      const checkbox=article?.querySelector('input[type="checkbox"]');
      if(!checkbox || checkbox.disabled) return false;
      checkbox.click(); return true;
    })()`);
    if (!checked) throw new Error("No se pudo seleccionar el producto a devolver.");
    await browser.setByLabel("Motivo *", reason);
    await browser.clickButton("Confirmar operación");

    const order = await waitDb(
      () => prisma.returnOrder.findFirst({
        where: { companyId: sale.companyId, saleId: sale.id, reason },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      }),
      "devolución creada",
    );
    assert.equal(order.status, "COMPLETED");
    assert.equal(order.refundMethod, "CASH");
    assert.ok(order.refundCashSessionId, "La devolución en efectivo no quedó vinculada a caja.");
    assert.equal(order.items.length, 1);
    assert.equal(Number(order.refundAmount), Number(item.total));

    await browser.waitFor(`location.pathname === "/devoluciones"`, "redirección de devolución");

    const after = await prisma.inventoryBalance.findUniqueOrThrow({
      where: {
        companyId_warehouseId_variantId: {
          companyId: sale.companyId, warehouseId: sale.warehouseId, variantId: item.variantId,
        },
      },
    });
    assert.equal(Number(after.quantity), Number(before.quantity) + 1);
    const movement = await prisma.inventoryMovement.findFirst({
      where: { companyId: sale.companyId, referenceType: "RETURN", referenceId: order.id, movementType: "RETURN_IN" },
    });
    assert.ok(movement, "La devolución no generó movimiento RETURN_IN.");
    const cashMovement = await prisma.cashMovement.findFirst({
      where: { companyId: sale.companyId, reference: order.id, type: "EXPENSE" },
    });
    assert.ok(cashMovement, "La devolución en efectivo no generó egreso de caja.");
    console.log(`✓ Devolución ${order.returnNumber}: reembolso → stock → kardex → caja verificados.`);
  } finally {
    await browser.stop();
  }
}

try {
  if (mode === "core") await coreAudit();
  else if (mode === "return") await returnAudit();
  else throw new Error(`Modo desconocido: ${mode}`);
  console.log(`AUDITORÍA E2E OPERACIONES ${mode.toUpperCase()} OK`);
} finally {
  await prisma.$disconnect();
}
