"use client";

import type { CashCloseReportData, CashPaymentTotals } from "./cash-types";

const PAYMENT_LABELS: Array<{ key: keyof CashPaymentTotals; label: string }> = [
  { key: "CASH", label: "Efectivo" },
  { key: "YAPE", label: "Yape" },
  { key: "PLIN", label: "Plin" },
  { key: "CARD", label: "Tarjeta" },
  { key: "TRANSFER", label: "Transferencia" },
  { key: "CREDIT", label: "Crédito" },
  { key: "EXCHANGE_CREDIT", label: "Vale de cambio" },
  { key: "OTHER", label: "Otro" },
];

function money(value:number){
  return new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN",minimumFractionDigits:2}).format(value||0);
}
function dt(value:string){
  return new Intl.DateTimeFormat("es-PE",{timeZone:"America/Lima",dateStyle:"short",timeStyle:"short"}).format(new Date(value));
}
function canvasBlob(canvas:HTMLCanvasElement){
  return new Promise<Blob>((resolve,reject)=>{
    canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("No se pudo generar el reporte PDF.")),"image/jpeg",0.94);
  });
}
function concat(parts:Uint8Array[]){
  const size=parts.reduce((sum,p)=>sum+p.length,0);
  const out=new Uint8Array(size);let offset=0;
  for(const part of parts){out.set(part,offset);offset+=part.length}
  return out;
}
function jpegPdf(jpeg:Uint8Array,w:number,h:number){
  const enc=new TextEncoder(),parts:Uint8Array[]=[],offsets:number[]=[];let len=0;
  const push=(s:string)=>{const b=enc.encode(s);parts.push(b);len+=b.length};
  const pushBytes=(b:Uint8Array)=>{parts.push(b);len+=b.length};
  const obj=(n:number,s:string)=>{offsets[n]=len;push(n+" 0 obj\n"+s+"\nendobj\n")};
  const pw=595.28,ph=841.89,scale=Math.min(pw/w,ph/h),dw=w*scale,dh=h*scale,dx=(pw-dw)/2,dy=(ph-dh)/2;
  const stream=enc.encode("q\n"+dw.toFixed(2)+" 0 0 "+dh.toFixed(2)+" "+dx.toFixed(2)+" "+dy.toFixed(2)+" cm\n/Im0 Do\nQ\n");
  push("%PDF-1.4\n");
  obj(1,"<< /Type /Catalog /Pages 2 0 R >>");
  obj(2,"<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+pw+" "+ph+"] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
  offsets[4]=len;
  push("4 0 obj\n<< /Type /XObject /Subtype /Image /Width "+w+" /Height "+h+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+jpeg.length+" >>\nstream\n");
  pushBytes(jpeg);push("\nendstream\nendobj\n");
  offsets[5]=len;push("5 0 obj\n<< /Length "+stream.length+" >>\nstream\n");pushBytes(stream);push("endstream\nendobj\n");
  const xref=len;push("xref\n0 6\n0000000000 65535 f \n");
  for(let i=1;i<=5;i++)push(String(offsets[i]).padStart(10,"0")+" 00000 n \n");
  push("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF");
  return new Blob([concat(parts)],{type:"application/pdf"});
}

