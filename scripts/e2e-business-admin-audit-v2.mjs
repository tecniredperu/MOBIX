import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString=process.env.DATABASE_URL;
const sessionToken=process.env.MOBIX_SESSION_TOKEN?.trim();
const baseUrl=(process.env.MOBIX_BASE_URL||"http://127.0.0.1:3001").replace(/\/$/,"");
if(!connectionString||!sessionToken) throw new Error("DATABASE_URL y MOBIX_SESSION_TOKEN son obligatorios.");
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString})});
const stamp=Date.now().toString(36).toUpperCase();
const sessionPayload=JSON.parse(Buffer.from(sessionToken.split(".")[0],"base64url").toString("utf8"));

function chromePath(){
  for(const c of [process.env.CHROME_BIN,"google-chrome-stable","google-chrome","chromium-browser","chromium"].filter(Boolean)){
    const p=spawnSync("bash",["-lc",`command -v ${JSON.stringify(c)} 2>/dev/null || true`],{encoding:"utf8"}).stdout.trim();
    if(p)return p;
  }
  throw new Error("Chrome/Chromium no disponible.");
}
class Cdp{
  constructor(url){this.ws=new WebSocket(url);this.id=1;this.pending=new Map();this.ws.addEventListener("message",e=>{const m=JSON.parse(String(e.data));if(!m.id||!this.pending.has(m.id))return;const p=this.pending.get(m.id);this.pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result||{});});}
  async ready(){if(this.ws.readyState===WebSocket.OPEN)return;await new Promise((resolve,reject)=>{this.ws.addEventListener("open",resolve,{once:true});this.ws.addEventListener("error",()=>reject(new Error("CDP no disponible")),{once:true});});}
  send(method,params={},sessionId){const id=this.id++;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
  close(){this.ws.close();}
}
async function waitJson(url){for(let i=0;i<100;i++){try{const r=await fetch(url);if(r.ok)return r.json();}catch{}await delay(120);}throw new Error("Chrome no inició CDP.");}
async function browser(){
  const port=9800+Math.floor(Math.random()*150);
  const proc=spawn(chromePath(),["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage","--disable-background-networking","--disable-extensions",`--remote-debugging-port=${port}`,`--user-data-dir=/tmp/mobix-e2e-admin-${process.pid}-${Date.now()}`,"about:blank"],{stdio:["ignore","ignore","ignore"]});
  const v=await waitJson(`http://127.0.0.1:${port}/json/version`);const c=new Cdp(v.webSocketDebuggerUrl);await c.ready();
  const {targetId}=await c.send("Target.createTarget",{url:"about:blank"});const {sessionId}=await c.send("Target.attachToTarget",{targetId,flatten:true});await c.send("Page.enable",{},sessionId);await c.send("Runtime.enable",{},sessionId);await c.send("Network.enable",{},sessionId);
  const app=new URL(baseUrl);await c.send("Network.setCookie",{name:"mobix_session",value:sessionToken,domain:app.hostname,path:"/",httpOnly:true,secure:app.protocol==="https:",sameSite:"Lax",expires:Math.floor(Date.now()/1000)+3600},sessionId);
  const evalJs=async expression=>{const r=await c.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true,userGesture:true},sessionId);if(r.exceptionDetails)throw new Error(r.exceptionDetails.text||"JS browser error");return r.result?.value;};
  const waitFor=async(expression,label,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){try{if(await evalJs(`Boolean(${expression})`))return;}catch{}await delay(150);}const s=await evalJs(`({url:location.href,text:document.body?.innerText?.slice(0,5000)||""})`);throw new Error(`Timeout ${label}: ${JSON.stringify(s)}`);};
  const navigate=async path=>{await c.send("Page.navigate",{url:baseUrl+path},sessionId);await waitFor(`document.readyState==="complete"`,path);await waitFor(`location.pathname!=="/login"`,"sesión");};
  const setControl=async(expression,value,desc)=>{const ok=await evalJs(`(()=>{const el=${expression};if(!el)return false;const p=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const s=Object.getOwnPropertyDescriptor(p,"value")?.set;if(s)s.call(el,${JSON.stringify(String(value))});else el.value=${JSON.stringify(String(value))};el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));return true})()`);if(!ok)throw new Error("No se encontró "+desc);};
  const setByLabel=(label,value)=>setControl(`(()=>{const n=v=>(v||"").replace(/\\s+/g," ").trim();const l=[...document.querySelectorAll("label")].find(x=>n(x.querySelector("span")?.textContent).startsWith(${JSON.stringify(label)}));return l?.querySelector("input,select,textarea")})()`,value,label);
  const click=async text=>{const ok=await evalJs(`(()=>{const n=v=>(v||"").replace(/\\s+/g," ").trim();const b=[...document.querySelectorAll("button")].find(x=>n(x.textContent).includes(${JSON.stringify(text)}));if(!b||b.disabled)return false;b.click();return true})()`);if(!ok)throw new Error("No se pudo pulsar "+text);};
  const stop=async()=>{try{c.close()}catch{}proc.kill("SIGTERM");await delay(100);if(proc.exitCode===null)proc.kill("SIGKILL");};
  return {evalJs,waitFor,navigate,setControl,setByLabel,click,stop};
}
async function waitDb(fn,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){const v=await fn();if(v)return v;await delay(180);}throw new Error("Timeout DB: "+label);}

