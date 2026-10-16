"use client";
import {demoApi} from "@/lib/demo-api";
import {useState,useEffect,useCallback,useRef,type FormEvent} from "react";
import {CarFront,ShoppingBag,Users,Wallet,FileText,Mail,LayoutDashboard,Search,Plus,ShieldCheck,LockKeyhole,Clock3,LogOut,ChevronRight,LayoutGrid,List,RefreshCw,Check,Eye,Edit3,KeyRound,ArrowDownToLine,AlertTriangle,CalendarDays,X,UserRound,History,CheckCircle2,Send,Printer,Menu} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from "@/components/ui/sheet";
import {Select,SelectTrigger,SelectContent,SelectItem,SelectValue} from "@/components/ui/select";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
import {Table,TableHeader,TableRow,TableHead,TableBody,TableCell} from "@/components/ui/table";
import {SidebarProvider,Sidebar,SidebarContent,SidebarHeader,SidebarFooter,SidebarGroup,SidebarGroupLabel,SidebarGroupContent,SidebarMenu,SidebarMenuItem,SidebarMenuButton,SidebarInset,SidebarTrigger} from "@/components/ui/sidebar";
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from "@/components/ui/alert-dialog";
import {Toaster} from "@/components/ui/sonner";
import {toast} from "sonner";
import {MODULES,offerAmount,money,initials,type Module,type User,type RecordItem,type Field} from "@/lib/model";

type Session={user:User;csrf:string;demo?:boolean;mailConfigured?:boolean};
type State={records:RecordItem[];users:User[];grants:any[];requests:any[];audit:any[];demo:boolean;limit:number};
type Section=Module|"overview"|"team"|"permissions"|"activity";
type Draft={title:string;status:string;ownerId:string;data:Record<string,string|number>};
const EMPTY:State={records:[],users:[],grants:[],requests:[],audit:[],demo:false,limit:5000};
const ICONS={purchases:ShoppingBag,sales:Users,stock:CarFront,expenses:Wallet,offers:Mail,contracts:FileText};
class RequestError extends Error{constructor(message:string,public status:number,public details?:any){super(message)}}
const dateLabel=(value:string)=>value?new Date(value.length===10?value+"T12:00:00":value).toLocaleDateString("es-AR",{day:"2-digit",month:"short"}):"Sin fecha";
const statusClass=(status:string)=>{
  if(["Disponible","Pagado","Aprobada","Comprado","Vendido","Aceptada","Firmado"].includes(status))return "status-green";
  if(["Inspección","Pendiente","Señado","Reservado","En taller"].includes(status))return "status-amber";
  if(["Cotizado","Visita agendada","Revisado"].includes(status))return "status-purple";
  if(["Descartado","Rechazada"].includes(status))return "status-gray";
  return "status-blue";
};
function Choice({value,onChange,options,placeholder="Seleccionar",disabled=false}:{value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];placeholder?:string;disabled?:boolean}){
  return <Select value={value||"_empty"} onValueChange={v=>onChange(v==="_empty"?"":v)} disabled={disabled}><SelectTrigger className="field-control"><SelectValue placeholder={placeholder}/></SelectTrigger><SelectContent><SelectItem value="_empty">{placeholder}</SelectItem>{options.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
}
function Avatar({user,size="normal"}:{user?:User;size?:"normal"|"small"}){return <span className={"person-avatar "+(user?.id.includes("lucia")?"avatar-purple":user?.id.includes("mateo")?"avatar-blue":"avatar-green")+" "+(size==="small"?"avatar-small":"")}>{initials(user?.name||"Equipo")}</span>}
function Brand(){return <div className="brand"><img className="brand-logo" src="/carrito-logo.png" width={512} height={166} alt="Carrito · Tienda de autos"/><small>GESTIÓN DEL EQUIPO</small></div>}
function emptyDraft(module:Module,user:User):Draft{
  const data:Record<string,string|number>={currency:"ARS"};
  if(module==="expenses"||module==="contracts")data.date=new Date().toISOString().slice(0,10);
  if(module==="offers"){data.marginPercent=15;data.estimatedCosts=0;data.operation="Compra inmediata"}
  return {title:"",status:MODULES[module].statuses[0],ownerId:user.id,data};
}
function download(content:string,name:string,type:string){const u=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function escapeHTML(v:unknown){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!))}

