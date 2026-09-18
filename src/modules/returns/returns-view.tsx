import Link from "next/link";
import { AlertTriangle, ArrowUpRight, RotateCcw, Repeat2, WalletCards } from "lucide-react";

const METHODS:Record<string,string>={CASH:"Efectivo",YAPE:"Yape",PLIN:"Plin",CARD:"Tarjeta",TRANSFER:"Transferencia",CREDIT:"Crédito",OTHER:"Otro"};
function money(v:number){return new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(v||0)}
function dt(v:string){return new Intl.DateTimeFormat("es-PE",{dateStyle:"short",timeStyle:"short"}).format(new Date(v))}

export function ReturnsView({items}:{items:any[]}){
 const total=items.reduce((s,i)=>s+(i.type==="EXCHANGE"?Number(i.exchangeCredit?.originalAmount||0):i.refundAmount),0);
 const exchanges=items.filter(i=>i.type==="EXCHANGE").length;
 const openCredits=items.filter(i=>i.exchangeCredit&&["OPEN","PARTIAL"].includes(i.exchangeCredit.status)&&i.exchangeCredit.balance>0.01);
 const openCreditBalance=openCredits.reduce((s,i)=>s+Number(i.exchangeCredit?.balance||0),0);
 const quarantined=items.reduce((s,i)=>s+Number(i.serializedDisposition?.quarantine||0),0);
 const damaged=items.reduce((s,i)=>s+Number(i.serializedDisposition?.damaged||0),0);

 return <div className="page-stack">
 <section className="page-heading"><div><span className="eyebrow">POSTVENTA COMERCIAL</span><h1>Devoluciones y cambios</h1><p>Reingresos de stock, IMEI, reembolsos y trazabilidad vinculada a la venta original.</p></div><Link className="primary-button" href="/devoluciones/nueva">Nueva devolución / cambio <ArrowUpRight size={16}/></Link></section>

 <section className="mobix-summary-grid four">
  <article><RotateCcw size={19}/><span>Operaciones</span><strong>{items.length}</strong></article>
  <article><Repeat2 size={19}/><span>Cambios</span><strong>{exchanges}</strong>{openCredits.length>0&&<small>{openCredits.length} vales abiertos · {money(openCreditBalance)}</small>}</article>
  <article><span className="summary-symbol">S/</span><span>Valor procesado</span><strong>{money(total)}</strong></article>
  <article className={quarantined||damaged?"return-review-card":""}><AlertTriangle size={19}/><span>IMEI por revisar</span><strong>{quarantined+damaged}</strong>{quarantined+damaged>0&&<small>{quarantined} en revisión · {damaged} dañados</small>}</article>
 </section>

 {(quarantined>0||damaged>0)&&<section className="return-review-banner panel">
   <AlertTriangle size={18}/>
   <div><strong>Hay equipos que no deben volver al POS todavía</strong><span>Los IMEI en revisión o dañados permanecen fuera del stock vendible hasta que se evalúe su condición.</span></div>
   <Link href="/equipos?status=RETURNED" className="secondary-button">Ver en revisión</Link>
 </section>}

 <section className="panel table-panel"><div className="table-wrap"><table className="data-table">
  <thead><tr><th>Operación</th><th>Venta</th><th>Cliente</th><th>Motivo</th><th>Destino IMEI</th><th>Vale de cambio</th><th>Reembolso</th><th className="right">Valor</th><th>Fecha</th></tr></thead>
  <tbody>
   {items.map(i=>{
     const disposition=i.serializedDisposition||{restock:0,quarantine:0,damaged:0};
     return <tr key={i.id}>
      <td><strong>{i.returnNumber}</strong><span className={`service-type-badge ${i.type==="EXCHANGE"?"technical":"warranty"}`}>{i.type==="EXCHANGE"?"Cambio":"Devolución"}</span></td>
      <td><strong>{i.saleNumber}</strong><span className="table-sub">{i.warehouse}</span></td>
      <td>{i.customer}</td>
      <td>{i.reason}</td>
      <td>
       <div className="return-disposition-stack">
        {disposition.quarantine>0&&<span className="return-disposition-chip quarantine">{disposition.quarantine} en revisión</span>}
        {disposition.damaged>0&&<span className="return-disposition-chip damaged">{disposition.damaged} dañados</span>}
        {disposition.restock>0&&<span className="return-disposition-chip restock">{disposition.restock} disponibles</span>}
        {!disposition.quarantine&&!disposition.damaged&&!disposition.restock&&<span>—</span>}
       </div>
      </td>
      <td>
       {i.exchangeCredit?(
        <div className="return-credit-cell">
         <span className={`return-credit-chip ${i.exchangeCredit.status.toLowerCase()}`}><WalletCards size={12}/>{money(i.exchangeCredit.balance)} disponible</span>
         {["OPEN","PARTIAL"].includes(i.exchangeCredit.status)&&i.exchangeCredit.balance>0.01
          ?<Link href={`/pos?exchangeCredit=${encodeURIComponent(i.exchangeCredit.id)}`}>Usar en POS</Link>
          :<small>Vale utilizado</small>}
        </div>
       ):<span>—</span>}
      </td>
      <td>{i.type==="EXCHANGE"?"Valor para cambio":METHODS[i.refundMethod||""]||"—"}</td>
      <td className="right"><strong>{money(i.refundAmount)}</strong></td>
      <td>{dt(i.createdAt)}<span className="table-sub">{i.userName}</span></td>
     </tr>
   })}
   {!items.length&&<tr><td colSpan={9}><div className="empty-table-state"><RotateCcw size={22}/><strong>Sin devoluciones</strong><span>Las operaciones aparecerán aquí cuando se registren.</span></div></td></tr>}
  </tbody>
 </table></div></section>
 </div>
}
