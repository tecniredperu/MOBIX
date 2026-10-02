import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const baseUrl = (process.env.MOBIX_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const sessionToken = process.env.MOBIX_SESSION_TOKEN?.trim();
if (!sessionToken) throw new Error('MOBIX_SESSION_TOKEN es obligatorio para la auditoría E2E del navegador.');

const stamp = Date.now().toString().slice(-8);
const customerName = `Cliente Auditoria ${stamp}`;
const customerDni = String(Date.now()).slice(-8);
const supplierName = `Proveedor Auditoria ${stamp}`;
const supplierRuc = `20${String(Date.now()).slice(-9)}`;

function findChrome() {
  const candidates = [process.env.CHROME_BIN, 'google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium'].filter(Boolean);
  for (const candidate of candidates) {
    const found = spawnSync('bash', ['-lc', `command -v ${JSON.stringify(candidate)} 2>/dev/null || true`], { encoding: 'utf8' }).stdout.trim();
    if (found) return found;
  }
  throw new Error('No se encontró Chrome/Chromium en el runner.');
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result || {});
    });
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      const onOpen = () => { cleanup(); resolve(); };
      const onError = (event) => { cleanup(); reject(new Error(`No se pudo abrir CDP: ${event?.message || 'WebSocket error'}`)); };
      const cleanup = () => {
        this.ws.removeEventListener('open', onOpen);
        this.ws.removeEventListener('error', onError);
      };
      this.ws.addEventListener('open', onOpen);
      this.ws.addEventListener('error', onError);
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

async function waitForJson(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) { lastError = error; }
    await delay(150);
  }
  throw new Error(`Chrome no publicó el endpoint CDP a tiempo. ${lastError?.message || ''}`);
}

