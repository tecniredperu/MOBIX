import "dotenv/config";
import assert from "node:assert/strict";
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
const stamp = Date.now().toString(36).toUpperCase();
const roleName = `Auditor QA ${stamp}`;
const roleDescription = `Rol creado por auditoría E2E ${stamp}`;
const roleUpdatedDescription = `Rol actualizado por auditoría E2E ${stamp}`;
const userEmail = `qa-${stamp.toLowerCase()}@example.test`;
const initialPassword = "AuditPass123";
const resetPassword = "AuditReset456";
const branchCode = `QA-${stamp}`.slice(0, 20);
const warehouseCode = `WQ-${stamp}`.slice(0, 20);
const companyTradeName = `MOBIX QA ${stamp}`;
const ticketFooter = `Auditoría automática ${stamp}`;

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "google-chrome-stable",
    "google-chrome",
    "chromium-browser",
    "chromium",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const found = spawnSync(
      "bash",
      ["-lc", `command -v ${JSON.stringify(candidate)} 2>/dev/null || true`],
      { encoding: "utf8" },
    ).stdout.trim();
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

  close() {
    this.ws.close();
  }
}

async function waitJson(url, timeout = 15_000) {
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

async function waitDb(check, label, timeout = 12_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await delay(180);
  }
  throw new Error(`Timeout esperando en PostgreSQL: ${label}`);
}