export default function CarritoApp(){
  const [session,setSession]=useState<Session|null>(null),[state,setState]=useState<State>(EMPTY),[loading,setLoading]=useState(true);
  const [demo,setDemo]=useState(false),[initialError,setInitialError]=useState(""),[section,setSection]=useState<Section>("purchases");
  const [query,setQuery]=useState(""),[scope,setScope]=useState("all"),[statusFilter,setStatusFilter]=useState("all"),[view,setView]=useState("board");
  const [selected,setSelected]=useState<RecordItem|null>(null),[creating,setCreating]=useState<Module|null>(null),[draft,setDraft]=useState<Draft|null>(null);
  const [editing,setEditing]=useState(false),[lease,setLease]=useState(""),[leaseLost,setLeaseLost]=useState(false),[dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(false),[formError,setFormError]=useState(""),[conflict,setConflict]=useState<RecordItem|null>(null);
  const [discard,setDiscard]=useState(false),[takeover,setTakeover]=useState(false),[requestRecord,setRequestRecord]=useState<RecordItem|null>(null),[requestReason,setRequestReason]=useState("");
  const [account,setAccount]=useState<User|"new"|null>(null),[passwordModal,setPasswordModal]=useState(false);
  const tokenRef=useRef(""),selectedRef=useRef<RecordItem|null>(null),leaseRef=useRef("");
  const user=session?.user;
  const api=useCallback((path:string,method="GET",data?:unknown)=>demoApi(path,method,data),[]);
  const refresh=useCallback(async(silent=false)=>{
    try{const next=await api("/state");setState(next);setInitialError("")}
    catch(e){if((e as RequestError).status===401){setSession(null);setState(EMPTY)}else if(!silent)toast.error((e as Error).message)}
  },[api]);
  const initialize=useCallback(async()=>{
    setLoading(true);setInitialError("");
    try{const config=await api("/config");setDemo(config.demo);try{const s=await api("/session");tokenRef.current=s.csrf;setSession(s);if(s.user.must_change_password)setPasswordModal(true)}catch(e){if((e as RequestError).status!==401)throw e}}
    catch(e){setInitialError((e as Error).message)}finally{setLoading(false)}
  },[api]);
  useEffect(()=>{void initialize()},[initialize]);
  useEffect(()=>{if(!session)return;void refresh();const t=setInterval(()=>void refresh(true),30000);return()=>clearInterval(t)},[session,refresh]);
  useEffect(()=>{selectedRef.current=selected;leaseRef.current=lease},[selected,lease]);
  useEffect(()=>{
    if(!editing||!selected||!lease)return;
    const t=setInterval(()=>{void api("/records/"+selected.id+"/lock","POST",{leaseId:lease}).then(()=>setLeaseLost(false)).catch(()=>setLeaseLost(true))},40000);
    return()=>clearInterval(t);
  },[editing,selected?.id,lease,api]);
  useEffect(()=>{
    const handler=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue=""}};
    window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);
  },[dirty]);
  useEffect(()=>{
    const context=(document as any).modelContext;if(!context?.registerTool||!session)return;
    const lifecycle=new AbortController();
    Promise.resolve(context.registerTool({name:"search_carrito_records",description:"Buscar registros que la cuenta actual puede consultar.",inputSchema:{type:"object",properties:{query:{type:"string",maxLength:200},module:{type:"string",enum:Object.keys(MODULES)}},required:["query"],additionalProperties:false},annotations:{readOnlyHint:true},execute:async(input:any)=>{
      if(typeof input?.query!=="string"||input.query.length>200||input.module&&!(input.module in MODULES))throw new Error("Búsqueda inválida.");
      const next=await api("/state");setState(next);setQuery(input.query);if(input.module)setSection(input.module);
      return {records:next.records.filter((r:RecordItem)=>(!input.module||r.module===input.module)&&(r.title+" "+r.data.contact).toLowerCase().includes(input.query.toLowerCase())).slice(0,25).map((r:RecordItem)=>({id:r.id,title:r.title,status:r.status,canEdit:r.canEdit}))};
    }},{signal:lifecycle.signal})).catch(()=>{});
    return()=>lifecycle.abort();
  },[session,api]);
  const login=async(email:string,password:string,demoUser?:string)=>{
    setBusy(true);setFormError("");
    try{const s=await api(demoUser?"/demo":"/login","POST",demoUser?{userId:demoUser}:{email,password});tokenRef.current=s.csrf;setSession({...s,demo});if(s.user.must_change_password)setPasswordModal(true);setSection("purchases");toast.success("Hola, "+s.user.name.split(" ")[0])}
    catch(e){setFormError((e as Error).message)}finally{setBusy(false)}
  };
  const logout=async()=>{try{await api("/logout","POST",{});tokenRef.current="";setSession(null);setState(EMPTY);closeEditor()}catch(e){toast.error((e as Error).message)}};
  const userById=(uid:string)=>state.users.find(u=>u.id===uid);
  const release=async()=>{if(selectedRef.current&&leaseRef.current){try{await api("/records/"+selectedRef.current.id+"/release","POST",{leaseId:leaseRef.current})}catch{}}};
  const closeEditor=()=>{void release();setSelected(null);setCreating(null);setDraft(null);setEditing(false);setLease("");setDirty(false);setFormError("");setConflict(null);setLeaseLost(false)};
  const askClose=()=>{if(dirty)setDiscard(true);else closeEditor()};
  const openRecord=(r:RecordItem)=>{setSelected(r);setDraft({title:r.title,status:r.status,ownerId:r.owner_id,data:{...r.data}});setEditing(false);setDirty(false);setFormError("");setConflict(null)};
  const beginEdit=async(force=false)=>{
    if(!selected)return;setBusy(true);setFormError("");const key=crypto.randomUUID();
    try{await api("/records/"+selected.id+"/lock","POST",{leaseId:key,force});const fresh=await api("/records/"+selected.id);setSelected(fresh);setDraft({title:fresh.title,status:fresh.status,ownerId:fresh.owner_id,data:{...fresh.data}});setLease(key);setEditing(true);setDirty(false);setLeaseLost(false)}
    catch(e){setFormError((e as Error).message);if((e as RequestError).status===423)setSelected(prev=>prev?{...prev,lockedBy:(e as RequestError).details?.lockedBy||"other"}:prev)}finally{setBusy(false)}
  };
  const create=(module:Module)=>{if(!user)return;setCreating(module);setDraft(emptyDraft(module,user));setEditing(true);setDirty(false);setFormError("")};
  const changeDraft=(next:Draft)=>{setDraft(next);setDirty(true);setFormError("")};
  const save=async()=>{
    if(!draft)return;setBusy(true);setFormError("");
    try{
      if(creating)await api("/records","POST",{...draft,module:creating});
      else if(selected)await api("/records/"+selected.id,"PATCH",{...draft,version:selected.version,leaseId:lease});
      closeEditor();await refresh();toast.success("Guardado en esta muestra");
    }catch(e){setFormError((e as Error).message);if((e as RequestError).status===409&&((e as RequestError).details?.record))setConflict((e as RequestError).details.record);if((e as RequestError).status===423)setLeaseLost(true)}
    finally{setBusy(false)}
  };
  const grant=async(rid:string,uid:string,revoke=false,hours:number|null=24)=>{
    try{await api("/records/"+rid+"/grant","POST",{userId:uid,revoke,hours});await refresh();toast.success(revoke?"Permiso revocado":"Permiso de edición otorgado")}catch(e){toast.error((e as Error).message)}
  };
  const decide=async(rid:string,status:string)=>{try{await api("/requests/"+rid,"POST",{status});await refresh();toast.success(status==="approved"?"Permiso aprobado por 24 horas":"Solicitud rechazada")}catch(e){toast.error((e as Error).message)}};
  const submitRequest=async()=>{
    if(!requestRecord)return;setBusy(true);
    try{await api("/records/"+requestRecord.id+"/request","POST",{reason:requestReason});setRequestRecord(null);setRequestReason("");await refresh();toast.success("Solicitud enviada al administrador")}
    catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
  };
  const transfer=async(uid:string)=>{
    if(!selected)return;try{await api("/records/"+selected.id+"/owner","POST",{ownerId:uid,version:selected.version});const fresh=await api("/records/"+selected.id);setSelected(fresh);await refresh();toast.success("Responsable actualizado")}catch(e){toast.error((e as Error).message)}
  };
  const sendOffer=async()=>{
    if(!selected)return;setBusy(true);try{const key=crypto.randomUUID();await api("/records/"+selected.id+"/lock","POST",{leaseId:key});await api("/records/"+selected.id+"/send","POST",{leaseId:key,version:selected.version});closeEditor();await refresh();toast.success("Oferta enviada por email")}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
  };
  const printContract=()=>{
    if(!selected)return;const r=selected,d=r.data,vehicle=state.records.find(x=>x.id===d.vehicleId);
    const logoUrl=escapeHTML(new URL("/carrito-logo.png",window.location.origin).href);
    const html='<!doctype html><html lang="es"><head><meta charset="utf-8"><title>'+escapeHTML(r.title)+'</title><style>body{font:16px/1.7 Arial,sans-serif;max-width:760px;margin:60px auto;color:#17212c}h1{font-size:30px}.brand img{display:block;width:240px;height:auto;max-width:100%}header{border-bottom:2px solid #17212c;padding-bottom:20px}.meta{margin:28px 0;padding:16px;background:#f2f5f7}.terms{white-space:pre-wrap}.signatures{display:flex;justify-content:space-between;margin-top:80px}.signature{border-top:1px solid #333;width:42%;padding-top:12px}button{padding:12px 20px;cursor:pointer}@media print{body{margin:25mm}button{display:none}}</style></head><body><header><div class="brand"><img src="'+logoUrl+'" width="512" height="166" alt="Carrito · Tienda de autos"></div><h1>'+escapeHTML(r.title)+'</h1><p>'+escapeHTML(d.type)+' · '+escapeHTML(r.status)+'</p></header><div class="meta">Cliente: '+escapeHTML(d.contact)+'<br>Documento: '+escapeHTML(d.document)+'<br>Domicilio: '+escapeHTML(d.address)+'<br>Vehículo: '+escapeHTML(vehicle?.title||"")+" "+escapeHTML(vehicle?.data.plate||"")+'<br>Fecha: '+escapeHTML(d.date)+'<br>Importe: '+escapeHTML(money(Number(d.amount||0),String(d.currency||"ARS")))+'</div><div class="terms">'+escapeHTML(d.terms)+'</div><div class="signatures"><div class="signature">Firma del cliente</div><div class="signature">Firma de Carrito</div></div><p><button onclick="window.print()">Imprimir / guardar PDF</button></p></body></html>';
    const blob=URL.createObjectURL(new Blob([html],{type:"text/html"}));const w=window.open(blob,"_blank","noopener,noreferrer");if(!w)toast.info("Permití ventanas emergentes para abrir el documento.");setTimeout(()=>URL.revokeObjectURL(blob),60000);
  };
  const exportRows=(rows:RecordItem[])=>{
    const safe=(v:unknown)=>{let s=String(v??"");if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
    const lines=[["Título","Estado","Responsable","Cliente / proveedor","Importe","Moneda"],...rows.map(r=>[r.title,r.status,userById(r.owner_id)?.name,r.data.contact||r.data.provider,r.module==="offers"?offerAmount(r.data):r.data.amount,r.data.currency])];
    download("\ufeff"+lines.map(line=>line.map(safe).join(";")).join("\r\n"),"carrito-"+section+".csv","text/csv;charset=utf-8");
  };
  const navigate=(s:Section)=>{setSection(s);setQuery("");setStatusFilter("all");setScope("all")};
  const module=section in MODULES?section as Module:null;
  const rows=state.records.filter(r=>(!module||r.module===module)&&(scope!=="mine"||r.owner_id===user?.id)&&(scope!=="shared"||(r.canEdit&&r.owner_id!==user?.id))&&(statusFilter==="all"||r.status===statusFilter)&&(r.title+" "+Object.values(r.data).join(" ")+" "+(userById(r.owner_id)?.name||"")).toLowerCase().includes(query.toLowerCase()));
  const title=module?MODULES[module].label:({overview:"Resumen del equipo",team:"Equipo y accesos",permissions:user?.role==="admin"?"Solicitudes de edición":"Mis solicitudes",activity:"Historial de cambios"} as any)[section];
  const today=new Date().toLocaleDateString("es-AR",{day:"numeric",month:"long",year:"numeric"});
  const followups=state.records.filter(r=>r.data.nextContact&&(!user||user.role==="admin"||r.owner_id===user.id)).sort((a,b)=>String(a.data.nextContact).localeCompare(String(b.data.nextContact))).slice(0,5);
  const pendingExpenses=state.records.filter(r=>r.module==="expenses"&&r.status==="Pendiente");
  const selectedModule=creating||selected?.module;
  const canWrite=!!(creating||selected?.canEdit);
  if(loading)return <div className="initial-loading"><Brand/><span className="loading-line"/><p>Cargando el acceso al equipo…</p></div>;
  if(!session)return <Login demo={demo} busy={busy} error={formError||initialError} onLogin={login} onRetry={initialize}/>;

  return <SidebarProvider style={{"--sidebar-width":"235px","--sidebar-width-mobile":"260px"} as any}>
    <Sidebar className="carrito-sidebar"><SidebarHeader className="sidebar-brand"><Brand/></SidebarHeader>
      <SidebarContent>
        <SidebarGroup><SidebarGroupLabel className="nav-group-label">OPERACIONES</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
          <SidebarMenuItem><SidebarMenuButton className="nav-button" isActive={section==="overview"} onClick={()=>navigate("overview")}><LayoutDashboard/><span>Resumen</span></SidebarMenuButton></SidebarMenuItem>
          {(Object.keys(MODULES) as Module[]).map(m=>{const Icon=ICONS[m];return <SidebarMenuItem key={m}><SidebarMenuButton className="nav-button" isActive={section===m} onClick={()=>navigate(m)}><Icon/><span>{MODULES[m].label}</span>{m==="purchases"&&<span className="nav-count">{state.records.filter(r=>r.module===m&&!["Comprado","Descartado"].includes(r.status)).length}</span>}</SidebarMenuButton></SidebarMenuItem>})}
        </SidebarMenu></SidebarGroupContent></SidebarGroup>
        <SidebarGroup><SidebarGroupLabel className="nav-group-label">CONTROL DEL EQUIPO</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
          {user?.role==="admin"&&<SidebarMenuItem><SidebarMenuButton className="nav-button" isActive={section==="team"} onClick={()=>navigate("team")}><ShieldCheck/><span>Equipo y accesos</span></SidebarMenuButton></SidebarMenuItem>}
          <SidebarMenuItem><SidebarMenuButton className="nav-button" isActive={section==="permissions"} onClick={()=>navigate("permissions")}><KeyRound/><span>{user?.role==="admin"?"Solicitudes de edición":"Mis solicitudes"}</span>{state.requests.length>0&&<span className="nav-count amber">{state.requests.length}</span>}</SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton className="nav-button" isActive={section==="activity"} onClick={()=>navigate("activity")}><History/><span>Historial de cambios</span></SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu></SidebarGroupContent></SidebarGroup>
        <div className="sidebar-access-note"><ShieldCheck size={20}/><p>Roles de ejemplo<small>Cada registro tiene su responsable.</small></p></div>
      </SidebarContent>
      <SidebarFooter className="sidebar-profile"><Avatar user={user}/><div><strong>{user?.name}</strong><span>{user?.role==="admin"?"Administrador":"Empleado"}</span></div><button className="sidebar-logout" aria-label="Cerrar sesión" onClick={logout}><LogOut size={18}/></button></SidebarFooter>
    </Sidebar>
    <SidebarInset className="workspace"><header className="topbar"><div className="breadcrumb"><SidebarTrigger className="mobile-trigger"/><span>Carrito</span><ChevronRight size={14}/><strong>{title}</strong></div><div className="topbar-right">{demo&&<span className="demo-label">Datos de ejemplo</span>}<span className="topbar-date">{today}</span><button className="topbar-account" onClick={()=>setPasswordModal(true)} title="Cambiar mi contraseña"><Avatar user={user} size="small"/></button></div></header>
      <div className="demo-notice" role="status"><div><strong>Vista de demostración</strong><span>Datos ficticios · Los cambios se reinician al recargar.</span></div><button onClick={()=>window.location.reload()}>Reiniciar muestra</button></div><main className="work-main">
        <div className="page-heading"><div><div className="page-eyebrow">ESPACIO DE TRABAJO</div><h1>{title}</h1><p>{module==="purchases"?"Cada oportunidad, desde el primer contacto hasta la compra.":module==="sales"?"Seguimiento de interesados, visitas y reservas.":module==="stock"?"Vehículos, costos y estado de cada unidad.":module==="expenses"?"Gastos del negocio y costos asociados a cada vehículo.":module==="offers"?"Cotizaciones y propuestas con sus condiciones.":module==="contracts"?"Documentos de cada operación y sus versiones.":section==="team"?"Cuentas individuales y permisos de edición.":section==="permissions"?"Autorizaciones para trabajar sobre registros de otros responsables.":section==="activity"?"Quién hizo cada cambio y cuándo.":"Operaciones y próximos pasos del equipo."}</p></div>
          <div className="heading-actions"><Button variant="outline" className="secondary-button" onClick={()=>refresh()} aria-label="Actualizar datos"><RefreshCw size={16}/><span className="hide-mobile">Actualizar</span></Button>{module&&<Button className="primary-button" onClick={()=>create(module)}><Plus size={18}/>Nuevo {MODULES[module].singular}</Button>}{section==="team"&&<Button className="primary-button" onClick={()=>setAccount("new")}><Plus size={18}/>Nuevo empleado</Button>}</div>
        </div>
        {section==="overview"?<Overview state={state} user={user!} onOpen={openRecord} onNavigate={navigate}/>:
        section==="team"?<Team state={state} onEdit={setAccount} user={user!}/>:
        section==="permissions"?<Requests state={state} user={user!} onDecide={decide} onOpen={openRecord}/>:
        section==="activity"?<Activity events={state.audit}/>:
        module&&<>
          <div className="metrics-row">
            <Metric label={module==="purchases"?"Oportunidades activas":"Registros"} value={String(state.records.filter(r=>r.module===module&&!(module==="purchases"&&["Comprado","Descartado"].includes(r.status))).length)} icon={ICONS[module]} subtitle="En este módulo"/>
            <Metric label="A mi cargo" value={String(state.records.filter(r=>r.module===module&&r.owner_id===user?.id).length)} icon={UserRound} subtitle="Edición disponible"/>
            <Metric label={module==="expenses"?"Pendiente en pesos":"Próximos contactos"} value={module==="expenses"?money(pendingExpenses.filter(r=>r.data.currency==="ARS").reduce((s,r)=>s+Number(r.data.amount||0),0)):String(state.records.filter(r=>r.module===module&&r.data.nextContact).length)} icon={CalendarDays} subtitle={module==="expenses"?"ARS, sin sumar dólares":"Con fecha de seguimiento"}/>
            <Metric label="Accesos compartidos" value={String(state.grants.filter(g=>state.records.some(r=>r.id===g.record_id&&r.module===module)).length)} icon={ShieldCheck} subtitle="Permisos explícitos"/>
          </div>
          <div className="operations-layout"><section className="records-surface">
            <div className="filter-row"><Tabs value={scope} onValueChange={setScope}><TabsList className="scope-tabs"><TabsTrigger value="all">Todo el equipo</TabsTrigger><TabsTrigger value="mine">A mi cargo</TabsTrigger><TabsTrigger value="shared">Compartidos</TabsTrigger></TabsList></Tabs><span className="record-count">{rows.length} registros</span></div>
            <div className="toolbar"><div className="search-field"><Search size={17}/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar vehículo, cliente o responsable…" aria-label="Buscar registros"/></div>
              <Choice value={statusFilter} onChange={v=>setStatusFilter(v||"all")} options={[{value:"all",label:"Todos los estados"},...MODULES[module].statuses.map(s=>({value:s,label:s}))]} placeholder="Estado"/>
              <Button variant="outline" className="export-button" onClick={()=>exportRows(rows)} title="Exportar registros filtrados"><ArrowDownToLine size={16}/><span className="hide-mobile">Exportar</span></Button>
              <div className="view-switch"><button aria-label="Vista de tablero" aria-pressed={view==="board"} className={view==="board"?"active":""} onClick={()=>setView("board")}><LayoutGrid size={17}/></button><button aria-label="Vista de tabla" aria-pressed={view==="table"} className={view==="table"?"active":""} onClick={()=>setView("table")}><List size={18}/></button></div>
            </div>
            {view==="board"?<Board module={module} rows={rows} users={state.users} onOpen={openRecord} onCreate={create} onRequest={r=>{setRequestRecord(r);setRequestReason("")}}/>:<RecordTable rows={rows} users={state.users} onOpen={openRecord}/>}
            {!rows.length&&<div className="empty-state"><Search size={24}/><h3>No hay registros para esta vista</h3><p>Probá otra búsqueda o agregá un registro.</p></div>}
          </section>
          <aside className="daily-panel"><div className="daily-heading"><Clock3 size={19}/><h2>Próximos contactos</h2></div><p className="daily-subtitle">{user?.role==="admin"?"Agenda del equipo":"Tu agenda"}</p>
            <div className="followup-list">{followups.map(r=><button key={r.id} className="followup-item" onClick={()=>openRecord(r)}><span className="followup-time">{String(r.data.nextContact).slice(11,16)}<small>{dateLabel(String(r.data.nextContact))}</small></span><span><strong>{String(r.data.contact||r.title)}</strong><small>{r.title}</small><span className="followup-owner">{userById(r.owner_id)?.name.split(" ")[0]}</span></span></button>)}{!followups.length&&<p className="empty-copy">No hay contactos agendados.</p>}</div>
            <div className="permissions-reminder"><LockKeyhole size={22}/><strong>Consultar es compartido.<br/>Editar tiene responsable.</strong><p>Pedí acceso cuando necesites trabajar sobre una ficha de otro empleado.</p><Button variant="outline" onClick={()=>navigate("permissions")}>Ver solicitudes</Button></div>
          </aside></div>
        </>}
        <footer className="workspace-footer"><span><ShieldCheck size={14}/>Recorrido de muestra · Permisos simulados.</span><span>Carrito · Gestión del equipo</span></footer>
      </main>
    </SidebarInset>
    <Sheet open={!!selected||!!creating} onOpenChange={open=>{if(!open)askClose()}}><SheetContent className="record-sheet">
      <SheetHeader className="record-sheet-header"><div className="sheet-eyebrow">{selectedModule&&MODULES[selectedModule].label}<span>{creating?"Nuevo registro":"Ficha "+(selected?.id.slice(0,8)||"")}</span></div><SheetTitle className="sheet-title">{creating?"Nuevo "+MODULES[creating].singular:selected?.title}</SheetTitle><SheetDescription>{selected?<><span className={"status-chip "+statusClass(selected.status)}>{selected.status}</span><span className="sheet-owner">Responsable: {userById(selected.owner_id)?.name}</span></>:"Los datos se guardan con tu cuenta y responsable."}</SheetDescription></SheetHeader>
      {selectedModule&&draft&&<Tabs defaultValue="data" className="record-tabs"><TabsList className="detail-tabs"><TabsTrigger value="data">Ficha</TabsTrigger>{selected&&user?.role==="admin"&&<TabsTrigger value="access">Accesos</TabsTrigger>}{selected&&<TabsTrigger value="history">Historial</TabsTrigger>}</TabsList>
        <TabsContent value="data" className="detail-tab-body">
          {selected&&!editing&&<div className={"access-banner "+(canWrite?"can-edit":"read-only")}><span>{canWrite?<ShieldCheck size={18}/>:<Eye size={18}/>}<strong>{canWrite?"Tenés permiso de edición":"Acceso de lectura"}</strong></span>{canWrite?<Button size="sm" className="primary-button" onClick={()=>beginEdit()} disabled={busy}><Edit3 size={14}/>Editar ficha</Button>:<Button size="sm" variant="outline" onClick={()=>{setRequestRecord(selected);setRequestReason("")}}>Solicitar permiso</Button>}</div>}
          {editing&&<div className={"editing-banner "+(leaseLost?"lost":"")}><LockKeyhole size={17}/><span>{leaseLost?"El bloqueo venció. Recuperá la edición para guardar.":"Esta ficha está reservada para tu edición."}</span>{leaseLost&&selected&&<Button variant="outline" size="sm" onClick={()=>api("/records/"+selected.id+"/lock","POST",{leaseId:lease}).then(()=>setLeaseLost(false)).catch(e=>setFormError(e.message))}>Recuperar</Button>}</div>}
          {formError&&<div className="form-error" role="alert"><AlertTriangle size={17}/><div>{formError}{selected?.lockedBy&&user?.role==="admin"&&!editing&&<Button size="sm" variant="outline" onClick={()=>setTakeover(true)}>Tomar control de la edición</Button>}</div></div>}
          {conflict&&<div className="conflict-box"><h3>La ficha tiene cambios nuevos</h3><p>Tu borrador sigue en el formulario. Guardalo antes de cargar la versión actual.</p><div className="conflict-actions"><Button variant="outline" onClick={()=>download(JSON.stringify(draft,null,2),"borrador-carrito.json","application/json")}>Descargar mi borrador</Button><Button variant="outline" onClick={()=>{setSelected(conflict);setDraft({title:conflict.title,status:conflict.status,ownerId:conflict.owner_id,data:{...conflict.data}});setConflict(null);setDirty(false);setFormError("")}}>Cargar versión actual</Button></div></div>}
          <RecordForm module={selectedModule} draft={draft} onChange={changeDraft} disabled={!editing} users={state.users} records={state.records} canAssign={!!creating&&user?.role==="admin"}/>
          {selectedModule==="offers"&&<div className="offer-result"><span>Oferta calculada</span><strong>{money(offerAmount(draft.data),String(draft.data.currency||"ARS"))}</strong><small>Valor estimado menos margen y gastos.</small></div>}
          {selectedModule==="stock"&&selected&&<VehicleCosts record={selected} records={state.records}/>}
          {selectedModule==="offers"&&selected&&!editing&&<div className="document-actions"><Button variant="outline" onClick={()=>download("To: "+String(selected.data.email||"")+"\r\nSubject: Propuesta de Carrito\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nHola "+String(selected.data.contact||"")+",\n\nNuestra propuesta para "+selected.title+" es de "+money(offerAmount(selected.data),String(selected.data.currency||"ARS"))+".\n\n"+String(selected.data.notes||"")+"\n\nCarrito · Tienda de autos","oferta-carrito.eml","message/rfc822")}><Mail size={16}/>Descargar correo</Button><Button className="primary-button" disabled={!session.mailConfigured||!selected.canEdit||selected.status!=="Aprobada"||!!selected.data.emailSentAt||busy} onClick={sendOffer}><Send size={16}/>{selected.data.emailSentAt?"Correo enviado":"Enviar oferta"}</Button>{!session.mailConfigured&&<p>Vista de muestra. No se envían correos.</p>}</div>}
          {selectedModule==="contracts"&&selected&&!editing&&<div className="document-actions"><Button className="primary-button" onClick={printContract}><Printer size={16}/>Imprimir / guardar PDF</Button><p>Se genera con el texto y los datos guardados en esta ficha.</p></div>}
        </TabsContent>
        {selected&&<TabsContent value="access" className="detail-tab-body"><AccessPanel record={selected} state={state} onGrant={grant} onTransfer={transfer}/></TabsContent>}
        {selected&&<TabsContent value="history" className="detail-tab-body"><Activity events={state.audit.filter(e=>e.record_id===selected.id)} compact/></TabsContent>}
      </Tabs>}
      <div className="sheet-bottom">{editing?<><Button variant="outline" onClick={askClose}>Cancelar</Button><Button className="primary-button" onClick={save} disabled={busy||leaseLost||!!conflict}>{busy?"Guardando…":"Guardar cambios"}</Button></>:<><small>{selected?"Versión "+selected.version+" · "+dateLabel(selected.updated_at):""}</small><Button variant="outline" onClick={askClose}>Cerrar ficha</Button></>}</div>
    </SheetContent></Sheet>
    <Dialog open={!!requestRecord} onOpenChange={open=>{if(!open)setRequestRecord(null)}}><DialogContent><DialogHeader><DialogTitle>Solicitar permiso de edición</DialogTitle><DialogDescription>{requestRecord?.title}</DialogDescription></DialogHeader><Label htmlFor="request-reason">Motivo de la solicitud</Label><Textarea id="request-reason" value={requestReason} onChange={e=>setRequestReason(e.target.value)} placeholder="Por ejemplo: continuar el seguimiento durante una ausencia."/><p className="helper-text">El administrador puede autorizar la edición por 24 horas.</p><Button className="primary-button" disabled={busy||!requestReason.trim()} onClick={submitRequest}>Enviar solicitud</Button></DialogContent></Dialog>
    <AccountDialog account={account} onClose={()=>setAccount(null)} api={api} onSaved={refresh}/>
    <PasswordDialog open={passwordModal} required={!!user?.must_change_password} onClose={()=>setPasswordModal(false)} api={api} onSaved={async()=>{const s=await api("/session");setSession(s);setPasswordModal(false);toast.success("Contraseña actualizada")}}/>
    <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Descartar este borrador?</AlertDialogTitle><AlertDialogDescription>Los cambios que todavía no guardaste se perderán.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Seguir editando</AlertDialogCancel><AlertDialogAction onClick={()=>{setDiscard(false);closeEditor()}}>Descartar borrador</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={takeover} onOpenChange={setTakeover}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Tomar control de la edición</AlertDialogTitle><AlertDialogDescription>La otra persona conservará su borrador, pero no podrá guardarlo sobre tus cambios. Esta acción quedará en el historial.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={()=>{setTakeover(false);void beginEdit(true)}}>Tomar control</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Toaster position="bottom-right" richColors/>
  </SidebarProvider>;
}