async function main() {
  const chromePath = findChrome();
  const port = 9222 + Math.floor(Math.random() * 500);
  const profileDir = `/tmp/mobix-e2e-chrome-${process.pid}-${Date.now()}`;
  const chrome = spawn(chromePath, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync',
    '--metrics-recording-only', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let stderr = '';
  chrome.stderr.on('data', (chunk) => { stderr += String(chunk); });
  let cdp;

  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
    cdp = new CdpClient(version.webSocketDebuggerUrl);
    await cdp.ready();
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);

    const url = new URL(baseUrl);
    await cdp.send('Network.setCookie', {
      name: 'mobix_session', value: sessionToken, domain: url.hostname, path: '/', httpOnly: true,
      secure: url.protocol === 'https:', sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 3600,
    }, sessionId);

    const evaluate = async (expression) => {
      const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Error ejecutando JavaScript en el navegador.');
      return result.result?.value;
    };

    const waitFor = async (expression, label, timeoutMs = 12000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try { if (await evaluate(`Boolean(${expression})`)) return; } catch {}
        await delay(150);
      }
      const snapshot = await evaluate(`({url: location.href, text: document.body?.innerText?.slice(0, 4000) || ''})`);
      throw new Error(`Timeout esperando: ${label}. Estado: ${JSON.stringify(snapshot)}`);
    };

    const navigate = async (path) => {
      await cdp.send('Page.navigate', { url: `${baseUrl}${path}` }, sessionId);
      await waitFor(`document.readyState === 'complete'`, `carga de ${path}`, 15000);
      await waitFor(`location.pathname !== '/login'`, `sesión autenticada en ${path}`, 5000);
    };

    const setControl = async (expression, value, description) => {
      const payload = JSON.stringify(String(value));
      const ok = await evaluate(`(() => {
        const el = ${expression};
        if (!el) return false;
        const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, ${payload}); else el.value = ${payload};
        el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); return true;
      })()`);
      if (!ok) throw new Error(`No se encontró ${description}`);
    };

    const setBySelector = (selector, value) => setControl(`document.querySelector(${JSON.stringify(selector)})`, value, selector);
    const setByLabel = (label, value) => setControl(`(() => {
      const n=(v)=>(v||'').replace(/\\s+/g,' ').trim();
      const node=[...document.querySelectorAll('label')].find(x=>n(x.querySelector('span')?.textContent).startsWith(${JSON.stringify(label)}));
      return node?.querySelector('input,select,textarea');
    })()`, value, `el campo ${label}`);

    const clickButton = async (textValue) => {
      const ok = await evaluate(`(() => {
        const n=(v)=>(v||'').replace(/\\s+/g,' ').trim();
        const button=[...document.querySelectorAll('button')].find(x=>n(x.textContent).includes(${JSON.stringify(textValue)}));
        if(!button || button.disabled) return false; button.click(); return true;
      })()`);
      if (!ok) throw new Error(`No se pudo pulsar el botón ${textValue}`);
    };

    console.log('E2E navegador · Cliente');
    await navigate('/clientes/nuevo');
    await setBySelector('input[name="documentNumber"]', customerDni);
    await setBySelector('input[name="name"]', customerName);
    await setBySelector('input[name="phone"]', '999888777');
    await setBySelector('input[name="email"]', `audit-${stamp}@example.test`);
    await clickButton('Guardar cliente');
    await waitFor(`location.pathname.startsWith('/clientes/') && document.body.innerText.includes(${JSON.stringify(customerName)})`, 'cliente creado y detalle cargado', 15000);
    console.log(`✓ Cliente creado mediante createCustomerAction: ${customerName}`);

    console.log('E2E navegador · Proveedor');
    await navigate('/proveedores');
    await clickButton('Nuevo proveedor');
    await waitFor(`document.body.innerText.includes('Nuevo proveedor')`, 'editor de proveedor');
    await setByLabel('N.º de documento', supplierRuc);
    await setByLabel('Razón social / nombre', supplierName);
    await setByLabel('Persona de contacto', 'Auditor MOBIX');
    await setByLabel('Teléfono', '999777666');
    await setByLabel('Correo', `supplier-${stamp}@example.test`);
    await clickButton('Guardar proveedor');
    await waitFor(`document.body.innerText.includes('Proveedor registrado correctamente.') && document.body.innerText.includes(${JSON.stringify(supplierName)})`, 'proveedor guardado', 15000);
    console.log(`✓ Proveedor creado mediante saveSupplierAction: ${supplierName}`);

    console.log('E2E navegador · Caja');
    await navigate('/caja');
    await waitFor(`document.body.innerText.includes('Abrir caja')`, 'caja cerrada antes de iniciar prueba');
    await setByLabel('Fondo inicial de efectivo', '100');
    await clickButton('Abrir caja');
    await waitFor(`document.body.innerText.includes('Caja abierta correctamente.') || document.body.innerText.includes('Movimiento manual')`, 'apertura de caja', 15000);
    await setByLabel('Importe', '10');
    await setByLabel('Concepto / motivo', 'Auditoría funcional E2E');
    await setByLabel('Referencia', `E2E-${stamp}`);
    await clickButton('Registrar movimiento');
    await waitFor(`document.body.innerText.includes('Movimiento registrado.')`, 'movimiento de caja', 15000);
    await setByLabel('Efectivo contado', '90');
    await clickButton('Confirmar cierre de caja');
    await waitFor(`document.body.innerText.includes('Caja cerrada y cuadrada correctamente.')`, 'cierre de caja', 15000);
    console.log('✓ Caja: apertura → movimiento → cierre ejecutados mediante Server Actions reales.');
    console.log('AUDITORÍA E2E NAVEGADOR OK');
  } finally {
    try { cdp?.close(); } catch {}
    chrome.kill('SIGTERM');
    await delay(200);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
    if (stderr && process.env.MOBIX_E2E_DEBUG === '1') console.error(stderr);
  }
}

main().catch((error) => {
  console.error('AUDITORÍA E2E NAVEGADOR FALLÓ');
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