export async function buildCashClosePdf(report:CashCloseReportData){
  const canvas=document.createElement("canvas");
  canvas.width=1240;canvas.height=1754;
  const ctx=canvas.getContext("2d");
  if(!ctx) throw new Error("El navegador no permite generar el reporte PDF.");

  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#111827";ctx.textBaseline="top";
  const left=72,right=1168;

  ctx.font="700 35px Arial";ctx.fillText("MOBIX",left,65);
  ctx.font="600 22px Arial";ctx.fillText(report.companyName,left,112);
  ctx.font="700 28px Arial";ctx.textAlign="right";ctx.fillText("REPORTE DE CIERRE DE CAJA",right,65);
  ctx.font="600 16px Arial";ctx.fillStyle="#64748b";ctx.fillText("ID "+report.sessionId,right,108);ctx.textAlign="left";

  let y=175;
  ctx.strokeStyle="#d1d5db";ctx.strokeRect(left,y,right-left,135);
  const meta=[
    ["Sucursal",report.branchName],
    ["Responsable",report.userName],
    ["Apertura",dt(report.openedAt)],
    ["Cierre",dt(report.closedAt)],
  ];
  const mw=(right-left)/4;
  meta.forEach((item,i)=>{
    const x=left+i*mw;
    ctx.fillStyle="#64748b";ctx.font="700 14px Arial";ctx.fillText(item[0].toUpperCase(),x+16,y+22);
    ctx.fillStyle="#111827";ctx.font="600 18px Arial";ctx.fillText(item[1],x+16,y+57);
  });

  y+=175;
  const kpis=[
    ["Fondo inicial",report.openingAmount],
    ["Ventas del turno",report.salesTotal],
    ["Devoluciones",report.refundTotal],
    ["Efectivo esperado",report.expectedAmount],
    ["Efectivo contado",report.actualAmount],
  ];
  const kw=(right-left-40)/5;
  kpis.forEach((item,i)=>{
    const x=left+i*(kw+10);
    ctx.strokeStyle="#e5e7eb";ctx.strokeRect(x,y,kw,105);
    ctx.fillStyle="#64748b";ctx.font="700 12px Arial";ctx.fillText(String(item[0]).toUpperCase(),x+12,y+18);
    ctx.fillStyle="#111827";ctx.font="700 20px Arial";ctx.fillText(money(Number(item[1])),x+12,y+52);
  });

  y+=145;
  ctx.fillStyle="#111827";ctx.font="700 20px Arial";ctx.fillText("CONCILIACIÓN POR MEDIO DE PAGO",left,y);
  y+=40;
  ctx.fillStyle="#111827";ctx.fillRect(left,y,right-left,44);
  ctx.fillStyle="#fff";ctx.font="700 15px Arial";
  ctx.fillText("MEDIO",left+16,y+13);ctx.textAlign="right";
  ctx.fillText("COBRADO",left+700,y+13);ctx.fillText("DEVUELTO",left+900,y+13);ctx.fillText("NETO",right-16,y+13);ctx.textAlign="left";
  y+=44;

  for(const {key,label} of PAYMENT_LABELS){
    const collected=report.paymentTotals[key]||0,refunded=report.refundTotals[key]||0,net=report.netPaymentTotals[key]||0;
    ctx.strokeStyle="#e5e7eb";ctx.strokeRect(left,y,right-left,48);
    ctx.fillStyle="#111827";ctx.font="600 16px Arial";ctx.fillText(label,left+16,y+15);
    ctx.textAlign="right";ctx.fillText(money(collected),left+700,y+15);ctx.fillText(money(refunded),left+900,y+15);
    ctx.font="700 16px Arial";ctx.fillText(money(net),right-16,y+15);ctx.textAlign="left";y+=48;
  }

  y+=30;
  ctx.font="600 17px Arial";ctx.fillStyle="#111827";
  ctx.fillText("Ingresos manuales",left,y);ctx.textAlign="right";ctx.fillText("+ "+money(report.manualIncome),right,y);ctx.textAlign="left";y+=34;
  ctx.fillText("Salidas manuales / retiros",left,y);ctx.textAlign="right";ctx.fillText("- "+money(report.manualOut),right,y);ctx.textAlign="left";y+=55;

  const balanced=Math.abs(report.difference)<=0.01;
  const result=balanced?"CAJA CUADRADA":report.difference>0?"SOBRANTE":"FALTANTE";
  ctx.fillStyle=balanced?"#f0fdf4":report.difference>0?"#eff6ff":"#fff1f2";ctx.fillRect(left,y,right-left,95);
  ctx.strokeStyle=balanced?"#bbf7d0":report.difference>0?"#bfdbfe":"#fecdd3";ctx.strokeRect(left,y,right-left,95);
  ctx.fillStyle="#334155";ctx.font="700 15px Arial";ctx.fillText("RESULTADO DEL ARQUEO",left+18,y+19);
  ctx.fillStyle="#111827";ctx.font="700 24px Arial";ctx.fillText(result,left+18,y+48);
  ctx.textAlign="right";ctx.font="700 30px Arial";ctx.fillText((report.difference>0?"+":"")+money(report.difference),right-18,y+36);ctx.textAlign="left";
  y+=125;

  if(report.closingNotes?.trim()){
    ctx.strokeStyle="#d1d5db";ctx.strokeRect(left,y,right-left,80);
    ctx.fillStyle="#64748b";ctx.font="700 13px Arial";ctx.fillText("OBSERVACIÓN DE CIERRE",left+14,y+13);
    ctx.fillStyle="#111827";ctx.font="400 16px Arial";ctx.fillText(report.closingNotes.trim(),left+14,y+40);
    y+=105;
  }

  ctx.fillStyle="#64748b";ctx.font="400 13px Arial";ctx.textAlign="center";
  ctx.fillText("Reporte generado por MOBIX · "+report.companyName,canvas.width/2,1680);ctx.textAlign="left";

  const jpg=await canvasBlob(canvas);
  const jpeg=new Uint8Array(await jpg.arrayBuffer());
  const out=jpegPdf(jpeg,canvas.width,canvas.height);
  return new File([out],"cierre-caja-"+report.sessionId+".pdf",{type:"application/pdf"});
}
