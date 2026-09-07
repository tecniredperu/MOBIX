"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState,useTransition } from "react";
import { ArrowRight, CheckCircle2, PackageOpen, Plus, XCircle } from "lucide-react";
import { cancelTransferAction,receiveTransferAction } from "./transfer-actions";

const STATUS:Record<string,string>={DRAFT:"Borrador",IN_TRANSIT:"En tránsito",RECEIVED:"Recibida",CANCELLED:"Cancelada"};
function dt(v:string|null){return v?new Intl.DateTimeFormat("es-PE",{dateStyle:"short",timeStyle:"short"}).format(new Date(v)):"—"}
export function TransfersView({items}:{items:any[]}){
 const router=useRouter(); const [pending,start]=useTransition(); const [error,setError]=useState("");
 function action(id:string,type:"receive"|"cancel"){setError("");start(async()=>{try{if(type==="receive")await receiveTransferAction(id);else await cancelTransferAction(id);router.refresh()}catch(e){setError(e instanceof Error?e.message:"No se pudo actualizar la transferencia.")}})}
 const transit=items.filter(i=>i.status==="IN_TRANSIT").length,received=items.filter(i=>i.status==="RECEIVED").length;
 return <div className="page-stack"><section className="page-heading"><div><span className="eyebrow">INVENTARIO</span><h1>Transferencias</h1><p>Movimiento controlado de equipos con IMEI y stock por cantidad entre almacenes.</p></div><Link className="primary-button" href="/transferencias/nueva"><Plus size={16}/> Nueva transferencia</Link></section>{error&&<div className="error-banner"><strong>No se pudo completar</strong><span>{error}</span></div>}
 <section className="mobix-summary-grid four"><article><PackageOpen size={19}/><span>Total</span><strong>{items.length}</strong></article><article><ArrowRight size={19}/><span>En tránsito</span><strong>{transit}</strong></article><article><CheckCircle2 size={19}/><span>Recibidas</span><strong>{received}</strong></article><article><span className="summary-symbol">#</span><span>Unidades movilizadas</span><strong>{items.reduce((s,i)=>s+i.units,0)}</strong></article></section>
 <section className="panel table-panel"><div className="table-wrap"><table className="data-table"><thead><tr><th>Transferencia</th><th>Origen</th><th></th><th>Destino</th><th>Contenido</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody>{items.map(i=><tr key={i.id}><td><strong>{i.transferNumber}</strong><span className="table-sub">{i.createdBy}</span></td><td><strong>{i.fromWarehouse}</strong><span className="table-sub">{i.fromBranch}</span></td><td><ArrowRight size={15}/></td><td><strong>{i.toWarehouse}</strong><span className="table-sub">{i.toBranch}</span></td><td>{i.units} unidad(es)<span className="table-sub">{i.items} línea(s)</span></td><td><span className={`service-status ${i.status.toLowerCase()}`}>{STATUS[i.status]||i.status}</span></td><td>{dt(i.sentAt||i.createdAt)}{i.receivedAt&&<span className="table-sub">Recibida {dt(i.receivedAt)}</span>}</td><td>{i.status==="IN_TRANSIT"?<div className="row-actions"><button disabled={pending} className="table-action-link" onClick={()=>action(i.id,"receive")}><CheckCircle2 size={14}/> Recibir</button><button disabled={pending} className="table-action-link danger" onClick={()=>action(i.id,"cancel")}><XCircle size={14}/> Cancelar</button></div>:<span className="table-sub">Sin acciones</span>}</td></tr>)}{!items.length&&<tr><td colSpan={8}><div className="empty-table-state"><PackageOpen size={22}/><strong>Sin transferencias</strong><span>Crea una transferencia para mover inventario entre almacenes.</span></div></td></tr>}</tbody></table></div></section></div>
}
