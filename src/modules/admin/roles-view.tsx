"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo,useState,useTransition } from "react";
import { ArrowLeft, Plus, Save, ShieldCheck } from "lucide-react";
import { createRoleAction,updateRoleAction } from "./admin-actions";

export function RolesAdminView({roles,permissions}:{roles:any[];permissions:any[]}){
 const router=useRouter();const [pending,start]=useTransition();const [error,setError]=useState("");const [creating,setCreating]=useState(false);
 const groups=useMemo(()=>Object.entries(permissions.reduce((acc:any,p:any)=>{(acc[p.group]??=[]).push(p);return acc},{})),[permissions]);
 const [name,setName]=useState(""),[description,setDescription]=useState(""),[selected,setSelected]=useState<string[]>([]);
 function create(){setError("");start(async()=>{try{await createRoleAction({name,description,permissionCodes:selected});setCreating(false);setName("");setDescription("");setSelected([]);router.refresh()}catch(e){setError(e instanceof Error?e.message:"No se pudo crear el rol.")}})}
 function toggle(code:string){setSelected(s=>s.includes(code)?s.filter(x=>x!==code):[...s,code])}
 return <div className="page-stack"><section className="page-heading"><div><Link href="/administracion/usuarios" className="back-link"><ArrowLeft size={15}/> Usuarios</Link><span className="eyebrow">ADMINISTRACIÓN</span><h1>Roles y permisos</h1><p>Define qué puede consultar y modificar cada perfil dentro de MOBIX.</p></div><button className="primary-button" onClick={()=>setCreating(v=>!v)}><Plus size={16}/> Nuevo rol</button></section>{error&&<div className="error-banner"><strong>No se pudo completar</strong><span>{error}</span></div>}
 {creating&&<section className="panel role-editor"><div className="section-title"><div><h2>Nuevo rol</h2><p>Selecciona únicamente los permisos que necesita este perfil.</p></div><ShieldCheck size={19}/></div><div className="admin-form-grid"><label><span>Nombre</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Ej. Vendedor"/></label><label><span>Descripción</span><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Funciones principales del perfil"/></label></div><PermissionGrid groups={groups as any} selected={selected} onToggle={toggle} disabled={false}/><button className="primary-button" disabled={pending} onClick={create}>{pending?"Creando...":"Crear rol"}</button></section>}
 <div className="roles-list">{roles.map(role=><RoleCard key={role.id} role={role} groups={groups as any} pending={pending} onError={setError} onSaved={()=>router.refresh()}/>)}</div></div>
}

function RoleCard({role,groups,pending,onError,onSaved}:{role:any;groups:any[];pending:boolean;onError:(v:string)=>void;onSaved:()=>void}){
 const [name,setName]=useState(role.name),[description,setDescription]=useState(role.description||""),[status,setStatus]=useState(role.status),[selected,setSelected]=useState<string[]>(role.permissionCodes);
 function toggle(code:string){if(role.isSystem)return;setSelected(s=>s.includes(code)?s.filter(x=>x!==code):[...s,code])}
 function save(){onError("");(async()=>{try{await updateRoleAction({roleId:role.id,name,description,status,permissionCodes:selected});onSaved()}catch(e){onError(e instanceof Error?e.message:"No se pudo actualizar el rol.")}})()}
 return <section className="panel role-card"><div className="role-card-head"><div><span className={role.isSystem?"role-system-badge":"role-custom-badge"}>{role.isSystem?"ROL DEL SISTEMA":"ROL PERSONALIZADO"}</span><input value={name} disabled={role.isSystem} onChange={e=>setName(e.target.value)}/><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descripción"/><small>{role.userCount} usuario(s) asignado(s)</small></div><div><select disabled={role.isSystem} value={status} onChange={e=>setStatus(e.target.value)}><option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option></select><button className="secondary-button" disabled={pending} onClick={save}><Save size={15}/> Guardar</button></div></div><PermissionGrid groups={groups} selected={selected} onToggle={toggle} disabled={role.isSystem}/></section>
}

function PermissionGrid({groups,selected,onToggle,disabled}:{groups:any[];selected:string[];onToggle:(c:string)=>void;disabled:boolean}){
 const LABELS:Record<string,string>={dashboard:"Dashboard",sales:"Ventas",purchases:"Compras",inventory:"Inventario",returns:"Devoluciones",cash:"Caja",customers:"Clientes",service:"Postventa",reports:"Reportes",costs:"Costos y utilidad",users:"Usuarios",roles:"Roles",settings:"Configuración"};
 return <div className="permission-groups">{groups.map(([group,items]:any)=><div className="permission-group" key={group}><strong>{LABELS[group]||group}</strong><div>{items.map((p:any)=><label key={p.code}><input type="checkbox" disabled={disabled} checked={selected.includes(p.code)} onChange={()=>onToggle(p.code)}/><span><b>{p.name}</b><small>{p.description}</small></span></label>)}</div></div>)}</div>
}