function Login({busy,error,onLogin}:{demo:boolean;busy:boolean;error:string;onLogin:(e:string,p:string,d?:string)=>void;onRetry:()=>void}){
  return <div className="login-page"><div className="login-brand"><Brand/></div><div className="login-surface"><div className="login-icon"><ShieldCheck size={28}/></div><span className="page-eyebrow">DEMOSTRACIÓN PARA CARRITO</span><h1>Conocé tu espacio de trabajo.</h1><p>Recorré el panel con un perfil de ejemplo para ver las operaciones y los accesos del equipo.</p><div className="demo-access"><Button className="primary-button" onClick={()=>onLogin("","","demo-admin")} disabled={busy}><ShieldCheck size={17}/>Entrar como administrador</Button><div><Button variant="outline" onClick={()=>onLogin("","","demo-lucia")} disabled={busy}>Empleado: Lucía</Button><Button variant="outline" onClick={()=>onLogin("","","demo-mateo")} disabled={busy}>Empleado: Mateo</Button></div><small>Datos ficticios. Los cambios duran hasta recargar la página.</small></div>{error&&<div className="form-error">{error}</div>}<button className="text-button demo-reset-login" onClick={()=>window.location.reload()}>Reiniciar muestra</button></div><footer>Carrito · Tienda de autos<span>Muestra navegable · Accesos simulados</span></footer></div>;
}
function Metric({label,value,subtitle,icon:Icon}:{label:string;value:string;subtitle:string;icon:any}){return <div className="metric"><div><span>{label}</span><strong>{value}</strong><small>{subtitle}</small></div><span className="metric-icon"><Icon size={20}/></span></div>}
function Board({module,rows,users,onOpen,onCreate,onRequest}:{module:Module;rows:RecordItem[];users:User[];onOpen:(r:RecordItem)=>void;onCreate:(m:Module)=>void;onRequest:(r:RecordItem)=>void}){
  const stages=MODULES[module].statuses.filter(s=>!["Comprado","Descartado","Vendido","Rechazada","Aceptada","Firmado"].includes(s)||rows.some(r=>r.status===s));
  return <div className="kanban-board" style={{"--columns":stages.length} as any}>{stages.map(stage=><div className="kanban-column" key={stage}><div className="column-heading"><span className={"stage-dot "+statusClass(stage)}/><h2>{stage}</h2><span className="column-count">{rows.filter(r=>r.status===stage).length}</span><button aria-label={"Agregar "+MODULES[module].singular} onClick={()=>onCreate(module)}><Plus size={16}/></button></div><div className="column-cards">{rows.filter(r=>r.status===stage).map(r=><RecordCard key={r.id} record={r} owner={users.find(u=>u.id===r.owner_id)} onOpen={()=>onOpen(r)} onRequest={()=>onRequest(r)}/>)}{!rows.some(r=>r.status===stage)&&<div className="empty-column">Sin registros</div>}</div></div>)}</div>;
}
function RecordCard({record:r,owner,onOpen,onRequest}:{record:RecordItem;owner?:User;onOpen:()=>void;onRequest:()=>void}){
  const amount=r.module==="offers"?offerAmount(r.data):Number(r.data.amount||0);
  return <article className="record-card"><button className="card-content" onClick={onOpen}><div className="card-top"><span className="source-chip">{String(r.data.source||r.data.category||r.data.type||r.data.operation||MODULES[r.module].singular)}</span><span className={"card-access "+(r.canEdit?"editable":"")} title={r.canEdit?"Podés editar":"Solo lectura"}>{r.canEdit?<Edit3 size={13}/>:<LockKeyhole size={13}/>}</span></div><h3>{r.title}</h3><span className="card-specs">{[r.data.year,r.data.km?Number(r.data.km).toLocaleString("es-AR")+" km":r.data.plate].filter(Boolean).join(" · ")||r.data.provider||r.data.type||"Ficha de operación"}</span><div className="card-contact"><UserRound size={14}/><span>{String(r.data.contact||r.data.provider||r.data.location||"Sin contacto")}</span></div>{amount>0&&<strong className="card-price">{money(amount,String(r.data.currency||"ARS"))}</strong>}{r.data.notes&&<p className="card-note">{String(r.data.notes)}</p>}</button><div className="card-footer"><span className="card-owner"><Avatar user={owner} size="small"/><span>{owner?.name.split(" ")[0]}</span></span>{r.lockedBy?<span className="editing-indicator"><LockKeyhole size={12}/>En edición</span>:r.canEdit?<button className="card-open" onClick={onOpen}>Abrir ficha<ChevronRight size={14}/></button>:<button className="card-permission" onClick={onRequest}>Pedir permiso</button>}</div>{r.data.nextContact&&<div className="card-next"><Clock3 size={13}/>{dateLabel(String(r.data.nextContact))} · {String(r.data.nextContact).slice(11,16)}</div>}</article>;
}
function RecordTable({rows,users,onOpen}:{rows:RecordItem[];users:User[];onOpen:(r:RecordItem)=>void}){
  return <div className="record-table"><Table><TableHeader><TableRow><TableHead>Registro</TableHead><TableHead>Estado</TableHead><TableHead>Cliente / proveedor</TableHead><TableHead>Responsable</TableHead><TableHead>Importe</TableHead><TableHead>Acceso</TableHead></TableRow></TableHeader><TableBody>{rows.map(r=><TableRow key={r.id} className="clickable-row" onClick={()=>onOpen(r)}><TableCell><button className="table-record-title">{r.title}</button><small>{String(r.data.plate||r.data.source||"")}</small></TableCell><TableCell><span className={"status-chip "+statusClass(r.status)}>{r.status}</span></TableCell><TableCell>{String(r.data.contact||r.data.provider||"—")}</TableCell><TableCell>{users.find(u=>u.id===r.owner_id)?.name}</TableCell><TableCell>{r.data.amount||r.module==="offers"?money(r.module==="offers"?offerAmount(r.data):Number(r.data.amount),String(r.data.currency||"ARS")):"—"}</TableCell><TableCell><span className={"access-tag "+(r.canEdit?"":"read-only")}>{r.canEdit?<Edit3 size={13}/>:<Eye size={13}/>} {r.canEdit?"Edición":"Lectura"}</span></TableCell></TableRow>)}</TableBody></Table></div>;
}
function RecordForm({module,draft,onChange,disabled,users,records,canAssign}:{module:Module;draft:Draft;onChange:(d:Draft)=>void;disabled:boolean;users:User[];records:RecordItem[];canAssign:boolean}){
  const update=(key:string,value:string)=>onChange({...draft,data:{...draft.data,[key]:value}});
  return <div className="record-form"><div className="form-field wide"><Label htmlFor="record-title">{module==="expenses"?"Concepto":module==="sales"?"Título de la oportunidad":module==="contracts"?"Título del documento":"Vehículo / título"}<span>*</span></Label><Input id="record-title" value={draft.title} onChange={e=>onChange({...draft,title:e.target.value})} disabled={disabled} maxLength={160}/></div><div className="form-field"><Label>Estado</Label><Choice value={draft.status} onChange={v=>onChange({...draft,status:v})} options={MODULES[module].statuses.map(s=>({value:s,label:s}))} disabled={disabled}/></div><div className="form-field"><Label>Responsable</Label><Choice value={draft.ownerId} onChange={v=>onChange({...draft,ownerId:v})} options={users.filter(u=>u.active).map(u=>({value:u.id,label:u.name}))} disabled={disabled||!canAssign}/></div>
    {MODULES[module].fields.map(f=><div className={"form-field "+(f.wide?"wide":"")} key={f.key}><Label htmlFor={"field-"+f.key}>{f.label}{f.required&&<span>*</span>}</Label>{f.options?<Choice value={String(draft.data[f.key]??"")} onChange={v=>update(f.key,v)} options={f.options.map(o=>({value:o,label:o}))} disabled={disabled}/>:f.type==="vehicle"?<Choice value={String(draft.data[f.key]??"")} onChange={v=>update(f.key,v)} options={records.filter(r=>r.module==="stock").map(r=>({value:r.id,label:r.title+" · "+String(r.data.plate||"")}))} placeholder="Sin vehículo asociado" disabled={disabled}/>:f.type==="textarea"?<Textarea id={"field-"+f.key} value={String(draft.data[f.key]??"")} onChange={e=>update(f.key,e.target.value)} disabled={disabled} rows={f.key==="terms"?8:3}/>:<Input id={"field-"+f.key} type={f.type||"text"} value={String(draft.data[f.key]??"")} onChange={e=>update(f.key,e.target.value)} disabled={disabled} min={f.type==="number"?0:undefined} step={f.type==="number"?"any":undefined}/>}</div>)}
  </div>;
}
function VehicleCosts({record:r,records}:{record:RecordItem;records:RecordItem[]}){
  const expenses=records.filter(e=>e.module==="expenses"&&e.data.vehicleId===r.id),currency=String(r.data.currency||"ARS");
  const sum=(c:string)=>expenses.filter(e=>e.data.currency===c).reduce((s,e)=>s+Number(e.data.amount||0),0);
  const purchase=Number(r.data.purchasePrice||0),asking=Number(r.data.amount||0),cost=purchase+sum(currency);
  return <div className="vehicle-costs"><h3>Costos del vehículo</h3><dl><div><dt>Compra</dt><dd>{money(purchase,currency)}</dd></div><div><dt>Gastos {currency}</dt><dd>{money(sum(currency),currency)}</dd></div><div><dt>Costo acumulado {currency}</dt><dd>{money(cost,currency)}</dd></div><div><dt>Margen a precio publicado</dt><dd>{money(asking-cost,currency)}</dd></div></dl>{sum(currency==="ARS"?"USD":"ARS")>0&&<p>También hay {money(sum(currency==="ARS"?"USD":"ARS"),currency==="ARS"?"USD":"ARS")} de gastos. No se convierten sin una cotización definida.</p>}<small>El margen mostrado corresponde al precio de publicación, no a una venta cerrada.</small></div>;
}
function AccessPanel({record,state,onGrant,onTransfer}:{record:RecordItem;state:State;onGrant:(r:string,u:string,revoke?:boolean,hours?:number|null)=>void;onTransfer:(u:string)=>void}){
  const [target,setTarget]=useState(""),[duration,setDuration]=useState("24"),[owner,setOwner]=useState(record.owner_id);
  const grants=state.grants.filter(g=>g.record_id===record.id);
  return <div className="access-panel"><h3>Responsable de la ficha</h3><p>Puede editar sin solicitar autorización.</p><div className="inline-form"><Choice value={owner} onChange={setOwner} options={state.users.filter(u=>u.active).map(u=>({value:u.id,label:u.name}))}/><Button variant="outline" disabled={owner===record.owner_id||!owner} onClick={()=>onTransfer(owner)}>Asignar</Button></div><h3>Autorizar a otro empleado</h3><div className="form-field"><Label>Empleado</Label><Choice value={target} onChange={setTarget} options={state.users.filter(u=>u.active&&u.role==="employee"&&u.id!==record.owner_id).map(u=>({value:u.id,label:u.name}))}/></div><div className="inline-form"><Choice value={duration} onChange={setDuration} options={[{value:"24",label:"Por 24 horas"},{value:"168",label:"Por 7 días"},{value:"permanent",label:"Hasta revocar"}]}/><Button className="primary-button" disabled={!target} onClick={()=>onGrant(record.id,target,false,duration==="permanent"?null:Number(duration))}>Autorizar</Button></div><h3>Permisos vigentes</h3>{grants.map(g=><div className="grant-row" key={g.user_id}><Avatar user={state.users.find(u=>u.id===g.user_id)}/><div><strong>{state.users.find(u=>u.id===g.user_id)?.name}</strong><small>{g.expires_at?"Hasta "+new Date(g.expires_at).toLocaleString("es-AR"):"Hasta revocar"}</small></div><Button variant="outline" size="sm" onClick={()=>onGrant(record.id,g.user_id,true)}>Revocar</Button></div>)}{!grants.length&&<p className="empty-copy">No hay permisos adicionales.</p>}<div className="permission-rules"><ShieldCheck size={21}/><p>El administrador conserva acceso completo. Un permiso de edición no habilita administrar cuentas ni asignar responsables.</p></div></div>;
}
function Team({state,onEdit,user}:{state:State;onEdit:(u:User)=>void;user:User}){
  return <><div className="team-policy"><ShieldCheck size={24}/><div><h2>Una cuenta por persona</h2><p>Los empleados consultan las fichas del equipo y editan las propias o autorizadas. Los administradores gestionan todos los registros y accesos.</p></div></div><div className="team-grid">{state.users.map(u=><article className="team-card" key={u.id}><div className="team-card-heading"><Avatar user={u}/><span className={"status-chip "+(u.active?"status-green":"status-gray")}>{u.active?"Activo":"Desactivado"}</span></div><h2>{u.name}</h2><p>{u.email}</p><span className="role-chip">{u.role==="admin"?<ShieldCheck size={14}/>:<UserRound size={14}/>} {u.role==="admin"?"Administrador":"Empleado"}</span><div className="team-details"><div><strong>{state.records.filter(r=>r.owner_id===u.id).length}</strong><span>registros a cargo</span></div><div><strong>{state.grants.filter(g=>g.user_id===u.id).length}</strong><span>accesos adicionales</span></div></div><Button variant="outline" className="team-edit" onClick={()=>onEdit(u)}><KeyRound size={16}/>Gestionar acceso{u.id===user.id&&<small>Tu cuenta</small>}</Button></article>)}</div></>;
}
function Requests({state,user,onDecide,onOpen}:{state:State;user:User;onDecide:(id:string,s:string)=>void;onOpen:(r:RecordItem)=>void}){
  return <div className="requests-list">{state.requests.map(req=>{const r=state.records.find(r=>r.id===req.record_id),u=state.users.find(u=>u.id===req.user_id);return <article className="request-card" key={req.id}><Avatar user={u}/><div className="request-main"><h2>{u?.name} <span>solicita editar</span></h2><button className="text-button" onClick={()=>r&&onOpen(r)}>{r?.title||"Registro"}</button><p>{req.reason}</p><small>{dateLabel(req.created_at)} · Pendiente de autorización</small></div>{user.role==="admin"?<div className="request-actions"><Button variant="outline" onClick={()=>onDecide(req.id,"rejected")}>Rechazar</Button><Button className="primary-button" onClick={()=>onDecide(req.id,"approved")}><Check size={16}/>Autorizar 24 h</Button></div>:<span className="status-chip status-amber">Pendiente</span>}</article>})}{!state.requests.length&&<div className="empty-state large"><ShieldCheck size={34}/><h2>No hay solicitudes pendientes</h2><p>Las solicitudes de permiso de edición aparecerán acá.</p></div>}</div>;
}
function Activity({events,compact=false}:{events:any[];compact?:boolean}){
  return <div className={"activity-list "+(compact?"compact":"")}>{events.map(e=><div className="activity-row" key={e.id}><span className="activity-marker"><History size={15}/></span><div><strong>{e.action}</strong><p>{e.record_title||"Cuenta del equipo"}</p><small>{e.user_name||"Equipo"} · {new Date(e.created_at).toLocaleString("es-AR")}</small></div></div>)}{!events.length&&<p className="empty-copy">Todavía no hay cambios registrados.</p>}</div>;
}
function Overview({state,user,onOpen,onNavigate}:{state:State;user:User;onOpen:(r:RecordItem)=>void;onNavigate:(s:Section)=>void}){
  return <><div className="metrics-row"><Metric label="Leads de compra" value={String(state.records.filter(r=>r.module==="purchases").length)} subtitle="Oportunidades registradas" icon={ShoppingBag}/><Metric label="Vehículos disponibles" value={String(state.records.filter(r=>r.module==="stock"&&r.status==="Disponible").length)} subtitle="En stock" icon={CarFront}/><Metric label="Reservas" value={String(state.records.filter(r=>r.module==="sales"&&r.status==="Señado").length)} subtitle="Operaciones con seña" icon={Wallet}/><Metric label="Solicitudes" value={String(state.requests.length)} subtitle="Pendientes de autorización" icon={KeyRound}/></div><div className="overview-grid"><section className="overview-panel"><h2>Operaciones recientes</h2>{state.records.slice(0,7).map(r=><button className="recent-row" key={r.id} onClick={()=>onOpen(r)}><span className="recent-icon"><CarFront size={20}/></span><span><strong>{r.title}</strong><small>{MODULES[r.module].label}</small></span><span className={"status-chip "+statusClass(r.status)}>{r.status}</span><ChevronRight size={16}/></button>)}</section><section className="overview-panel"><h2>Distribución del trabajo</h2>{state.users.filter(u=>u.active).map(u=><div className="workload-row" key={u.id}><Avatar user={u}/><div><strong>{u.name}</strong><small>{u.role==="admin"?"Administrador":"Empleado"}</small></div><span>{state.records.filter(r=>r.owner_id===u.id).length} fichas</span></div>)}<div className="overview-note"><ShieldCheck size={24}/><p>Cada operación tiene un responsable y un historial de cambios.</p></div>{user.role==="admin"&&<Button variant="outline" onClick={()=>onNavigate("team")}>Gestionar equipo</Button>}</section></div></>;
}
function AccountDialog({account,onClose,api,onSaved}:{account:User|"new"|null;onClose:()=>void;api:any;onSaved:any}){
  const [name,setName]=useState(""),[email,setEmail]=useState(""),[role,setRole]=useState("employee"),[password,setPassword]=useState(""),[active,setActive]=useState("1"),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{if(account){setName(account==="new"?"":account.name);setEmail(account==="new"?"":account.email);setRole(account==="new"?"employee":account.role);setActive(account==="new"?"1":String(account.active));setPassword("");setError("")}},[account]);
  const submit=async(e:FormEvent)=>{e.preventDefault();if(!account)return;setBusy(true);setError("");try{await api(account==="new"?"/users":"/users/"+account.id,account==="new"?"POST":"PATCH",{name,email,role,password:password||undefined,active:active==="1"});await onSaved();onClose();toast.success(account==="new"?"Empleado agregado a esta muestra.":"Acceso actualizado")}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
  return <Dialog open={!!account} onOpenChange={o=>{if(!o)onClose()}}><DialogContent className="account-dialog"><DialogHeader><DialogTitle>{account==="new"?"Crear acceso de empleado":"Gestionar acceso"}</DialogTitle><DialogDescription>Simulación de administración. No se crean accesos reales.</DialogDescription></DialogHeader><form onSubmit={submit} className="account-form"><div className="form-field"><Label htmlFor="account-name">Nombre y apellido</Label><Input id="account-name" value={name} onChange={e=>setName(e.target.value)} required/></div><div className="form-field"><Label htmlFor="account-email">Email de acceso</Label><Input id="account-email" value={email} type="email" onChange={e=>setEmail(e.target.value)} disabled={account!=="new"} required/></div><div className="form-field"><Label>Rol</Label><Choice value={role} onChange={setRole} options={[{value:"employee",label:"Empleado"},{value:"admin",label:"Administrador"}]}/></div>{account!=="new"&&<div className="form-field"><Label>Estado de la cuenta</Label><Choice value={active} onChange={setActive} options={[{value:"1",label:"Activa"},{value:"0",label:"Desactivada"}]}/></div>}<div className="form-field"><Label htmlFor="account-password">{account==="new"?"Clave de ejemplo (no usar una real)":"Clave de ejemplo (opcional)"}</Label><Input id="account-password" type="password" autoComplete="new-password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)} required={account==="new"}/><small>Mínimo 12 caracteres.</small></div>{error&&<div className="form-error" role="alert">{error}</div>}<Button type="submit" className="primary-button" disabled={busy}>{busy?"Guardando…":account==="new"?"Crear cuenta":"Guardar acceso"}</Button></form></DialogContent></Dialog>;
}
function PasswordDialog({open,onClose}:{open:boolean;required:boolean;onClose:()=>void;api:any;onSaved:any}){
 return <Dialog open={open} onOpenChange={o=>{if(!o)onClose()}}><DialogContent><DialogHeader><DialogTitle>Perfil de demostración</DialogTitle><DialogDescription>Los accesos de esta muestra son simulados. Podés cerrar el perfil desde el menú y elegir otro en la pantalla de inicio.</DialogDescription></DialogHeader><Button className="primary-button" onClick={onClose}>Continuar recorrido</Button></DialogContent></Dialog>;
}