async function main(){
 const company=await prisma.company.findUniqueOrThrow({where:{id:sessionPayload.companyId}});
 const branch=await prisma.branch.findFirstOrThrow({where:{companyId:company.id,code:"CENTRO",status:"ACTIVE"}});
 const warehouse=await prisma.warehouse.findFirstOrThrow({where:{companyId:company.id,code:"ALM-01",status:"ACTIVE"}});
 const supplier=await prisma.supplier.findFirstOrThrow({where:{companyId:company.id,status:"ACTIVE"},orderBy:{updatedAt:"desc"}});
 const accessory=await prisma.productVariant.findFirstOrThrow({where:{companyId:company.id,status:"ACTIVE",product:{type:"ACCESSORY",status:"ACTIVE",deletedAt:null}},include:{product:true},orderBy:{createdAt:"asc"}});
 const customer=await prisma.customer.findFirstOrThrow({where:{companyId:company.id,status:"ACTIVE"},orderBy:{updatedAt:"desc"}});
 const initialBal=await prisma.inventoryBalance.findUnique({where:{companyId_warehouseId_variantId:{companyId:company.id,warehouseId:warehouse.id,variantId:accessory.id}}});
 const b=await browser();
 try{
  console.log("E2E · Compras");
  const series="Q"+stamp.slice(-3), doc=String(Date.now()).slice(-8);
  await b.navigate("/compras/nueva");
  await b.setByLabel("Proveedor registrado",supplier.id);
  await b.setByLabel("Almacén de destino",warehouse.id);
  await b.setByLabel("Serie",series);await b.setByLabel("Número",doc);
  await b.setByLabel("Observaciones","Compra auditoría "+stamp);
  await b.setControl('document.querySelector(".purchase-add-row select")',accessory.id,"producto de compra");
  await b.click("Agregar");
  await b.waitFor(`[...document.querySelectorAll(".purchase-line")].some(x=>x.innerText.includes(${JSON.stringify(accessory.product.name)}))`,"línea de compra");
  await b.setControl(`[...document.querySelectorAll(".purchase-line")].find(x=>x.innerText.includes(${JSON.stringify(accessory.product.name)}))?.querySelector('input[type="number"]')`,"3","cantidad compra");
  await b.setControl(`[...document.querySelectorAll(".purchase-line")].find(x=>x.innerText.includes(${JSON.stringify(accessory.product.name)}))?.querySelectorAll('input[type="number"]')[1]`,"11.25","costo compra");
  await b.click("Confirmar compra");
  const purchase=await waitDb(()=>prisma.purchase.findFirst({where:{companyId:company.id,documentSeries:series,documentNumber:doc},include:{items:true}}),"compra");
  assert.equal(purchase.status,"RECEIVED");assert.equal(purchase.items.length,1);
  const bal=await prisma.inventoryBalance.findUniqueOrThrow({where:{companyId_warehouseId_variantId:{companyId:company.id,warehouseId:warehouse.id,variantId:accessory.id}}});
  assert.equal(Number(bal.quantity),Number(initialBal?.quantity||0)+3);
  assert.ok(await prisma.inventoryMovement.findFirst({where:{companyId:company.id,referenceType:"PURCHASE",referenceId:purchase.id,movementType:"PURCHASE"}}));
  console.log("✓ Compra real → stock → Kardex.");

  console.log("E2E · Crédito y cobranzas");
  const sale=await prisma.sale.create({data:{companyId:company.id,branchId:branch.id,warehouseId:warehouse.id,customerId:customer.id,saleNumber:"VC-"+stamp,documentType:"SALES_NOTE",taxCondition:"TAXED",currency:"PEN",subtotal:101.69,tax:18.31,total:120,status:"COMPLETED",sellerId:sessionPayload.userId,createdById:sessionPayload.userId}});
  const receivable=await prisma.accountReceivable.create({data:{id:randomUUID(),companyId:company.id,customerId:customer.id,saleId:sale.id,originalAmount:120,paidAmount:0,balance:120,dueDate:new Date(Date.now()+30*86400000),status:"OPEN"}});
  const cash=await prisma.cashSession.create({data:{companyId:company.id,branchId:branch.id,userId:sessionPayload.userId,openingAmount:100,status:"OPEN"}});
  await b.navigate("/clientes/"+customer.id);
  const enabled=await b.evalJs('document.querySelector(".credit-toggle-row input[type=checkbox]")?.checked');
  if(!enabled)await b.evalJs('document.querySelector(".credit-toggle-row input[type=checkbox]")?.click()');
  await b.setByLabel("Límite","500");await b.setByLabel("Plazo","30");await b.setByLabel("Observaciones","Crédito auditado "+stamp);await b.click("Guardar crédito");
  await b.waitFor('document.body.innerText.includes("Configuración de crédito actualizada.")',"guardar crédito");
  const credit=await prisma.customer.findUniqueOrThrow({where:{id:customer.id}});assert.equal(credit.creditEnabled,true);assert.equal(Number(credit.creditLimit),500);
  await b.setByLabel("Cuenta por cobrar",receivable.id);await b.setByLabel("Importe","40");await b.setByLabel("Medio de cobro","YAPE");await b.setByLabel("Referencia","YAPE-"+stamp);await b.setByLabel("Nota","Abono E2E");await b.click("Registrar abono");
  await b.waitFor('document.body.innerText.includes("Abono registrado correctamente.")',"abono");
  const debt=await prisma.accountReceivable.findUniqueOrThrow({where:{id:receivable.id}});assert.equal(Number(debt.balance),80);assert.equal(debt.status,"PARTIAL");
  const pay=await prisma.receivablePayment.findFirst({where:{receivableId:receivable.id,reference:"YAPE-"+stamp}});assert.ok(pay);assert.equal(pay.cashSessionId,cash.id);
  await prisma.cashSession.update({where:{id:cash.id},data:{status:"CLOSED",closedAt:new Date(),expectedAmount:100,closingAmount:100,difference:0}});
  console.log("✓ Crédito actualizado y abono conciliado con caja.");

  console.log("E2E · Roles y usuarios");
  const roleName="QA "+stamp;
  await b.navigate("/administracion/roles");await b.click("Nuevo rol");await b.setByLabel("Nombre",roleName);await b.setByLabel("Descripción","Rol auditoría automática");
  await b.evalJs('document.querySelector(".role-editor .permission-groups input[type=checkbox]:not(:disabled)")?.click()');await b.click("Crear rol");
  const role=await waitDb(()=>prisma.role.findFirst({where:{companyId:company.id,name:roleName}}),"rol creado");assert.ok(role);
  await b.waitFor(`[...document.querySelectorAll(".role-card")].some(x=>x.innerText.includes(${JSON.stringify(roleName)}))`,"rol renderizado");
  await b.setControl(`[...document.querySelectorAll(".role-card")].find(x=>x.innerText.includes(${JSON.stringify(roleName)}))?.querySelectorAll("input")[1]`,"Rol actualizado E2E","descripción de rol");
  const roleSave=await b.evalJs(`(()=>{const c=[...document.querySelectorAll(".role-card")].find(x=>x.innerText.includes(${JSON.stringify(roleName)}));const bt=[...(c?.querySelectorAll("button")||[])].find(x=>x.innerText.includes("Guardar"));if(!bt)return false;bt.click();return true})()`);if(!roleSave)throw new Error("No se pudo guardar rol");
  await waitDb(async()=>((await prisma.role.findUnique({where:{id:role.id}}))?.description==="Rol actualizado E2E"),"rol actualizado");

  await b.navigate("/administracion/usuarios");await b.click("Nuevo usuario");
  const email=`qa-${stamp.toLowerCase()}@example.test`, password="QaMobix2026X!";
  await b.setByLabel("Nombre completo","Usuario QA "+stamp);await b.setByLabel("Correo",email);await b.setByLabel("Celular","999555444");await b.setByLabel("Contraseña inicial",password);await b.setByLabel("Rol",role.id);await b.setByLabel("Sucursal predeterminada",branch.id);await b.click("Crear usuario");
  const membership=await waitDb(()=>prisma.companyUser.findFirst({where:{companyId:company.id,user:{email}},include:{user:true}}),"usuario creado");assert.ok(membership);
  await b.waitFor(`[...document.querySelectorAll("tbody tr")].some(x=>x.innerText.includes(${JSON.stringify(email)}))`,"usuario renderizado");
  const changed=await b.evalJs(`(()=>{const row=[...document.querySelectorAll("tbody tr")].find(x=>x.innerText.includes(${JSON.stringify(email)}));const sels=row?.querySelectorAll("select");if(!sels?.length)return false;const p=HTMLSelectElement.prototype;Object.getOwnPropertyDescriptor(p,"value").set.call(sels[2],"SUSPENDED");sels[2].dispatchEvent(new Event("change",{bubbles:true}));const bt=[...row.querySelectorAll("button")].find(x=>x.innerText.includes("Guardar"));bt?.click();return !!bt})()`);if(!changed)throw new Error("No se pudo actualizar usuario");
  await waitDb(async()=>((await prisma.companyUser.findUnique({where:{id:membership.id}}))?.status==="SUSPENDED"),"usuario suspendido");
  await b.evalJs(`(()=>{const row=[...document.querySelectorAll("tbody tr")].find(x=>x.innerText.includes(${JSON.stringify(email)}));[...row.querySelectorAll("button")].find(x=>x.innerText.includes("Cambiar clave"))?.click()})()`);
  await b.waitFor(`[...document.querySelectorAll("tbody tr")].find(x=>x.innerText.includes(${JSON.stringify(email)}))?.querySelector('input[type="password"]')`,"campo cambio clave");
  const beforeVersion=membership.user.sessionVersion;
  await b.setControl(`[...document.querySelectorAll("tbody tr")].find(x=>x.innerText.includes(${JSON.stringify(email)}))?.querySelector('input[type="password"]')`,"NuevaQa2026Z!","nueva clave");
  const applied=await b.evalJs(`(()=>{const row=[...document.querySelectorAll("tbody tr")].find(x=>x.innerText.includes(${JSON.stringify(email)}));const bt=[...row.querySelectorAll("button")].find(x=>x.innerText.includes("Aplicar"));bt?.click();return !!bt})()`);if(!applied)throw new Error("No se pudo aplicar nueva clave");
  await waitDb(async()=>((await prisma.user.findUnique({where:{id:membership.userId}}))?.sessionVersion>beforeVersion),"reset de clave");
  console.log("✓ Rol crear/editar + usuario crear/actualizar/reset clave.");

  console.log("E2E · Configuración");
  await b.navigate("/configuracion");await b.click("Guardar empresa");await b.waitFor('document.body.innerText.includes("Datos de empresa actualizados.")',"empresa");
  await b.click("Guardar parámetros");await b.waitFor('document.body.innerText.includes("Parámetros comerciales actualizados.")',"parámetros");
  await b.click("Nueva sucursal");
  await b.waitFor(`[...document.querySelectorAll(".settings-entity-row")].some(x=>x.querySelector('input[placeholder="Nombre"]')?.value==="")`,"fila sucursal");
  const brCode=("QB"+stamp).slice(0,20), brName="Sucursal QA "+stamp;
  const brSet=await b.evalJs(`(()=>{const row=[...document.querySelectorAll(".settings-entity-row")].find(x=>x.querySelector('input[placeholder="Nombre"]')?.value==="");if(!row)return false;const set=(sel,val)=>{const el=row.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,val);el.dispatchEvent(new Event("input",{bubbles:true}));};set('input[placeholder="Nombre"]',${JSON.stringify(brName)});set('input[placeholder="Código"]',${JSON.stringify(brCode)});set('input[placeholder="Dirección"]',"Moyobamba QA");set('input[placeholder="Teléfono"]',"999111222");[...row.querySelectorAll("button")].find(x=>x.innerText.includes("Guardar"))?.click();return true})()`);if(!brSet)throw new Error("No se pudo crear sucursal");
  const newBranch=await waitDb(()=>prisma.branch.findFirst({where:{companyId:company.id,code:brCode}}),"sucursal creada");
  await b.click("Nuevo almacén");
  await b.waitFor(`[...document.querySelectorAll(".settings-entity-row.warehouse")].some(x=>x.querySelector('input[placeholder="Nombre"]')?.value==="")`,"fila almacén");
  const whCode=("QW"+stamp).slice(0,20), whName="Almacén QA "+stamp;
  const whSet=await b.evalJs(`(()=>{const row=[...document.querySelectorAll(".settings-entity-row.warehouse")].find(x=>x.querySelector('input[placeholder="Nombre"]')?.value==="");if(!row)return false;const set=(sel,val)=>{const el=row.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,val);el.dispatchEvent(new Event("input",{bubbles:true}));};set('input[placeholder="Nombre"]',${JSON.stringify(whName)});set('input[placeholder="Código"]',${JSON.stringify(whCode)});set('input[placeholder="Descripción"]',"Almacén auditoría");const s=row.querySelector("select");Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(s,${JSON.stringify(newBranch.id)});s.dispatchEvent(new Event("change",{bubbles:true}));[...row.querySelectorAll("button")].find(x=>x.innerText.includes("Guardar"))?.click();return true})()`);if(!whSet)throw new Error("No se pudo crear almacén");
  assert.ok(await waitDb(()=>prisma.warehouse.findFirst({where:{companyId:company.id,code:whCode,branchId:newBranch.id}}),"almacén creado"));
  console.log("✓ Empresa/parámetros + sucursal + almacén.");
 }finally{await b.stop();}
}
try{await main();console.log("AUDITORÍA E2E NEGOCIO/ADMIN OK");}finally{await prisma.$disconnect();}
