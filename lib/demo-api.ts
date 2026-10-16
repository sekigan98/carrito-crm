// Standalone presentation simulator. It never calls a server or persists data.
import {MODULES,type User,type RecordItem,type Module} from "./model";
import {DEMO_USERS,demoRecords} from "./demo-data";
class DemoError extends Error{constructor(message:string,public status=400,public details?:unknown){super(message)}}
const copy=<T,>(value:T):T=>structuredClone(value);
export function createDemoApi(){
  let users=copy(DEMO_USERS),records=demoRecords(),currentId:string|null=null;
  let grants:any[]=[{record_id:"lead-005",user_id:"demo-lucia",granted_by:"demo-admin",expires_at:null,created_at:new Date().toISOString()}],requests:any[]=[],audit:any[]=[],locks:any[]=[];
  const id=()=>crypto.randomUUID(),now=()=>new Date().toISOString();
  const fail=(message:string,status=400,details?:unknown):never=>{throw new DemoError(message,status,details)};
  const user=()=>users.find(u=>u.id===currentId&&u.active)||fail("Elegí un perfil para recorrer la muestra.",401);
  const administrator=()=>{if(user().role!=="admin")fail("En este recorrido la acción corresponde al administrador.",403)};
  const canEdit=(r:RecordItem,u=user())=>u.role==="admin"||r.owner_id===u.id||grants.some(g=>g.record_id===r.id&&g.user_id===u.id&&(!g.expires_at||g.expires_at>Date.now()));
  const row=(rid:string)=>records.find(r=>r.id===rid)||fail("La ficha no está disponible en esta muestra.",404);
  const view=(r:RecordItem)=>{const lock=locks.find(l=>l.record_id===r.id&&l.expires_at>Date.now());return {...copy(r),canEdit:canEdit(r),lockedBy:lock?.user_id||null,lockExpiresAt:lock?.expires_at||null}};
  const recordAudit=(action:string,r?:RecordItem)=>audit.unshift({id:id(),user_id:user().id,user_name:user().name,record_id:r?.id||null,record_title:r?.title||null,action,created_at:now()});
  const session=()=>({user:copy(user()),csrf:"demo-browser-only",demo:true,mailConfigured:false});
  function input(d:any,module:Module){
    if(!Object.prototype.hasOwnProperty.call(MODULES,module))fail("Módulo inválido.");
    const def=MODULES[module],title=String(d.title||"").trim();if(!title)fail("Completá el título.");if(!def.statuses.includes(d.status))fail("Elegí un estado.");
    const data:Record<string,string|number>={};
    for(const f of def.fields){const value=d.data?.[f.key]??"";if(f.required&&!String(value).trim())fail("Completá "+f.label.toLowerCase()+".");if(f.type==="number"&&value!==""){const n=Number(value);if(!Number.isFinite(n)||n<0)fail("Revisá "+f.label.toLowerCase()+".");data[f.key]=n}else data[f.key]=String(value)}
    return {title,status:d.status,data};
  }
  return async function demoApi(path:string,method="GET",value?:unknown):Promise<any>{
    const d=(value||{}) as any;
    if(path==="/config")return {demo:true};
    if(path==="/demo"&&method==="POST"){
      if(!users.some(u=>u.id===d.userId&&u.active))fail("Ese perfil está desactivado. Reiniciá la muestra para restaurarlo.",403);
      currentId=d.userId;return session();
    }
    if(path==="/login")fail("Esta presentación se recorre con los botones de perfiles.");
    const u=user();
    if(path==="/session")return session();
    if(path==="/logout"){locks=locks.filter(l=>l.user_id!==u.id);currentId=null;return {ok:true}}
    if(path==="/password")return {ok:true};
    if(path==="/state")return copy({records:records.map(view),users,grants:grants.filter(g=>!g.expires_at||g.expires_at>Date.now()),requests:requests.filter(r=>r.status==="pending"&&(u.role==="admin"||r.user_id===u.id)),audit:audit.slice(0,100),demo:true,limit:5000});
    if(path==="/records"&&method==="POST"){
      const clean=input(d,d.module),r:RecordItem={id:id(),module:d.module,...clean,owner_id:u.role==="admin"&&d.ownerId?d.ownerId:u.id,version:1,created_at:now(),updated_at:now(),canEdit:true};
      records.unshift(r);recordAudit("Creó una ficha de ejemplo",r);return {id:r.id,version:1};
    }
    const match=path.match(/^\/records\/([^/]+)(?:\/(lock|release|request|grant|owner|send))?$/);
    if(match){
      const r=row(match[1]),action=match[2];
      if(method==="GET"&&!action)return view(r);
      if(action==="request"){
        if(canEdit(r))fail("Ya tenés permiso para editar esta ficha.");if(!String(d.reason||"").trim())fail("Ingresá el motivo.");
        if(!requests.some(q=>q.record_id===r.id&&q.user_id===u.id&&q.status==="pending"))requests.push({id:id(),record_id:r.id,user_id:u.id,reason:d.reason,status:"pending",created_at:now()});
        recordAudit("Solicitó permiso de edición",r);return {ok:true};
      }
      if(action==="grant"){
        administrator();grants=grants.filter(g=>g.record_id!==r.id||g.user_id!==d.userId);
        if(!d.revoke)grants.push({record_id:r.id,user_id:d.userId,granted_by:u.id,expires_at:d.hours===null?null:Date.now()+Number(d.hours||24)*3600000,created_at:now()});
        else locks=locks.filter(l=>l.record_id!==r.id||l.user_id!==d.userId);
        recordAudit(d.revoke?"Revocó permiso de ejemplo":"Otorgó permiso de ejemplo",r);return {ok:true};
      }
      if(action==="owner"){
        administrator();if(r.version!==d.version)fail("Actualizá la ficha antes de asignarla.",409);
        r.owner_id=d.ownerId;r.version++;r.updated_at=now();locks=locks.filter(l=>l.record_id!==r.id);recordAudit("Cambió el responsable",r);return {ok:true,version:r.version};
      }
      if(!canEdit(r))fail("En este recorrido tenés acceso de lectura. Solicitá permiso para editar.",403);
      if(action==="release"){locks=locks.filter(l=>l.record_id!==r.id||l.user_id!==u.id||l.lease_id!==d.leaseId);return {ok:true}}
      if(action==="lock"){
        if(d.force)administrator();const held=locks.find(l=>l.record_id===r.id&&l.expires_at>Date.now());
        if(held&&held.lease_id!==d.leaseId&&!d.force)fail("Otra edición de la muestra está abierta.",423,{lockedBy:held.user_id});
        locks=locks.filter(l=>l.record_id!==r.id);const lease={record_id:r.id,user_id:u.id,lease_id:d.leaseId,expires_at:Date.now()+120000};locks.push(lease);return {leaseId:lease.lease_id,expiresAt:lease.expires_at};
      }
      if(action==="send")fail("La muestra no envía correos.");
      if(method==="PATCH"&&!action){
        if(r.version!==d.version)fail("La ficha de ejemplo cambió. Revisá la versión actual.",409,{record:view(r)});
        if(!locks.some(l=>l.record_id===r.id&&l.user_id===u.id&&l.lease_id===d.leaseId&&l.expires_at>Date.now()))fail("Volvé a abrir la edición de esta ficha.",423);
        Object.assign(r,input(d,r.module),{version:r.version+1,updated_at:now()});locks=locks.filter(l=>l.record_id!==r.id);recordAudit("Editó la ficha de ejemplo",r);return {ok:true,version:r.version};
      }
    }
    const decision=path.match(/^\/requests\/([^/]+)$/);
    if(decision&&method==="POST"){
      administrator();const request=requests.find(q=>q.id===decision[1]&&q.status==="pending");if(!request)fail("Esta solicitud ya fue resuelta.",409);
      request.status=d.status;if(d.status==="approved"){grants=grants.filter(g=>g.record_id!==request.record_id||g.user_id!==request.user_id);grants.push({record_id:request.record_id,user_id:request.user_id,granted_by:u.id,expires_at:Date.now()+86400000,created_at:now()})}
      recordAudit(d.status==="approved"?"Aprobó un permiso de ejemplo":"Rechazó la solicitud",row(request.record_id));return {ok:true};
    }
    if(path==="/users"&&method==="POST"){
      administrator();if(!String(d.name||"").trim())fail("Ingresá un nombre de ejemplo.");if(users.some(v=>v.email===d.email))fail("Ese email ya aparece en la muestra.");
      const created:User={id:id(),name:d.name,email:d.email,role:d.role==="admin"?"admin":"employee",active:1,must_change_password:0};users.push(created);recordAudit("Agregó un empleado de ejemplo");return {id:created.id};
    }
    const account=path.match(/^\/users\/([^/]+)$/);
    if(account&&method==="PATCH"){
      administrator();const target=users.find(v=>v.id===account[1])||fail("Perfil no encontrado.",404);
      if(target.id===u.id&&(d.active===false||d.role==="employee"))fail("Conservá el administrador para continuar el recorrido.");
      Object.assign(target,{name:d.name||target.name,role:d.role||target.role,active:d.active===undefined?target.active:Number(!!d.active)});recordAudit("Actualizó un perfil de ejemplo");return {ok:true};
    }
    fail("Acción no incluida en la muestra.",404);
  };
}
export const demoApi=createDemoApi();
