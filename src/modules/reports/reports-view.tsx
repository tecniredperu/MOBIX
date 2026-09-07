"use client";

import { Download, Printer, TrendingUp, WalletCards, Boxes, CircleDollarSign, TriangleAlert, ReceiptText, LockKeyhole } from "lucide-react";

const PAYMENT_LABELS: Record<string,string> = { CASH:"Efectivo", YAPE:"Yape", PLIN:"Plin", CARD:"Tarjeta", TRANSFER:"Transferencia", CREDIT:"Crédito", OTHER:"Otro" };
function money(value:number|null|undefined){return value==null?"Restringido":new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN",minimumFractionDigits:2}).format(value||0)}
function pct(value:number|null|undefined){return value==null?"Restringido":`${value.toFixed(1)}%`}

export function ReportsView({data}:{data:any}){
  function exportCsv(){
    const header=data.canSeeCosts?["Producto","Marca","Cantidad","Ventas","Costo","Utilidad"]:["Producto","Marca","Cantidad","Ventas"];
    const rows = [header, ...data.topProducts.map((p:any)=>data.canSeeCosts?[p.product,p.brand,p.quantity,p.sales.toFixed(2),Number(p.cost??0).toFixed(2),Number(p.profit??0).toFixed(2)]:[p.product,p.brand,p.quantity,p.sales.toFixed(2)])];
    const csv = rows.map((row:any[])=>row.map((cell)=>`"${String(cell).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`mobix-reporte-${data.range.from}-${data.range.to}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  const maxDaily=Math.max(1,...data.daily.map((d:any)=>d.sales));
  return <div className="page-stack report-page">
    <section className="page-heading">
      <div><span className="eyebrow">INTELIGENCIA DEL NEGOCIO</span><h1>Reportes y rentabilidad</h1><p>Ventas, inventario, caja, crédito y desempeño comercial con información real.</p></div>
      <div className="report-actions no-print"><button className="secondary-button" onClick={()=>window.print()}><Printer size={16}/> Imprimir</button><button className="secondary-button" onClick={exportCsv}><Download size={16}/> Exportar CSV</button></div>
    </section>
    {!data.canSeeCosts&&<div className="business-info-banner"><LockKeyhole size={16}/><div><strong>Vista comercial sin costos</strong><span>Tu rol puede consultar ventas y desempeño, pero los costos, stock valorizado y utilidad están restringidos.</span></div></div>}
    <form className="panel report-filter no-print" method="get"><label><span>Desde</span><input type="date" name="from" defaultValue={data.range.from}/></label><label><span>Hasta</span><input type="date" name="to" defaultValue={data.range.to}/></label><button className="primary-button" type="submit">Aplicar periodo</button></form>
    <section className="report-kpis">
      <article><CircleDollarSign/><span>Ventas netas</span><strong>{money(data.summary.salesTotal)}</strong><small>Bruto {money(data.summary.grossSalesTotal)} · {data.summary.transactions} operaciones · Ticket {money(data.summary.averageTicket)}</small></article>
      {data.canSeeCosts&&<article><TrendingUp/><span>Utilidad bruta neta</span><strong>{money(data.summary.grossProfit)}</strong><small>Después de devoluciones · Margen {pct(data.summary.margin)}</small></article>}
      {data.canSeeCosts&&<article><WalletCards/><span>Costo neto vendido</span><strong>{money(data.summary.costTotal)}</strong><small>Costo retornado {money(data.summary.returnedCost)} · Compras {money(data.summary.purchasesTotal)}</small></article>}
      {data.canSeeCosts&&<article><Boxes/><span>Stock valorizado</span><strong>{money(data.summary.inventoryValue)}</strong><small>Equipos + accesorios disponibles</small></article>}
      <article><ReceiptText/><span>Cuentas por cobrar</span><strong>{money(data.summary.receivableTotal)}</strong><small>Vencido {money(data.summary.overdueTotal)}</small></article>
      <article><TriangleAlert/><span>Devoluciones</span><strong>{money(data.summary.returnsTotal)}</strong><small>{data.summary.returnsCount} operaciones descontadas del resultado</small></article>
    </section>

    <section className="report-grid-two">
      <article className="panel report-chart"><div className="panel-heading"><div><h2>Ventas brutas por día</h2><p>{data.canSeeCosts?"Operación comercial diaria antes de descontar devoluciones":"Ingresos de ventas del periodo"}</p></div></div><div className="report-bars">{data.daily.length?data.daily.map((d:any)=><div className="report-bar-row" key={d.date}><span>{new Date(`${d.date}T12:00:00`).toLocaleDateString("es-PE",{day:"2-digit",month:"short"})}</span><div><i style={{width:`${Math.max(2,(d.sales/maxDaily)*100)}%`}}/></div><strong>{money(d.sales)}</strong>{data.canSeeCosts&&<small>Util. bruta {money(d.profit)}</small>}</div>):<div className="empty-table-state">Sin ventas en el periodo.</div>}</div></article>
      <article className="panel"><div className="panel-heading"><div><h2>Cobros de ventas</h2><p>Distribución de los medios cobrados antes de reembolsos</p></div></div><div className="report-payment-list">{data.payments.map((p:any)=><div key={p.method}><span>{PAYMENT_LABELS[p.method]??p.method}</span><strong>{money(p.amount)}</strong></div>)}{!data.payments.length&&<div className="empty-table-state">Sin pagos registrados.</div>}</div><div className="report-mini-kpis"><div><span>Descuentos</span><strong>{money(data.summary.discountTotal)}</strong></div><div><span>Diferencia acumulada de caja</span><strong>{money(data.summary.cashDifference)}</strong></div></div></article>
    </section>

    <section className="panel table-panel"><div className="panel-heading"><div><h2>Productos con mayor venta</h2><p>{data.canSeeCosts?"Ranking bruto basado en costo histórico; el resumen superior sí descuenta devoluciones":"Ranking bruto por ventas y unidades"}</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Producto</th><th>Marca</th><th className="right">Cant.</th><th className="right">Ventas</th>{data.canSeeCosts&&<><th className="right">Costo</th><th className="right">Utilidad</th><th className="right">Margen</th></>}</tr></thead><tbody>{data.topProducts.map((p:any)=><tr key={`${p.product}-${p.brand}`}><td><strong>{p.product}</strong></td><td>{p.brand}</td><td className="right">{p.quantity}</td><td className="right">{money(p.sales)}</td>{data.canSeeCosts&&<><td className="right">{money(p.cost)}</td><td className="right"><strong>{money(p.profit)}</strong></td><td className="right">{pct(p.sales?Number(p.profit??0)/p.sales*100:0)}</td></>}</tr>)}</tbody></table></div></section>

    <section className="report-grid-two"><article className="panel table-panel"><div className="panel-heading"><div><h2>Desempeño bruto por vendedor</h2></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Vendedor</th><th className="right">Ventas</th><th className="right">Oper.</th>{data.canSeeCosts&&<th className="right">Utilidad</th>}</tr></thead><tbody>{data.sellers.map((s:any)=><tr key={s.seller}><td><strong>{s.seller}</strong></td><td className="right">{money(s.sales)}</td><td className="right">{s.count}</td>{data.canSeeCosts&&<td className="right">{money(s.profit)}</td>}</tr>)}</tbody></table></div></article><article className="panel table-panel"><div className="panel-heading"><div><h2>Desempeño bruto por sucursal</h2></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Sucursal</th><th className="right">Ventas</th><th className="right">Oper.</th>{data.canSeeCosts&&<th className="right">Utilidad</th>}</tr></thead><tbody>{data.branches.map((s:any)=><tr key={s.branch}><td><strong>{s.branch}</strong></td><td className="right">{money(s.sales)}</td><td className="right">{s.count}</td>{data.canSeeCosts&&<td className="right">{money(s.profit)}</td>}</tr>)}</tbody></table></div></article></section>
  </div>
}