async function createBrowser() {
  const chromePath = findChrome();
  const port = 9800 + Math.floor(Math.random() * 150);
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--metrics-recording-only",
    "--mute-audio",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/mobix-e2e-admin-${process.pid}-${Date.now()}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

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
    name: "mobix_session",
    value: sessionToken,
    domain: app.hostname,
    path: "/",
    httpOnly: true,
    secure: app.protocol === "https:",
    sameSite: "Lax",
    expires: Math.floor(Date.now() / 1000) + 3600,
  }, sessionId);

  const evaluate = async (expression) => {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Error de JavaScript en navegador.");
    return result.result?.value;
  };

  const waitFor = async (expression, label, timeout = 15_000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        if (await evaluate(`Boolean(${expression})`)) return;
      } catch {}
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
    const payload = JSON.stringify(String(value));
    const ok = await evaluate(`(() => {
      const el = ${expression};
      if (!el) return false;
      const proto = el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, ${payload});
      else el.value = ${payload};
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    if (!ok) throw new Error(`No se encontró ${description}`);
  };

  const setByLabel = (label, value) => setControl(`(() => {
    const n=(v)=>(v||"").replace(/\\s+/g," ").trim();
    const labelNode=[...document.querySelectorAll("label")].find(x=>n(x.querySelector("span")?.textContent).startsWith(${JSON.stringify(label)}));
    return labelNode?.querySelector("input,select,textarea");
  })()`, value, `campo ${label}`);

  const clickButton = async (text, scopeExpression = "document") => {
    const ok = await evaluate(`(() => {
      const root=${scopeExpression};
      if(!root) return false;
      const n=(v)=>(v||"").replace(/\\s+/g," ").trim();
      const button=[...root.querySelectorAll("button")].find(x=>n(x.textContent).includes(${JSON.stringify(text)}));
      if(!button || button.disabled) return false;
      button.click();
      return true;
    })()`);
    if (!ok) throw new Error(`No se pudo pulsar el botón ${text}`);
  };

  const stop = async () => {
    try { cdp.close(); } catch {}
    chrome.kill("SIGTERM");
    await delay(150);
    if (chrome.exitCode === null) chrome.kill("SIGKILL");
  };

  return { evaluate, waitFor, navigate, setControl, setByLabel, clickButton, stop };
}

async function auditSettings(browser, company) {
  console.log("E2E · Configuración");
  await browser.navigate("/configuracion");

  await browser.setByLabel("Nombre comercial", companyTradeName);
  await browser.clickButton("Guardar empresa");
  await browser.waitFor(
    `document.body.innerText.includes("Datos de empresa actualizados.")`,
    "actualización de empresa",
  );
  await waitDb(async () => {
    const row = await prisma.company.findUnique({ where: { id: company.id } });
    return row?.tradeName === companyTradeName ? row : null;
  }, "updateCompanyAction");

  await browser.setByLabel("Pie de ticket", ticketFooter);
  await browser.clickButton("Guardar parámetros");
  await browser.waitFor(
    `document.body.innerText.includes("Parámetros comerciales actualizados.")`,
    "actualización de parámetros",
  );
  await waitDb(async () => {
    const row = await prisma.companySettings.findUnique({ where: { companyId: company.id } });
    return row?.ticketFooter === ticketFooter ? row : null;
  }, "updateCompanySettingsAction");

  await browser.clickButton("Nueva sucursal");
  await browser.waitFor(
    `[...document.querySelectorAll(".settings-list-card")].some(x=>x.querySelector("h2")?.textContent==="Sucursales" && x.querySelector(".settings-entity-row input[placeholder='Nombre']"))`,
    "editor de nueva sucursal",
  );
  await browser.setControl(
    `[...document.querySelectorAll(".settings-list-card")].find(x=>x.querySelector("h2")?.textContent==="Sucursales")?.querySelector(".settings-entity-row input[placeholder='Nombre']")`,
    `Sucursal QA ${stamp}`,
    "nombre de sucursal QA",
  );
  await browser.setControl(
    `[...document.querySelectorAll(".settings-list-card")].find(x=>x.querySelector("h2")?.textContent==="Sucursales")?.querySelector(".settings-entity-row input[placeholder='Código']")`,
    branchCode,
    "código de sucursal QA",
  );
  await browser.clickButton(
    "Guardar",
    `[...document.querySelectorAll(".settings-list-card")].find(x=>x.querySelector("h2")?.textContent==="Sucursales")`,
  );
  await browser.waitFor(`document.body.innerText.includes("Sucursal creada.")`, "creación de sucursal");

  const branch = await waitDb(
    () => prisma.branch.findFirst({ where: { companyId: company.id, code: branchCode } }),
    "saveBranchAction",
  );

  await browser.clickButton("Nuevo almacén");
  await browser.waitFor(
    `[...document.querySelectorAll(".settings-list-card")].some(x=>x.querySelector("h2")?.textContent==="Almacenes" && x.querySelector(".settings-entity-row.warehouse input[placeholder='Nombre']"))`,
    "editor de nuevo almacén",
  );
  const warehouseSection = `[...document.querySelectorAll(".settings-list-card")].find(x=>x.querySelector("h2")?.textContent==="Almacenes")`;
  await browser.setControl(
    `${warehouseSection}?.querySelector(".settings-entity-row.warehouse input[placeholder='Nombre']")`,
    `Almacén QA ${stamp}`,
    "nombre de almacén QA",
  );
  await browser.setControl(
    `${warehouseSection}?.querySelector(".settings-entity-row.warehouse input[placeholder='Código']")`,
    warehouseCode,
    "código de almacén QA",
  );
  await browser.setControl(
    `${warehouseSection}?.querySelector(".settings-entity-row.warehouse select")`,
    branch.id,
    "sucursal del almacén QA",
  );
  await browser.clickButton("Guardar", warehouseSection);
  await browser.waitFor(`document.body.innerText.includes("Almacén creado.")`, "creación de almacén");

  const warehouse = await waitDb(
    () => prisma.warehouse.findFirst({ where: { companyId: company.id, code: warehouseCode } }),
    "saveWarehouseAction",
  );

  console.log(`✓ Configuración: empresa, parámetros, sucursal ${branch.code} y almacén ${warehouse.code} verificados.`);
  return { branch, warehouse };
}

async function auditRolesAndUsers(browser, company, branch) {
  console.log("E2E · Roles");
  await browser.navigate("/administracion/roles");
  await browser.clickButton("Nuevo rol");
  await browser.setByLabel("Nombre", roleName);
  await browser.setByLabel("Descripción", roleDescription);

  const checked = await browser.evaluate(`(() => {
    const editor=document.querySelector(".role-editor");
    const checkbox=editor?.querySelector('input[type="checkbox"]:not(:disabled)');
    if(!checkbox) return false;
    checkbox.click();
    return true;
  })()`);
  if (!checked) throw new Error("No se encontró un permiso habilitado para el rol QA.");

  await browser.clickButton("Crear rol");
  const role = await waitDb(
    () => prisma.role.findFirst({ where: { companyId: company.id, name: roleName } }),
    "createRoleAction",
  );

  await browser.waitFor(
    `[...document.querySelectorAll(".role-card")].some(x=>x.innerText.includes(${JSON.stringify(roleName)}))`,
    "rol QA visible",
  );

  const updated = await browser.evaluate(`(() => {
    const card=[...document.querySelectorAll(".role-card")].find(x=>x.innerText.includes(${JSON.stringify(roleName)}));
    if(!card) return false;
    const inputs=card.querySelectorAll("input");
    const description=inputs[1];
    if(!description) return false;
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    if(setter) setter.call(description,${JSON.stringify(roleUpdatedDescription)}); else description.value=${JSON.stringify(roleUpdatedDescription)};
    description.dispatchEvent(new Event("input",{bubbles:true}));
    description.dispatchEvent(new Event("change",{bubbles:true}));
    const button=[...card.querySelectorAll("button")].find(x=>x.textContent.includes("Guardar"));
    if(!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  if (!updated) throw new Error("No se pudo actualizar el rol QA.");

  await waitDb(async () => {
    const row = await prisma.role.findUnique({ where: { id: role.id } });
    return row?.description === roleUpdatedDescription ? row : null;
  }, "updateRoleAction");
  console.log(`✓ Rol ${roleName}: crear → actualizar verificado.`);

  console.log("E2E · Usuarios");
  await browser.navigate("/administracion/usuarios");
  await browser.clickButton("Nuevo usuario");
  await browser.setByLabel("Nombre completo", `Usuario QA ${stamp}`);
  await browser.setByLabel("Correo", userEmail);
  await browser.setByLabel("Celular", "977665544");
  await browser.setByLabel("Contraseña inicial", initialPassword);
  await browser.setByLabel("Rol", role.id);
  await browser.setByLabel("Sucursal predeterminada", branch.id);
  await browser.clickButton("Crear usuario");

  const membership = await waitDb(
    () => prisma.companyUser.findFirst({
      where: { companyId: company.id, user: { email: userEmail } },
      include: { user: true },
    }),
    "createUserAction",
  );
  assert.equal(membership.roleId, role.id);
  assert.equal(membership.defaultBranchId, branch.id);

  await browser.waitFor(
    `[...document.querySelectorAll(".admin-users-table tbody tr")].some(x=>x.innerText.includes(${JSON.stringify(userEmail)}))`,
    "usuario QA visible",
  );

  const rowExpr = `[...document.querySelectorAll(".admin-users-table tbody tr")].find(x=>x.innerText.includes(${JSON.stringify(userEmail)}))`;
  await browser.setControl(`${rowExpr}?.querySelectorAll("select")[2]`, "SUSPENDED", "estado de usuario QA");
  await browser.clickButton("Guardar", rowExpr);

  await waitDb(async () => {
    const row = await prisma.user.findUnique({ where: { id: membership.user.id } });
    return row?.status === "SUSPENDED" ? row : null;
  }, "updateUserAction");

  await browser.setControl(`${rowExpr}?.querySelectorAll("select")[2]`, "ACTIVE", "reactivación de usuario QA");
  await browser.clickButton("Guardar", rowExpr);
  await waitDb(async () => {
    const row = await prisma.user.findUnique({ where: { id: membership.user.id } });
    return row?.status === "ACTIVE" ? row : null;
  }, "updateUserAction reactivación");

  await browser.clickButton("Cambiar clave", rowExpr);
  await browser.setControl(`${rowExpr}?.querySelector('input[type="password"]')`, resetPassword, "nueva contraseña QA");
  await browser.clickButton("Aplicar", rowExpr);

  const resetUser = await waitDb(async () => {
    const row = await prisma.user.findUnique({ where: { id: membership.user.id } });
    return row && row.sessionVersion > membership.user.sessionVersion ? row : null;
  }, "resetUserPasswordAction");
  assert.notEqual(resetUser.passwordHash, membership.user.passwordHash);
  console.log(`✓ Usuario ${userEmail}: crear → suspender/reactivar → cambiar clave verificado.`);
}

async function main() {
  const company = await prisma.company.findFirstOrThrow({
    where: { ruc: "20123456789", status: "ACTIVE" },
  });

  const browser = await createBrowser();
  try {
    const { branch } = await auditSettings(browser, company);
    await auditRolesAndUsers(browser, company, branch);
    console.log("AUDITORÍA E2E ADMINISTRACIÓN OK");
  } finally {
    await browser.stop();
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
