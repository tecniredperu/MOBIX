"use client";

export type ServiceReceiptData = {
  company:{businessName:string;tradeName:string|null;ruc:string|null;email:string|null;phone:string|null;address:string|null;logoUrl:string|null};
  serviceNumber:string;serviceType:string;status:string;receivedAt:string;expectedAt:string|null;saleNumber:string|null;warrantyExpiresAt:string|null;
  deviceName:string;brand:string|null;model:string|null;identifier:string|null;
  reportedIssue:string;physicalCondition:string|null;accessories:string|null;diagnosis:string|null;
  technicianName:string|null;estimatedCost:number;finalCost:number;
  customer:{name:string;documentType:string|null;documentNumber:string|null;phone:string|null};
};

const STATUS:Record<string,string>={RECEIVED:"Recibido",DIAGNOSIS:"En diagnóstico",WAITING_APPROVAL:"Esperando aprobación",IN_REPAIR:"En reparación",READY:"Listo para entrega",DELIVERED:"Entregado",CANCELLED:"Cancelado"};

function money(v:number){return new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN",minimumFractionDigits:2}).format(v||0)}
function dt(v:string|null){if(!v)return"—";return new Intl.DateTimeFormat("es-PE",{timeZone:"America/Lima",dateStyle:"short",timeStyle:"short"}).format(new Date(v))}
function wrap(ctx:CanvasRenderingContext2D,text:string,max:number){const w=text.trim().split(/\s+/).filter(Boolean);if(!w.length)return[""];const out:string[]=[];let line=w[0];for(let i=1;i<w.length;i++){const t=line+" "+w[i];if(ctx.measureText(t).width<=max)line=t;else{out.push(line);line=w[i]}}out.push(line);return out}
function draw(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,max:number,lh:number){const lines=wrap(ctx,text,max);lines.forEach((l,i)=>ctx.fillText(l,x,y+i*lh));return y+lines.length*lh}
async function logo(url?:string|null){if(!url)return null;return new Promise<HTMLImageElement|null>(r=>{const i=new Image();i.crossOrigin="anonymous";i.onload=()=>r(i);i.onerror=()=>r(null);i.src=url})}
function blob(canvas:HTMLCanvasElement){return new Promise<Blob>((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error("No se pudo generar el PDF.")),"image/jpeg",.94))}
function bytes(parts:Uint8Array[]){const n=parts.reduce((s,p)=>s+p.length,0),o=new Uint8Array(n);let x=0;for(const p of parts){o.set(p,x);x+=p.length}return o}
function pdf(jpeg:Uint8Array,w:number,h:number){const e=new TextEncoder(),c:Uint8Array[]=[],off:number[]=[];let len=0;const t=(s:string)=>{const b=e.encode(s);c.push(b);len+=b.length},b=(v:Uint8Array)=>{c.push(v);len+=v.length},obj=(n:number,s:string)=>{off[n]=len;t(n+" 0 obj\n"+s+"\nendobj\n")};const pw=595.28,ph=841.89,sc=Math.min(pw/w,ph/h),dw=w*sc,dh=h*sc,dx=(pw-dw)/2,dy=(ph-dh)/2,cs="q\n"+dw.toFixed(2)+" 0 0 "+dh.toFixed(2)+" "+dx.toFixed(2)+" "+dy.toFixed(2)+" cm\n/Im0 Do\nQ\n",cb=e.encode(cs);t("%PDF-1.4\n");obj(1,"<< /Type /Catalog /Pages 2 0 R >>");obj(2,"<< /Type /Pages /Kids [3 0 R] /Count 1 >>");obj(3,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+pw+" "+ph+"] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");off[4]=len;t("4 0 obj\n<< /Type /XObject /Subtype /Image /Width "+w+" /Height "+h+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+jpeg.length+" >>\nstream\n");b(jpeg);t("\nendstream\nendobj\n");off[5]=len;t("5 0 obj\n<< /Length "+cb.length+" >>\nstream\n");b(cb);t("endstream\nendobj\n");const xr=len;t("xref\n0 6\n0000000000 65535 f \n");for(let i=1;i<=5;i++)t(String(off[i]).padStart(10,"0")+" 00000 n \n");t("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xr+"\n%%EOF");return new Blob([bytes(c)],{type:"application/pdf"})}

export async function buildServiceReceiptPdf(data:ServiceReceiptData){
  const canvas=document.createElement("canvas");canvas.width=1240;canvas.height=1754;
  const ctx=canvas.getContext("2d");if(!ctx)throw new Error("No se pudo generar el PDF.");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,1240,1754);ctx.fillStyle="#111827";ctx.textBaseline="top";
  const m=72,r=1168,img=await logo(data.company.logoUrl),name=data.company.tradeName||data.company.businessName;
  if(img){const sc=Math.min(180/img.naturalWidth,90/img.naturalHeight,1);ctx.drawImage(img,m,58,img.naturalWidth*sc,img.naturalHeight*sc)}
  const cx=img?280:m;ctx.font="700 34px Arial";ctx.fillText(name,cx,58);ctx.font="400 17px Arial";let cy=105;
  if(data.company.ruc){ctx.fillText("RUC "+data.company.ruc,cx,cy);cy+=24}
  if(data.company.address)cy=draw(ctx,data.company.address,cx,cy,500,22);
  const contact=[data.company.phone,data.company.email].filter(Boolean).join(" · ");if(contact)draw(ctx,contact,cx,cy+2,500,22);
  ctx.strokeStyle="#111827";ctx.lineWidth=3;ctx.strokeRect(840,48,328,190);ctx.textAlign="center";ctx.font="700 22px Arial";ctx.fillText(data.serviceType==="WARRANTY"?"GARANTÍA":"SERVICIO TÉCNICO",1004,78);ctx.font="700 28px Arial";ctx.fillText("FICHA DE RECEPCIÓN",1004,119);ctx.font="700 23px Arial";ctx.fillText(data.serviceNumber,1004,174);ctx.textAlign="left";
  let y=280;ctx.strokeStyle="#d1d5db";ctx.lineWidth=2;ctx.strokeRect(m,y,r-m,180);ctx.font="700 16px Arial";ctx.fillStyle="#64748b";ctx.fillText("CLIENTE",m+20,y+18);ctx.fillText("EQUIPO",650,y+18);ctx.font="600 21px Arial";ctx.fillStyle="#111827";ctx.fillText(data.customer.name,m+20,y+48);ctx.fillText(data.deviceName,650,y+48);ctx.font="400 16px Arial";ctx.fillText(data.customer.documentNumber?(data.customer.documentType||"Doc.")+" "+data.customer.documentNumber:"Sin documento",m+20,y+82);ctx.fillText(data.customer.phone||"—",m+20,y+112);draw(ctx,[data.brand,data.model].filter(Boolean).join(" · ")||"Sin detalle",650,y+82,480,20);ctx.fillText(data.identifier||"Sin IMEI/serie",650,y+112);
  y+=210;const meta=[["Recepción",dt(data.receivedAt)],["Estado",STATUS[data.status]||data.status],["Entrega estimada",dt(data.expectedAt)],["Técnico",data.technicianName||"Sin asignar"]];const bw=(r-m-30)/4;
  meta.forEach((a,i)=>{const x=m+i*(bw+10);ctx.strokeStyle="#d1d5db";ctx.strokeRect(x,y,bw,62);ctx.fillStyle="#64748b";ctx.font="700 12px Arial";ctx.fillText(a[0].toUpperCase(),x+10,y+10);ctx.fillStyle="#111827";ctx.font="600 14px Arial";draw(ctx,a[1],x+10,y+31,bw-20,17)});
  y+=95;const sections=[["FALLA REPORTADA",data.reportedIssue],["ESTADO FÍSICO",data.physicalCondition||"No especificado"],["ACCESORIOS",data.accessories||"Ninguno registrado"]];sections.forEach(s=>{ctx.strokeStyle="#d1d5db";ctx.strokeRect(m,y,r-m,105);ctx.fillStyle="#334155";ctx.font="700 14px Arial";ctx.fillText(s[0],m+16,y+14);ctx.fillStyle="#111827";ctx.font="400 16px Arial";draw(ctx,s[1],m+16,y+42,r-m-32,22);y+=120});
  if(data.diagnosis){ctx.strokeStyle="#d1d5db";ctx.strokeRect(m,y,r-m,95);ctx.fillStyle="#334155";ctx.font="700 14px Arial";ctx.fillText("DIAGNÓSTICO",m+16,y+14);ctx.fillStyle="#111827";ctx.font="400 16px Arial";draw(ctx,data.diagnosis,m+16,y+42,r-m-32,22);y+=115}
  ctx.strokeStyle="#d1d5db";ctx.beginPath();ctx.moveTo(m,y);ctx.lineTo(r,y);ctx.stroke();y+=28;ctx.fillStyle="#111827";ctx.font="700 18px Arial";const budget=data.serviceType==="WARRANTY"?"Cobertura de garantía":money(data.estimatedCost),final=data.serviceType==="WARRANTY"?money(0):money(data.finalCost);ctx.fillText("Presupuesto: "+budget,m,y);ctx.fillText("Importe final: "+final,650,y);
  y+=115;ctx.strokeStyle="#4b5563";ctx.beginPath();ctx.moveTo(m+70,y);ctx.lineTo(m+400,y);ctx.moveTo(r-400,y);ctx.lineTo(r-70,y);ctx.stroke();ctx.fillStyle="#64748b";ctx.font="400 14px Arial";ctx.textAlign="center";ctx.fillText("Firma del cliente",m+235,y+10);ctx.fillText("Recepción / Taller",r-235,y+10);ctx.textAlign="left";
  y+=85;ctx.fillStyle="#64748b";ctx.font="400 13px Arial";ctx.textAlign="center";ctx.fillText("Conserve esta ficha para el recojo del equipo. Documento de control interno generado por MOBIX.",620,y);ctx.textAlign="left";
  const jb=await blob(canvas),j=new Uint8Array(await jb.arrayBuffer()),p=pdf(j,1240,1754);return new File([p],"servicio-"+data.serviceNumber.replace(/[^a-zA-Z0-9-_]/g,"-")+".pdf",{type:"application/pdf"});
}
